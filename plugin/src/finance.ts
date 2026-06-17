import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export const FINANCE_PROFITABILITY_LIMIT_MAX = 100;
export const FINANCE_RENEWAL_LIMIT_MAX = 100;
export const FINANCE_RENEWAL_DAYS_MAX = 365;

const DEFAULT_DATABASE_PATH = path.join(os.homedir(), ".openclaw", "data", "dorothy-finance.sqlite");
const CATEGORY_LABELS: Record<string, string> = {
  hosting: "Hosting",
  domain: "Domains",
  ssl: "SSL",
  email: "Email",
  maintenance: "Maintenance",
  web_design: "Web design",
  marketing: "Marketing",
  other: "Λοιπά",
  unclassified: "Χωρίς ανάλυση γραμμών",
};
const EXPENSE_CATEGORY_MAP: Record<string, string> = {
  hosting_cost: "hosting",
  domain_cost: "domain",
  google_ads: "marketing",
  meta_ads: "marketing",
};
const DEFAULT_MARGINS: Record<string, number> = {
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

type JsonRow = Record<string, unknown>;
type RevenueSource = {
  kind: "elorus_live_snapshot" | "legacy_mydash_snapshot";
  invoiceTable: "elorus_invoices" | "invoices";
  itemTable: "elorus_invoice_items" | "invoice_items";
  activeFilter: string;
  clientJoin: string;
  clientExpression: string;
  serviceExpression: string;
};

export type FinancePeriodInput = {
  year?: number;
  month?: number;
};

export type FinanceProfitabilityInput = FinancePeriodInput & {
  groupBy?: "category" | "client" | "service";
  query?: string;
  limit?: number;
};

export type FinanceRenewalsInput = {
  days?: number;
  query?: string;
  category?: string;
  status?: "actionable" | "upcoming" | "overdue" | "future" | "stale" | "undated" | "all";
  limit?: number;
};

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function asNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function boundedInteger(value: number | undefined, fallback: number, maximum: number) {
  return Math.min(Math.max(Math.floor(value ?? fallback), 1), maximum);
}

function validatePeriod(input: FinancePeriodInput, fallbackYear: number) {
  const year = input.year === undefined ? fallbackYear : Math.floor(input.year);
  if (year < 2000 || year > 2100) throw new Error("invalid_year");
  const month = input.month === undefined ? undefined : Math.floor(input.month);
  if (month !== undefined && (month < 1 || month > 12)) throw new Error("invalid_month");
  return { year, month };
}

function normalizeCategory(value: unknown) {
  const category = String(value || "other").trim().toLowerCase();
  return category || "other";
}

function safeFailure(error: unknown) {
  const message = error instanceof Error ? error.message : "finance_unavailable";
  const known = new Set(["invalid_year", "invalid_month", "finance_database_missing"]);
  return {
    ok: false,
    readOnly: true,
    onDemand: true,
    automaticDelivery: false,
    error: known.has(message) ? message : "finance_unavailable",
  };
}

function openDatabase(databasePath?: string) {
  try {
    return new DatabaseSync(databasePath || process.env.DOROTHY_FINANCE_DB || DEFAULT_DATABASE_PATH, {
      readOnly: true,
    });
  } catch {
    throw new Error("finance_database_missing");
  }
}

function tableExists(db: DatabaseSync, table: string) {
  return Boolean(db.prepare(`
    SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?
  `).get(table));
}

function getRevenueSource(db: DatabaseSync): RevenueSource {
  const hasElorusTables = tableExists(db, "elorus_invoices")
    && tableExists(db, "elorus_invoice_items")
    && tableExists(db, "finance_sync_runs");
  const successfulSync = hasElorusTables
    ? db.prepare(`
      SELECT 1 FROM finance_sync_runs
      WHERE source = 'elorus' AND status = 'success'
      ORDER BY finished_at DESC LIMIT 1
    `).get()
    : undefined;
  if (successfulSync) {
    return {
      kind: "elorus_live_snapshot",
      invoiceTable: "elorus_invoices",
      itemTable: "elorus_invoice_items",
      activeFilter: "i.draft = 0 AND i.status <> 'void' AND i.currency = 'EUR'",
      clientJoin: "",
      clientExpression: "COALESCE(NULLIF(TRIM(i.client_name), ''), 'Άγνωστος πελάτης')",
      serviceExpression: `COALESCE(
        NULLIF(TRIM(COALESCE(ii.title, '') ||
          CASE WHEN COALESCE(ii.description, '') = '' THEN '' ELSE ' · ' || ii.description END), ''),
        'Χωρίς περιγραφή'
      )`,
    };
  }
  return {
    kind: "legacy_mydash_snapshot",
    invoiceTable: "invoices",
    itemTable: "invoice_items",
    activeFilter: "1 = 1",
    clientJoin: "JOIN clients c ON c.id = i.client_id",
    clientExpression: "c.name",
    serviceExpression: "COALESCE(NULLIF(TRIM(ii.description), ''), 'Χωρίς περιγραφή')",
  };
}

function getSyncStatus(db: DatabaseSync, source: RevenueSource) {
  if (source.kind !== "elorus_live_snapshot") {
    return {
      revenueSource: source.kind,
      costSource: "legacy_mydash_snapshot",
      lastSyncedAt: null,
      invoiceCount: null,
    };
  }
  const row = db.prepare(`
    SELECT finished_at, list_count, details_fetched, items_upserted
    FROM finance_sync_runs
    WHERE source = 'elorus' AND status = 'success'
    ORDER BY finished_at DESC LIMIT 1
  `).get() as JsonRow | undefined;
  return {
    revenueSource: source.kind,
    costSource: "legacy_mydash_snapshot",
    lastSyncedAt: row?.finished_at ? String(row.finished_at) : null,
    invoiceCount: asNumber(row?.list_count),
    detailsFetched: asNumber(row?.details_fetched),
    itemsUpserted: asNumber(row?.items_upserted),
  };
}

function dateFilter(alias: string, month?: number) {
  return month === undefined
    ? `CAST(strftime('%Y', ${alias}) AS INTEGER) = ?`
    : `CAST(strftime('%Y', ${alias}) AS INTEGER) = ? AND CAST(strftime('%m', ${alias}) AS INTEGER) = ?`;
}

function periodArgs(year: number, month?: number) {
  return month === undefined ? [year] : [year, month];
}

function getAvailableYears(db: DatabaseSync, source = getRevenueSource(db)) {
  return (db.prepare(`
    SELECT DISTINCT CAST(strftime('%Y', issue_date) AS INTEGER) AS year
    FROM ${source.invoiceTable} i
    WHERE issue_date IS NOT NULL AND ${source.activeFilter}
    ORDER BY year
  `).all() as JsonRow[]).map((row) => asNumber(row.year));
}

function getLatestYear(db: DatabaseSync, source = getRevenueSource(db)) {
  const row = db.prepare(`
    SELECT MAX(CAST(strftime('%Y', issue_date) AS INTEGER)) AS year
    FROM ${source.invoiceTable} i
    WHERE issue_date IS NOT NULL AND ${source.activeFilter}
  `).get() as JsonRow | undefined;
  return asNumber(row?.year) || new Date().getFullYear();
}

function getMarginRules(db: DatabaseSync) {
  const rules = { ...DEFAULT_MARGINS };
  for (const row of db.prepare("SELECT category, margin_ratio FROM margin_rules").all() as JsonRow[]) {
    rules[normalizeCategory(row.category)] = asNumber(row.margin_ratio);
  }
  return rules;
}

function calculatePeriod(
  db: DatabaseSync,
  year: number,
  month?: number,
  source = getRevenueSource(db),
) {
  const args = periodArgs(year, month);
  const invoiceRow = db.prepare(`
    SELECT
      COALESCE(SUM(net_total), 0) AS revenue,
      COUNT(*) AS invoice_count
    FROM ${source.invoiceTable} i
    WHERE issue_date IS NOT NULL AND ${source.activeFilter}
      AND ${dateFilter("issue_date", month)}
  `).get(...args) as JsonRow;
  const revenue = asNumber(invoiceRow.revenue);

  const categoryRows = db.prepare(`
    SELECT
      COALESCE(NULLIF(TRIM(ii.category), ''), 'other') AS category,
      COALESCE(SUM(ii.net_total), 0) AS revenue,
      COUNT(DISTINCT i.id) AS invoice_count
    FROM ${source.itemTable} ii
    JOIN ${source.invoiceTable} i ON i.id = ii.invoice_id
    WHERE i.issue_date IS NOT NULL AND ${source.activeFilter}
      AND ${dateFilter("i.issue_date", month)}
    GROUP BY COALESCE(NULLIF(TRIM(ii.category), ''), 'other')
  `).all(...args) as JsonRow[];

  const directCosts = new Map<string, number>();
  for (const row of db.prepare(`
    SELECT category, COALESCE(SUM(amount_net), 0) AS cost
    FROM expenses
    WHERE expense_type = 'client_cost'
      AND expense_date IS NOT NULL
      AND ${dateFilter("expense_date", month)}
    GROUP BY category
  `).all(...args) as JsonRow[]) {
    const sourceCategory = normalizeCategory(row.category);
    const category = EXPENSE_CATEGORY_MAP[sourceCategory] || sourceCategory;
    directCosts.set(category, (directCosts.get(category) || 0) + asNumber(row.cost));
  }

  const margins = getMarginRules(db);
  const itemRevenue = categoryRows.reduce((sum, row) => sum + asNumber(row.revenue), 0);
  const unclassifiedRevenue = roundMoney(revenue - itemRevenue);
  if (Math.abs(unclassifiedRevenue) > 0.005) {
    categoryRows.push({
      category: "unclassified",
      revenue: unclassifiedRevenue,
      invoice_count: 0,
    });
  }

  const knownCategories = new Set(categoryRows.map((row) => normalizeCategory(row.category)));
  for (const category of directCosts.keys()) {
    if (!knownCategories.has(category)) categoryRows.push({ category, revenue: 0, invoice_count: 0 });
  }

  const categories = categoryRows.map((row) => {
    const category = normalizeCategory(row.category);
    const categoryRevenue = asNumber(row.revenue);
    const hasActualCost = directCosts.has(category);
    const cost = hasActualCost
      ? directCosts.get(category) || 0
      : Math.max(0, categoryRevenue * (1 - (margins[category] ?? DEFAULT_MARGINS.other)));
    const profit = categoryRevenue - cost;
    return {
      category,
      label: CATEGORY_LABELS[category] || category,
      revenue: roundMoney(categoryRevenue),
      cost: roundMoney(cost),
      profit: roundMoney(profit),
      marginPercent: categoryRevenue ? roundMoney((profit / categoryRevenue) * 100) : 0,
      invoiceCount: asNumber(row.invoice_count),
      costSource: hasActualCost ? "actual_category_cost" : "estimated_margin",
    };
  }).sort((left, right) => right.revenue - left.revenue);

  const directCostsActual = categories
    .filter((row) => row.costSource === "actual_category_cost")
    .reduce((sum, row) => sum + row.cost, 0);
  const directCostsEstimated = categories
    .filter((row) => row.costSource === "estimated_margin")
    .reduce((sum, row) => sum + row.cost, 0);

  const overheadRows = db.prepare(`
    SELECT
      COALESCE(NULLIF(TRIM(category), ''), 'other_overhead') AS category,
      COALESCE(SUM(amount_net), 0) AS amount
    FROM expenses
    WHERE expense_type IN ('overhead', 'tax')
      AND expense_date IS NOT NULL
      AND ${dateFilter("expense_date", month)}
    GROUP BY COALESCE(NULLIF(TRIM(category), ''), 'other_overhead')
  `).all(...args) as JsonRow[];
  const taxVatCashOutflows = overheadRows
    .filter((row) => normalizeCategory(row.category) === "tax_payment")
    .reduce((sum, row) => sum + asNumber(row.amount), 0);
  const operatingExpenses = overheadRows
    .filter((row) => normalizeCategory(row.category) !== "tax_payment")
    .reduce((sum, row) => sum + asNumber(row.amount), 0);

  const totalDirectCosts = directCostsActual + directCostsEstimated;
  const grossProfit = revenue - totalDirectCosts;
  const operatingResult = grossProfit - operatingExpenses;
  const actualCoveredRevenue = categories
    .filter((row) => row.costSource === "actual_category_cost")
    .reduce((sum, row) => sum + Math.max(0, row.revenue), 0);

  return {
    year,
    month: month || null,
    invoiceCount: asNumber(invoiceRow.invoice_count),
    revenue: roundMoney(revenue),
    directCosts: roundMoney(totalDirectCosts),
    directCostsActual: roundMoney(directCostsActual),
    directCostsEstimated: roundMoney(directCostsEstimated),
    grossProfit: roundMoney(grossProfit),
    grossMarginPercent: revenue ? roundMoney((grossProfit / revenue) * 100) : 0,
    operatingExpenses: roundMoney(operatingExpenses),
    operatingResult: roundMoney(operatingResult),
    operatingMarginPercent: revenue ? roundMoney((operatingResult / revenue) * 100) : 0,
    taxVatCashOutflows: roundMoney(taxVatCashOutflows),
    categories,
    coverage: {
      itemRevenue: roundMoney(itemRevenue),
      unclassifiedRevenue,
      invoiceItemPercent: revenue ? roundMoney(Math.min(100, Math.max(0, itemRevenue / revenue * 100))) : 100,
      actualCostRevenuePercent: revenue ? roundMoney(Math.min(100, Math.max(0, actualCoveredRevenue / revenue * 100))) : 0,
    },
    sources: getSyncStatus(db, source),
  };
}

export async function readFinancePnl(
  input: FinancePeriodInput = {},
  databasePath?: string,
): Promise<Record<string, unknown>> {
  let db: DatabaseSync | undefined;
  try {
    db = openDatabase(databasePath);
    const source = getRevenueSource(db);
    const period = validatePeriod(input, getLatestYear(db, source));
    const summary = calculatePeriod(db, period.year, period.month, source);
    const years = getAvailableYears(db, source);
    const yearly = years.map((year) => {
      const row = calculatePeriod(db!, year, undefined, source);
      return {
        year,
        revenue: row.revenue,
        operatingResult: row.operatingResult,
        directCosts: row.directCosts,
      };
    });
    const monthly = period.month === undefined
      ? Array.from({ length: 12 }, (_, index) => {
        const row = calculatePeriod(db!, period.year, index + 1, source);
        return {
          month: index + 1,
          revenue: row.revenue,
          operatingResult: row.operatingResult,
        };
      })
      : [];

    const warnings: string[] = [];
    if (summary.coverage.unclassifiedRevenue > 0.005) {
      warnings.push("Some invoice revenue has no line-item breakdown and is shown as unclassified.");
    }
    if (summary.directCostsEstimated > 0.005) {
      warnings.push("Some direct costs are estimates based on fallback category margins.");
    }
    warnings.push("Tax/VAT cash outflows are shown separately and are not deducted from operating result.");

    return {
      ok: true,
      readOnly: true,
      onDemand: true,
      automaticDelivery: false,
      accountingStatement: false,
      scope: "managerial_estimate",
      availableYears: years,
      summary,
      yearly,
      monthly,
      sources: getSyncStatus(db, source),
      warnings,
    };
  } catch (error) {
    return safeFailure(error);
  } finally {
    db?.close();
  }
}

export async function readFinanceProfitability(
  input: FinanceProfitabilityInput = {},
  databasePath?: string,
): Promise<Record<string, unknown>> {
  let db: DatabaseSync | undefined;
  try {
    db = openDatabase(databasePath);
    const source = getRevenueSource(db);
    const period = validatePeriod(input, getLatestYear(db, source));
    const groupBy = input.groupBy || "category";
    const limit = boundedInteger(input.limit, 20, FINANCE_PROFITABILITY_LIMIT_MAX);
    const summary = calculatePeriod(db, period.year, period.month, source);

    if (groupBy === "category") {
      const query = input.query?.trim().toLowerCase();
      const rows = summary.categories
        .filter((row) => !query || `${row.category} ${row.label}`.toLowerCase().includes(query))
        .slice(0, limit);
      return {
        ok: true,
        readOnly: true,
        scope: "managerial_estimate",
        accountingStatement: false,
        groupBy,
        year: period.year,
        month: period.month || null,
        count: rows.length,
        rows,
        coverage: summary.coverage,
      };
    }

    const args = periodArgs(period.year, period.month);
    const query = input.query?.trim().toLowerCase();
    const rawRows = db.prepare(`
      SELECT
        ${source.clientExpression} AS client,
        ${source.serviceExpression} AS service,
        COALESCE(NULLIF(TRIM(ii.category), ''), 'other') AS category,
        COALESCE(SUM(ii.net_total), 0) AS revenue
      FROM ${source.itemTable} ii
      JOIN ${source.invoiceTable} i ON i.id = ii.invoice_id
      ${source.clientJoin}
      WHERE i.issue_date IS NOT NULL AND ${source.activeFilter}
        AND ${dateFilter("i.issue_date", period.month)}
      GROUP BY ${source.clientExpression}, ${source.serviceExpression},
        COALESCE(NULLIF(TRIM(ii.category), ''), 'other')
    `).all(...args) as JsonRow[];

    const categoryCostRatios = new Map(summary.categories.map((row) => [
      row.category,
      {
        ratio: row.revenue > 0 ? Math.max(0, row.cost / row.revenue) : 1 - (DEFAULT_MARGINS[row.category] ?? DEFAULT_MARGINS.other),
        source: row.costSource,
      },
    ]));
    const aggregates = new Map<string, {
      name: string;
      revenue: number;
      cost: number;
      actualRevenue: number;
      estimatedRevenue: number;
    }>();

    for (const row of rawRows) {
      const client = String(row.client || "");
      const service = String(row.service || "");
      if (query && !`${client} ${service} ${row.category}`.toLowerCase().includes(query)) continue;
      const name = groupBy === "client" ? client : service;
      const category = normalizeCategory(row.category);
      const revenue = asNumber(row.revenue);
      const costInfo = categoryCostRatios.get(category) || {
        ratio: 1 - (DEFAULT_MARGINS[category] ?? DEFAULT_MARGINS.other),
        source: "estimated_margin",
      };
      const aggregate = aggregates.get(name) || {
        name,
        revenue: 0,
        cost: 0,
        actualRevenue: 0,
        estimatedRevenue: 0,
      };
      aggregate.revenue += revenue;
      aggregate.cost += revenue * costInfo.ratio;
      if (costInfo.source === "actual_category_cost") aggregate.actualRevenue += revenue;
      else aggregate.estimatedRevenue += revenue;
      aggregates.set(name, aggregate);
    }

    const unclassifiedRows = db.prepare(`
      SELECT
        ${source.clientExpression} AS client,
        COALESCE(SUM(i.net_total - COALESCE(items.item_revenue, 0)), 0) AS revenue
      FROM ${source.invoiceTable} i
      ${source.clientJoin}
      LEFT JOIN (
        SELECT invoice_id, SUM(net_total) AS item_revenue
        FROM ${source.itemTable}
        GROUP BY invoice_id
      ) items ON items.invoice_id = i.id
      WHERE i.issue_date IS NOT NULL AND ${source.activeFilter}
        AND ${dateFilter("i.issue_date", period.month)}
      GROUP BY ${source.clientExpression}
      HAVING ABS(revenue) > 0.005
    `).all(...args) as JsonRow[];
    const unclassifiedCostRatio = 1 - (DEFAULT_MARGINS.unclassified ?? DEFAULT_MARGINS.other);
    for (const row of unclassifiedRows) {
      const client = String(row.client || "");
      const service = "Παραστατικά χωρίς ανάλυση";
      if (query && !`${client} ${service} unclassified`.toLowerCase().includes(query)) continue;
      const name = groupBy === "client" ? client : service;
      const revenue = asNumber(row.revenue);
      const aggregate = aggregates.get(name) || {
        name,
        revenue: 0,
        cost: 0,
        actualRevenue: 0,
        estimatedRevenue: 0,
      };
      aggregate.revenue += revenue;
      aggregate.cost += Math.max(0, revenue) * unclassifiedCostRatio;
      aggregate.estimatedRevenue += Math.max(0, revenue);
      aggregates.set(name, aggregate);
    }

    const rows = [...aggregates.values()]
      .map((row) => {
        const profit = row.revenue - row.cost;
        return {
          name: row.name,
          revenue: roundMoney(row.revenue),
          allocatedCost: roundMoney(row.cost),
          profit: roundMoney(profit),
          marginPercent: row.revenue ? roundMoney(profit / row.revenue * 100) : 0,
          costSource: row.actualRevenue > 0 && row.estimatedRevenue > 0
            ? "mixed_allocated_and_estimated"
            : row.actualRevenue > 0
              ? "allocated_category_cost"
              : "estimated_margin",
        };
      })
      .sort((left, right) => right.profit - left.profit)
      .slice(0, limit);

    return {
      ok: true,
      readOnly: true,
      scope: "managerial_estimate",
      accountingStatement: false,
      groupBy,
      year: period.year,
      month: period.month || null,
      count: rows.length,
      rows,
      coverage: summary.coverage,
      sources: getSyncStatus(db, source),
      warning: "Client/service costs are allocated from category totals or estimated; they are not linked to individual supplier invoices.",
    };
  } catch (error) {
    return safeFailure(error);
  } finally {
    db?.close();
  }
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function addMonths(date: Date, months: number) {
  const result = new Date(date);
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}

export async function readFinanceRenewals(
  input: FinanceRenewalsInput = {},
  databasePath?: string,
  now = new Date(),
): Promise<Record<string, unknown>> {
  let db: DatabaseSync | undefined;
  try {
    db = openDatabase(databasePath);
    const days = boundedInteger(input.days, 90, FINANCE_RENEWAL_DAYS_MAX);
    const limit = boundedInteger(input.limit, 30, FINANCE_RENEWAL_LIMIT_MAX);
    const requestedStatus = input.status || "actionable";
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const todayIso = isoDate(today);
    const recentOverdueIso = isoDate(addDays(today, -60));
    const freshnessIso = isoDate(addMonths(today, -18));
    const horizonIso = isoDate(addDays(today, days));
    const query = input.query?.trim().toLowerCase();
    const categoryFilter = input.category?.trim().toLowerCase();

    const sourceRows = db.prepare(`
      SELECT
        rs.id, rs.service_name, rs.category, rs.period, rs.unit_price,
        rs.last_invoiced_date, rs.next_renewal_date, rs.duration_years,
        rs.notes, rs.active, c.name AS client
      FROM recurring_services rs
      JOIN clients c ON c.id = rs.client_id
      ORDER BY rs.next_renewal_date, c.name
    `).all() as JsonRow[];

    const statusCounts: Record<string, number> = {
      actionable: 0,
      upcoming: 0,
      overdue: 0,
      future: 0,
      stale: 0,
      undated: 0,
      cancelled: 0,
    };
    const allRows = sourceRows.map((row) => {
      const active = asNumber(row.active) === 1;
      const nextRenewal = row.next_renewal_date ? String(row.next_renewal_date) : "";
      const lastInvoiced = row.last_invoiced_date ? String(row.last_invoiced_date) : "";
      let status = "future";
      if (!active) status = "cancelled";
      else if (!nextRenewal) status = "undated";
      else if (
        nextRenewal < recentOverdueIso
        || (nextRenewal < todayIso && (!lastInvoiced || lastInvoiced < freshnessIso))
      ) status = "stale";
      else if (nextRenewal < todayIso) status = "overdue";
      else if (nextRenewal <= horizonIso) status = "upcoming";
      statusCounts[status] = (statusCounts[status] || 0) + 1;
      if (status === "overdue" || status === "upcoming") statusCounts.actionable += 1;

      const confidence = status === "stale" || status === "undated"
        ? "low"
        : lastInvoiced && lastInvoiced >= freshnessIso
          ? "high"
          : "medium";
      const daysUntil = nextRenewal
        ? Math.round((Date.parse(`${nextRenewal}T00:00:00Z`) - today.getTime()) / 86_400_000)
        : null;
      return {
        id: asNumber(row.id),
        client: String(row.client || ""),
        service: String(row.service_name || ""),
        category: normalizeCategory(row.category),
        period: String(row.period || ""),
        amountNet: roundMoney(asNumber(row.unit_price)),
        lastInvoicedDate: lastInvoiced || null,
        nextRenewalDate: nextRenewal || null,
        daysUntil,
        status,
        confidence,
      };
    });

    const matchesStatus = (row: { status: string }) => {
      if (requestedStatus === "all") return true;
      if (requestedStatus === "actionable") return row.status === "upcoming" || row.status === "overdue";
      return row.status === requestedStatus;
    };
    const rows = allRows
      .filter(matchesStatus)
      .filter((row) => !categoryFilter || row.category === categoryFilter)
      .filter((row) => !query || `${row.client} ${row.service} ${row.category}`.toLowerCase().includes(query))
      .sort((left, right) => {
        if (left.status !== right.status) return left.status === "upcoming" ? -1 : 1;
        const leftDate = left.nextRenewalDate || "9999-12-31";
        const rightDate = right.nextRenewalDate || "9999-12-31";
        return left.status === "overdue"
          ? rightDate.localeCompare(leftDate)
          : leftDate.localeCompare(rightDate);
      })
      .slice(0, limit);

    return {
      ok: true,
      readOnly: true,
      onDemand: true,
      automaticDelivery: false,
      source: "legacy_mydash_snapshot",
      candidateData: true,
      asOf: todayIso,
      horizonDays: days,
      requestedStatus,
      count: rows.length,
      rows,
      dataQuality: {
        totalRows: sourceRows.length,
        statusCounts,
        rule: "Old or undated entries are classified as stale/undated instead of being treated as active obligations.",
      },
      warning: "Renewals are historical candidates from the imported dashboard. Verify against current Elorus/customer context before acting.",
    };
  } catch (error) {
    return safeFailure(error);
  } finally {
    db?.close();
  }
}
