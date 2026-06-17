"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;
const PORTFOLIO_START = "<!-- dorothy-portfolio:start -->";
const PORTFOLIO_END = "<!-- dorothy-portfolio:end -->";

let portfolioCache = {
  expiresAt: 0,
  payload: null,
};

function userMemoryPath() {
  return process.env.DOROTHY_USER_MEMORY_PATH
    || path.join(os.homedir(), ".openclaw", "workspace", "USER.md");
}

function cleanCell(value) {
  return String(value || "")
    .trim()
    .replace(/^`|`$/g, "")
    .replace(/^\*\*|\*\*$/g, "");
}

function parsePortfolioHoldings(markdown) {
  const start = markdown.indexOf(PORTFOLIO_START);
  const end = markdown.indexOf(PORTFOLIO_END);
  if (start < 0 || end <= start) return [];

  const table = markdown.slice(start + PORTFOLIO_START.length, end);
  const rows = table
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.startsWith("|") && line.endsWith("|"))
    .map(line => line.slice(1, -1).split("|").map(cleanCell));

  return rows
    .filter((row, index) => index > 1 && row.length >= 4)
    .map(([symbol, name, quantity, broker]) => ({
      symbol: symbol.toUpperCase(),
      name: name || symbol.toUpperCase(),
      quantity: Number(String(quantity).replace(",", ".")),
      broker,
    }))
    .filter(holding => (
      /^[A-Z0-9.^=-]{1,20}$/.test(holding.symbol)
      && Number.isFinite(holding.quantity)
      && holding.quantity > 0
      && holding.quantity <= 1_000_000_000
    ));
}

