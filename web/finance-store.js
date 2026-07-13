"use strict";

const os = require("os");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");
const demoData = require("./demo-data.js");

const DEFAULT_DATABASE_PATH = path.join(os.homedir(), ".openclaw", "data", "dorothy-finance.sqlite");
const CATEGORY_LABELS = {
  hosting: "Hosting",
  domain: "Domains",
  ssl: "SSL",
  email: "Email",
  maintenance: "Maintenance",
  web_design: "Web design",
  marketing: "Marketing",
  other: "Other",
  unclassified: "Unclassified",
};
const EXPENSE_MAP = {
  hosting_cost: "hosting",
  domain_cost: "domain",
  google_ads: "marketing",
  meta_ads: "marketing",
};
const DEFAULT_MARGINS = {
  hosting: 0.85,
  domain: 0.35,
  ssl: 0.50,
  email: 0.75,
  maintenance: 0.95,
  web_design: 0.95,
  marketing: 0.20,
  other: 0.80,
  unclassified: 0.80,
};

function money(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function category(value) {
  return String(value || "other").trim().toLowerCase() || "other";
}

function openDatabase(databasePath) {
  return new DatabaseSync(databasePath || process.env.DOROTHY_FINANCE_DB || DEFAULT_DATABASE_PATH, {
    readOnly: true,
  });
}

function tableExists(db, table) {
  return Boolean(db.prepare(`
    SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?
  `).get(table));
}

function revenueSource(db) {
  const hasElorus = tableExists(db, "elorus_invoices")
    && tableExists(db, "elorus_invoice_items")
    && tableExists(db, "finance_sync_runs")
    && db.prepare(`
      SELECT 1 FROM finance_sync_runs
      WHERE source = 'elorus' AND status = 'success'
      ORDER BY finished_at DESC LIMIT 1
    `).get();
  return hasElorus
    ? {
      kind: "elorus_live_snapshot",
      invoiceTable: "elorus_invoices",
      itemTable: "elorus_invoice_items",
      activeFilter: "i.draft = 0 AND i.status <> 'void' AND i.currency = 'EUR'",
    }
    : {
      kind: "legacy_mydash_snapshot",
      invoiceTable: "invoices",
      itemTable: "invoice_items",
      activeFilter: "1 = 1",
    };
}

function syncStatus(db, source = revenueSource(db)) {
  if (source.kind !== "elorus_live_snapshot") {
    return {
      revenueSource: source.kind,
      costSource: "legacy_mydash_snapshot",
      lastSyncedAt: null,
    };
  }
  const row = db.prepare(`
    SELECT finished_at, list_count, details_fetched, items_upserted
    FROM finance_sync_runs
    WHERE source = 'elorus' AND status = 'success'
    ORDER BY finished_at DESC LIMIT 1
  `).get() || {};
  return {
    revenueSource: source.kind,
    costSource: "legacy_mydash_snapshot",
    lastSyncedAt: row.finished_at || null,
    invoiceCount: Number(row.list_count || 0),
    detailsFetched: Number(row.details_fetched || 0),
    itemsUpserted: Number(row.items_upserted || 0),
  };
}

function filter(alias, month) {
  return month
    ? `CAST(strftime('%Y', ${alias}) AS INTEGER) = ? AND CAST(strftime('%m', ${alias}) AS INTEGER) = ?`
    : `CAST(strftime('%Y', ${alias}) AS INTEGER) = ?`;
}

function args(year, month) {
  return month ? [year, month] : [year];
}

function availableYears(db, source = revenueSource(db)) {
  return db.prepare(`
    SELECT DISTINCT CAST(strftime('%Y', issue_date) AS INTEGER) AS year
    FROM ${source.invoiceTable} i
    WHERE issue_date IS NOT NULL AND ${source.activeFilter}
    ORDER BY year
  `).all().map(row => Number(row.year));
}

function marginRules(db) {
  const result = { ...DEFAULT_MARGINS };
  for (const row of db.prepare("SELECT category, margin_ratio FROM margin_rules").all()) {
    result[category(row.category)] = Number(row.margin_ratio);
  }
  return result;
}

function calculate(db, year, month, source = revenueSource(db)) {
  const values = args(year, month);
  const invoice = db.prepare(`
    SELECT COALESCE(SUM(net_total), 0) AS revenue, COUNT(*) AS invoiceCount
    FROM ${source.invoiceTable} i
    WHERE issue_date IS NOT NULL AND ${source.activeFilter}
      AND ${filter("issue_date", month)}
  `).get(...values);
  const revenue = Number(invoice.revenue);
  const categoryRows = db.prepare(`
    SELECT COALESCE(NULLIF(TRIM(ii.category), ''), 'other') AS category,
      COALESCE(SUM(ii.net_total), 0) AS revenue, COUNT(DISTINCT i.id) AS invoiceCount
    FROM ${source.itemTable} ii
    JOIN ${source.invoiceTable} i ON i.id = ii.invoice_id
    WHERE i.issue_date IS NOT NULL AND ${source.activeFilter}
      AND ${filter("i.issue_date", month)}
    GROUP BY COALESCE(NULLIF(TRIM(ii.category), ''), 'other')
  `).all(...values);

  const actualCosts = new Map();
  for (const row of db.prepare(`
    SELECT category, COALESCE(SUM(amount_net), 0) AS cost
    FROM expenses
    WHERE expense_type = 'client_cost' AND expense_date IS NOT NULL
      AND ${filter("expense_date", month)}
    GROUP BY category
  `).all(...values)) {
    const source = category(row.category);
    const target = EXPENSE_MAP[source] || source;
    actualCosts.set(target, (actualCosts.get(target) || 0) + Number(row.cost));
  }

  const rules = marginRules(db);
  const itemRevenue = categoryRows.reduce((sum, row) => sum + Number(row.revenue), 0);
  const unclassifiedRevenue = money(revenue - itemRevenue);
  if (Math.abs(unclassifiedRevenue) > 0.005) {
    categoryRows.push({ category: "unclassified", revenue: unclassifiedRevenue, invoiceCount: 0 });
  }

  const known = new Set(categoryRows.map(row => category(row.category)));
  for (const name of actualCosts.keys()) {
    if (!known.has(name)) categoryRows.push({ category: name, revenue: 0, invoiceCount: 0 });
  }

  const categories = categoryRows.map(row => {
    const name = category(row.category);
    const catRevenue = Number(row.revenue);
    const actual = actualCosts.has(name);
    const cost = actual
      ? actualCosts.get(name)
      : Math.max(0, catRevenue * (1 - (rules[name] ?? DEFAULT_MARGINS.other)));
    const profit = catRevenue - cost;
    return {
      category: name,
      label: CATEGORY_LABELS[name] || name,
      revenue: money(catRevenue),
      cost: money(cost),
      profit: money(profit),
      marginPercent: catRevenue ? money(profit / catRevenue * 100) : 0,
      costSource: actual ? "actual_category_cost" : "estimated_margin",
    };
  }).sort((a, b) => b.revenue - a.revenue);

  const directCostsActual = categories
    .filter(row => row.costSource === "actual_category_cost")
    .reduce((sum, row) => sum + row.cost, 0);
  const directCostsEstimated = categories
    .filter(row => row.costSource === "estimated_margin")
    .reduce((sum, row) => sum + row.cost, 0);
  const overhead = db.prepare(`
    SELECT COALESCE(NULLIF(TRIM(category), ''), 'other_overhead') AS category,
      COALESCE(SUM(amount_net), 0) AS amount
    FROM expenses
    WHERE expense_type IN ('overhead', 'tax') AND expense_date IS NOT NULL
      AND ${filter("expense_date", month)}
    GROUP BY COALESCE(NULLIF(TRIM(category), ''), 'other_overhead')
  `).all(...values);
  const taxVatCashOutflows = overhead
    .filter(row => category(row.category) === "tax_payment")
    .reduce((sum, row) => sum + Number(row.amount), 0);
  const operatingExpenses = overhead
    .filter(row => category(row.category) !== "tax_payment")
    .reduce((sum, row) => sum + Number(row.amount), 0);
  const directCosts = directCostsActual + directCostsEstimated;
  const grossProfit = revenue - directCosts;
  const operatingResult = grossProfit - operatingExpenses;
  const actualCoveredRevenue = categories
    .filter(row => row.costSource === "actual_category_cost")
    .reduce((sum, row) => sum + Math.max(0, row.revenue), 0);

  return {
    year,
    month: month || null,
    invoiceCount: Number(invoice.invoiceCount),
    revenue: money(revenue),
    directCosts: money(directCosts),
    directCostsActual: money(directCostsActual),
    directCostsEstimated: money(directCostsEstimated),
    grossProfit: money(grossProfit),
    grossMarginPercent: revenue ? money(grossProfit / revenue * 100) : 0,
    operatingExpenses: money(operatingExpenses),
    operatingResult: money(operatingResult),
    operatingMarginPercent: revenue ? money(operatingResult / revenue * 100) : 0,
    taxVatCashOutflows: money(taxVatCashOutflows),
    categories,
    coverage: {
      invoiceItemPercent: revenue ? money(Math.min(100, Math.max(0, itemRevenue / revenue * 100))) : 100,
      actualCostRevenuePercent: revenue ? money(Math.min(100, Math.max(0, actualCoveredRevenue / revenue * 100))) : 0,
      unclassifiedRevenue,
    },
    sources: syncStatus(db, source),
  };
}

function dateOnly(date) {
  return date.toISOString().slice(0, 10);
}

function shifted(date, days) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function getRenewals(options = {}, databasePath) {
  if (demoData.DEMO_MODE) return demoData.demoFinanceOverview().renewals;
  const db = openDatabase(databasePath);
  try {
    const now = options.now || new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const horizonDays = Math.min(Math.max(Number(options.days || 90), 1), 365);
    const todayIso = dateOnly(today);
    const recentOverdueIso = dateOnly(shifted(today, -60));
    const freshness = new Date(today);
    freshness.setUTCMonth(freshness.getUTCMonth() - 18);
    const freshnessIso = dateOnly(freshness);
    const horizonIso = dateOnly(shifted(today, horizonDays));
    const counts = { upcoming: 0, overdue: 0, future: 0, stale: 0, undated: 0, cancelled: 0 };

    const all = db.prepare(`
      SELECT rs.id, rs.service_name, rs.category, rs.period, rs.unit_price,
        rs.last_invoiced_date, rs.next_renewal_date, rs.active, c.name AS client
      FROM recurring_services rs JOIN clients c ON c.id = rs.client_id
    `).all().map(row => {
      const next = row.next_renewal_date ? String(row.next_renewal_date) : "";
      const last = row.last_invoiced_date ? String(row.last_invoiced_date) : "";
      let status = "future";
      if (Number(row.active) !== 1) status = "cancelled";
      else if (!next) status = "undated";
      else if (next < recentOverdueIso || (next < todayIso && (!last || last < freshnessIso))) status = "stale";
      else if (next < todayIso) status = "overdue";
      else if (next <= horizonIso) status = "upcoming";
      counts[status] += 1;
      return {
        id: Number(row.id),
        client: String(row.client || ""),
        service: String(row.service_name || ""),
        category: category(row.category),
        amountNet: money(row.unit_price),
        nextRenewalDate: next || null,
        daysUntil: next
          ? Math.round((Date.parse(`${next}T00:00:00Z`) - today.getTime()) / 86400000)
          : null,
        status,
        confidence: status === "stale" || status === "undated"
          ? "low"
          : last && last >= freshnessIso ? "high" : "medium",
      };
    });

    const rows = all
      .filter(row => row.status === "upcoming" || row.status === "overdue")
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === "upcoming" ? -1 : 1;
        return a.status === "overdue"
          ? String(b.nextRenewalDate).localeCompare(String(a.nextRenewalDate))
          : String(a.nextRenewalDate).localeCompare(String(b.nextRenewalDate));
      })
      .slice(0, Math.min(Math.max(Number(options.limit || 8), 1), 100));
    return {
      asOf: todayIso,
      horizonDays,
      count: rows.length,
      rows,
      statusCounts: counts,
      totalRows: all.length,
    };
  } finally {
    db.close();
  }
}

