"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { DatabaseSync } = require("node:sqlite");
const { getOverview, getRenewals } = require("../finance-store.js");

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dorothy-web-finance-"));
  const filename = path.join(directory, "finance.sqlite");
  const db = new DatabaseSync(filename);
  db.exec(`
    CREATE TABLE clients (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE invoices (id INTEGER PRIMARY KEY, client_id INTEGER, issue_date TEXT, net_total REAL);
    CREATE TABLE invoice_items (id INTEGER PRIMARY KEY, invoice_id INTEGER, net_total REAL, category TEXT);
    CREATE TABLE expenses (id INTEGER PRIMARY KEY, expense_date TEXT, category TEXT, expense_type TEXT, amount_net REAL);
    CREATE TABLE recurring_services (
      id INTEGER PRIMARY KEY, client_id INTEGER, service_name TEXT, category TEXT,
      period TEXT, unit_price REAL, last_invoiced_date TEXT, next_renewal_date TEXT, active INTEGER
    );
    CREATE TABLE margin_rules (category TEXT PRIMARY KEY, margin_ratio REAL);
    INSERT INTO margin_rules VALUES ('hosting', .85), ('other', .80);
    INSERT INTO clients VALUES (1, 'Client A');
    INSERT INTO invoices VALUES (1, 1, '2026-01-10', 150);
    INSERT INTO invoice_items VALUES (1, 1, 100, 'hosting');
    INSERT INTO expenses VALUES
      (1, '2026-01-11', 'hosting_cost', 'client_cost', 20),
      (2, '2026-01-12', 'cloud', 'overhead', 10),
      (3, '2026-01-13', 'tax_payment', 'overhead', 24);
    INSERT INTO recurring_services VALUES
      (1, 1, 'Hosting Pro', 'hosting', 'annual', 100, '2026-01-10', '2026-06-20', 1),
      (2, 1, 'Old Hosting', 'hosting', 'annual', 100, '2022-01-10', '2023-06-20', 1);
  `);
  db.close();
  return { directory, filename };
}

test("overview separates operating expenses from tax cash outflows", () => {
  const data = fixture();
  try {
    const result = getOverview({ year: 2026 }, data.filename);
    assert.equal(result.summary.revenue, 150);
    assert.equal(result.summary.directCosts, 30);
    assert.equal(result.summary.operatingExpenses, 10);
    assert.equal(result.summary.operatingResult, 110);
    assert.equal(result.summary.taxVatCashOutflows, 24);
    assert.equal(result.summary.coverage.unclassifiedRevenue, 50);
  } finally {
    fs.rmSync(data.directory, { recursive: true, force: true });
  }
});

test("successful Elorus sync replaces revenue while preserving MyDash costs", () => {
  const data = fixture();
  try {
    const db = new DatabaseSync(data.filename);
    db.exec(`
      CREATE TABLE elorus_invoices (
        id TEXT PRIMARY KEY, client_id TEXT, client_name TEXT, issue_date TEXT,
        status TEXT, draft INTEGER, currency TEXT, net_total REAL
      );
      CREATE TABLE elorus_invoice_items (
        id TEXT PRIMARY KEY, invoice_id TEXT, net_total REAL, category TEXT
      );
      CREATE TABLE finance_sync_runs (
        id INTEGER PRIMARY KEY, source TEXT, finished_at TEXT, status TEXT,
        list_count INTEGER, details_fetched INTEGER, items_upserted INTEGER
      );
      INSERT INTO elorus_invoices VALUES
        ('e1', 'c1', 'Client A', '2026-01-10', 'paid', 0, 'EUR', 10);
      INSERT INTO elorus_invoice_items VALUES ('ei1', 'e1', 10, 'hosting');
      INSERT INTO finance_sync_runs VALUES
        (1, 'elorus', '2026-06-12T12:00:00Z', 'success', 1, 1, 1);
    `);
    db.close();

    const result = getOverview({ year: 2026 }, data.filename);
    assert.equal(result.summary.revenue, 10);
    assert.equal(result.summary.directCostsActual, 20);
    assert.equal(result.summary.grossProfit, -10);
    assert.equal(result.sources.revenueSource, "elorus_live_snapshot");
    assert.equal(result.sources.costSource, "legacy_mydash_snapshot");
  } finally {
    fs.rmSync(data.directory, { recursive: true, force: true });
  }
});

test("renewals hide stale historical rows from the default actionable list", () => {
  const data = fixture();
  try {
    const result = getRenewals({
      days: 90,
      now: new Date("2026-06-12T10:00:00Z"),
    }, data.filename);
    assert.equal(result.count, 1);
    assert.equal(result.rows[0].service, "Hosting Pro");
    assert.equal(result.statusCounts.stale, 1);
  } finally {
    fs.rmSync(data.directory, { recursive: true, force: true });
  }
});