function numberFromText(value) {
  const normalized = String(value ?? "").replace(/[^\d.-]/g, "");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

async function fetchJson(fetchImpl, url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetchImpl(url, {
      headers: {
        accept: "application/json, text/plain, */*",
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Dorothy/3.2",
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`market_http_${response.status}`);
    return response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchYahooQuote(symbol, fetchImpl, now) {
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
  url.searchParams.set("range", "5d");
  url.searchParams.set("interval", "1d");
  url.searchParams.set("includePrePost", "false");
  const payload = await fetchJson(fetchImpl, url);
  const result = payload?.chart?.result?.[0];
  const meta = result?.meta;
  if (!meta || !Number.isFinite(Number(meta.regularMarketPrice))) {
    throw new Error("yahoo_quote_unavailable");
  }

  const closes = (result?.indicators?.quote?.[0]?.close || [])
    .map(Number)
    .filter(Number.isFinite);
  const price = Number(meta.regularMarketPrice);
  const previousClose = closes.length >= 2
    ? closes[closes.length - 2]
    : Number(meta.chartPreviousClose);
  const change = Number.isFinite(previousClose) ? price - previousClose : null;
  const changePercent = change === null || previousClose === 0
    ? null
    : change / previousClose * 100;
  const regular = meta.currentTradingPeriod?.regular;
  const nowSeconds = Math.floor(now.getTime() / 1000);
  const marketStatus = regular && nowSeconds >= regular.start && nowSeconds <= regular.end
    ? "open"
    : "closed";

  return {
    symbol,
    name: meta.longName || meta.shortName || symbol,
    currency: meta.currency || "USD",
    price,
    previousClose: Number.isFinite(previousClose) ? previousClose : null,
    change,
    changePercent,
    marketStatus,
    marketTime: Number(meta.regularMarketTime) > 0
      ? new Date(Number(meta.regularMarketTime) * 1000).toISOString()
      : null,
    provider: "Yahoo Finance",
  };
}

async function fetchNasdaqQuote(symbol, fetchImpl) {
  const url = new URL(`https://api.nasdaq.com/api/quote/${encodeURIComponent(symbol)}/info`);
  url.searchParams.set("assetclass", "stocks");
  const payload = await fetchJson(fetchImpl, url);
  const data = payload?.data;
  const primary = data?.primaryData;
  const price = numberFromText(primary?.lastSalePrice);
  if (!data || price === null) throw new Error("nasdaq_quote_unavailable");

  const change = numberFromText(primary.netChange);
  const changePercent = numberFromText(primary.percentageChange);
  return {
    symbol,
    name: data.companyName || symbol,
    currency: primary.currency || "USD",
    price,
    previousClose: change === null ? null : price - change,
    change,
    changePercent,
    marketStatus: String(data.marketStatus || "").toLowerCase() === "open" ? "open" : "closed",
    marketTime: primary.lastTradeTimestamp || null,
    provider: "Nasdaq",
  };
}

async function fetchMarketQuote(symbol, fetchImpl, now) {
  try {
    return await fetchYahooQuote(symbol, fetchImpl, now);
  } catch (yahooError) {
    try {
      return await fetchNasdaqQuote(symbol, fetchImpl);
    } catch (nasdaqError) {
      throw new Error(`${yahooError.message}; ${nasdaqError.message}`);
    }
  }
}

async function fetchEuroRate(currency, fetchImpl) {
  if (currency === "EUR") return { rate: 1, provider: "native" };

  const url = new URL("https://api.frankfurter.app/latest");
  url.searchParams.set("from", currency);
  url.searchParams.set("to", "EUR");
  try {
    const payload = await fetchJson(fetchImpl, url);
    const rate = Number(payload?.rates?.EUR);
    if (Number.isFinite(rate) && rate > 0) {
      return { rate, provider: "ECB via Frankfurter" };
    }
  } catch {
    // Fall through to the market-data pair below.
  }

  const pair = await fetchYahooQuote(`EUR${currency}=X`, fetchImpl, new Date());
  if (!Number.isFinite(pair.price) || pair.price <= 0) {
    throw new Error("eur_rate_unavailable");
  }
  return { rate: 1 / pair.price, provider: "Yahoo Finance FX" };
}

async function getPortfolioSnapshot(options = {}) {
  const {
    force = false,
    fetchImpl = global.fetch,
    memoryPath = userMemoryPath(),
    now = new Date(),
    cacheTtlMs = DEFAULT_CACHE_TTL_MS,
  } = options;
  const useSharedCache = memoryPath === userMemoryPath() && fetchImpl === global.fetch;

  if (
    useSharedCache
    && !force
    && portfolioCache.payload
    && portfolioCache.expiresAt > now.getTime()
  ) {
    return { ...portfolioCache.payload, cached: true };
  }

  const markdown = fs.readFileSync(memoryPath, "utf8");
  const holdings = parsePortfolioHoldings(markdown);
  const positions = await Promise.all(holdings.map(async holding => {
    try {
      const quote = await fetchMarketQuote(holding.symbol, fetchImpl, now);
      return {
        ...holding,
        ...quote,
        marketValue: holding.quantity * quote.price,
        dayChangeValue: quote.change === null ? null : holding.quantity * quote.change,
      };
    } catch (error) {
      return {
        ...holding,
        quoteError: "Η τρέχουσα τιμή δεν είναι διαθέσιμη.",
      };
    }
  }));

  const currencies = [...new Set(
    positions
      .map(position => position.currency)
      .filter(currency => currency && currency !== "EUR"),
  )];
  const euroRates = {};
  const fxProviders = [];
  await Promise.all(currencies.map(async currency => {
    try {
      const result = await fetchEuroRate(currency, fetchImpl);
      euroRates[currency] = result.rate;
      fxProviders.push(result.provider);
    } catch {
      // Keep native-currency values when conversion is temporarily unavailable.
    }
  }));

  for (const position of positions) {
    const euroRate = position.currency === "EUR" ? 1 : euroRates[position.currency];
    if (!Number.isFinite(euroRate)) continue;
    if (Number.isFinite(position.marketValue)) {
      position.marketValueEur = position.marketValue * euroRate;
    }
    if (Number.isFinite(position.dayChangeValue)) {
      position.dayChangeValueEur = position.dayChangeValue * euroRate;
    }
    position.euroRate = euroRate;
  }

  const totals = Object.values(positions.reduce((byCurrency, position) => {
    if (!Number.isFinite(position.marketValue)) return byCurrency;
    const currency = position.currency || "USD";
    byCurrency[currency] ||= { currency, marketValue: 0, dayChangeValue: 0 };
    byCurrency[currency].marketValue += position.marketValue;
    if (Number.isFinite(position.dayChangeValue)) {
      byCurrency[currency].dayChangeValue += position.dayChangeValue;
    }
    return byCurrency;
  }, {}));
  const euroTotal = positions.reduce((total, position) => {
    if (Number.isFinite(position.marketValueEur)) {
      total.marketValue += position.marketValueEur;
    }
    if (Number.isFinite(position.dayChangeValueEur)) {
      total.dayChangeValue += position.dayChangeValueEur;
    }
    return total;
  }, { currency: "EUR", marketValue: 0, dayChangeValue: 0 });
  const hasEuroTotal = positions.some(position => Number.isFinite(position.marketValueEur));

  const providers = [...new Set(positions.map(position => position.provider).filter(Boolean))];
  const payload = {
    ok: true,
    cached: false,
    positions,
    totals,
    euroTotal: hasEuroTotal ? euroTotal : null,
    asOf: now.toISOString(),
    providers,
    fxProviders: [...new Set(fxProviders)],
    note: "Οι θέσεις προέρχονται από τη μνήμη της Dorothy. Οι τιμές αγοράς μπορεί να έχουν καθυστέρηση.",
  };

  if (useSharedCache) {
    portfolioCache = {
      expiresAt: now.getTime() + cacheTtlMs,
      payload,
    };
  }
  return payload;
}

function resetPortfolioCache() {
  portfolioCache = { expiresAt: 0, payload: null };
}

module.exports = {
  getPortfolioSnapshot,
  parsePortfolioHoldings,
  resetPortfolioCache,
};