function getOverview(options = {}, databasePath) {
  if (demoData.DEMO_MODE) return demoData.demoFinanceOverview();
  const db = openDatabase(databasePath);
  try {
    const source = revenueSource(db);
    const years = availableYears(db, source);
    const latest = years[years.length - 1] || new Date().getFullYear();
    const year = Number(options.year || latest);
    if (!years.includes(year)) throw new Error("invalid_year");
    const summary = calculate(db, year, undefined, source);
    const yearly = years.map(value => {
      const row = calculate(db, value, undefined, source);
      return { year: value, revenue: row.revenue, operatingResult: row.operatingResult };
    });
    const monthly = Array.from({ length: 12 }, (_, index) => {
      const row = calculate(db, year, index + 1, source);
      return { month: index + 1, revenue: row.revenue, operatingResult: row.operatingResult };
    });
    const renewals = getRenewals({ days: options.renewalDays || 90, limit: 8 }, databasePath);
    return {
      ok: true,
      scope: "managerial_estimate",
      accountingStatement: false,
      generatedAt: new Date().toISOString(),
      years,
      summary,
      yearly,
      monthly,
      renewals,
      sources: syncStatus(db, source),
    };
  } finally {
    db.close();
  }
}

module.exports = {
  getOverview,
  getRenewals,
  getSyncStatus(databasePath) {
    const db = openDatabase(databasePath);
    try {
      return syncStatus(db);
    } finally {
      db.close();
    }
  },
};
