"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  getPortfolioSnapshot,
  parsePortfolioHoldings,
} = require("../portfolio-store.js");

const MEMORY = `
## Οικονομικά / Holdings

<!-- dorothy-portfolio:start -->
| Ticker | Company | Quantity | Broker |
| --- | --- | ---: | --- |
| AAPL | Apple | 150 | Eurobank Equities |
<!-- dorothy-portfolio:end -->
`;

test("parses the structured portfolio block from Dorothy memory", () => {
  assert.deepEqual(parsePortfolioHoldings(MEMORY), [{
    symbol: "AAPL",
    name: "Apple",
    quantity: 150,
    broker: "Eurobank Equities",
  }]);
});

test("ignores invalid or unstructured holdings", () => {
  assert.deepEqual(parsePortfolioHoldings("150 Apple shares"), []);
  assert.deepEqual(parsePortfolioHoldings(`
    <!-- dorothy-portfolio:start -->
    | Ticker | Company | Quantity | Broker |
    | --- | --- | ---: | --- |
    | BAD SYMBOL | Invalid | -3 | Unknown |
    <!-- dorothy-portfolio:end -->
  `), []);
});

test("builds portfolio value and daily change from market data", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dorothy-portfolio-"));
  const memoryPath = path.join(directory, "USER.md");
  fs.writeFileSync(memoryPath, MEMORY);
  const fetchImpl = async url => {
    if (String(url).includes("frankfurter")) {
      return {
        ok: true,
        async json() {
          return { rates: { EUR: 0.86 } };
        },
      };
    }
    assert.match(String(url), /query1\.finance\.yahoo\.com/);
    return {
      ok: true,
      async json() {
        return {
          chart: {
            result: [{
              meta: {
                currency: "USD",
                regularMarketPrice: 210,
                regularMarketTime: 1781294401,
                longName: "Apple Inc.",
                currentTradingPeriod: {
                  regular: { start: 1781271000, end: 1781294400 },
                },
              },
              indicators: {
                quote: [{ close: [200, 210] }],
              },
            }],
          },
        };
      },
    };
  };

  try {
    const result = await getPortfolioSnapshot({
      memoryPath,
      fetchImpl,
      now: new Date("2026-06-14T12:00:00Z"),
    });
    assert.equal(result.positions[0].marketValue, 31_500);
    assert.equal(result.positions[0].dayChangeValue, 1_500);
    assert.equal(result.positions[0].marketValueEur, 27_090);
    assert.equal(result.positions[0].dayChangeValueEur, 1_290);
    assert.deepEqual(result.totals, [{
      currency: "USD",
      marketValue: 31_500,
      dayChangeValue: 1_500,
    }]);
    assert.deepEqual(result.euroTotal, {
      currency: "EUR",
      marketValue: 27_090,
      dayChangeValue: 1_290,
    });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("falls back to Nasdaq when Yahoo is unavailable", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dorothy-portfolio-"));
  const memoryPath = path.join(directory, "USER.md");
  fs.writeFileSync(memoryPath, MEMORY);
  const fetchImpl = async url => {
    if (String(url).includes("frankfurter")) {
      return {
        ok: true,
        async json() {
          return { rates: { EUR: 0.85 } };
        },
      };
    }
    if (String(url).includes("yahoo")) return { ok: false, status: 429 };
    return {
      ok: true,
      async json() {
        return {
          data: {
            companyName: "Apple Inc.",
            marketStatus: "Closed",
            primaryData: {
              lastSalePrice: "$205.00",
              netChange: "-5.00",
              percentageChange: "-2.38%",
              lastTradeTimestamp: "Jun 12, 2026",
            },
          },
        };
      },
    };
  };

  try {
    const result = await getPortfolioSnapshot({ memoryPath, fetchImpl });
    assert.equal(result.positions[0].provider, "Nasdaq");
    assert.equal(result.positions[0].marketValue, 30_750);
    assert.equal(result.positions[0].dayChangeValue, -750);
    assert.equal(result.positions[0].marketValueEur, 26_137.5);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("finance UI and authenticated endpoint include portfolio integration", () => {
  const root = path.join(__dirname, "..");
  const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
  const html = fs.readFileSync(path.join(root, "public", "index.html"), "utf8");
  const app = fs.readFileSync(path.join(root, "public", "app.js"), "utf8");

  assert.match(server, /\/api\/finance\/portfolio/);
  assert.match(server, /if \(!authorized\(req\)\)/);
  assert.match(html, /id="portfolioTotalValue"/);
  assert.match(html, /id="portfolioPositions"/);
  assert.ok(
    html.indexOf('class="bank-metrics"') < html.indexOf('class="portfolio-section"')
      && html.indexOf('class="portfolio-section"') < html.indexOf('class="banking-grid"'),
    "portfolio must appear directly below the banking summary and before detailed bank activity",
  );
  assert.match(app, /renderPortfolio\(state\.portfolioData\)/);
  const showChat = app.slice(
    app.indexOf("async function showChat()"),
    app.indexOf("async function validateAndEnter"),
  );
  assert.ok(
    showChat.indexOf("window.DorothyFeatures.showInitialView()") < showChat.indexOf("await loadChatModes()"),
    "initial workspace selection must run before slow startup work can race with navigation",
  );
});
