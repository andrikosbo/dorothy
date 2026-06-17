import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import {
  readFinancePnl,
  readFinanceProfitability,
  readFinanceRenewals,
} from "./finance.js";

const tempPaths: string[] = [];

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dorothy-finance-"));
  const filename = path.join(directory, "finance.sqlite");
  tempPaths.push(directory);
  const db = new DatabaseSync(filename);
  db.exec(`
    CREATE TABLE clients (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE invoices (
      id INTEGER PRIMARY KEY, client_id INTEGER NOT NULL, issue_date TEXT,
      net_total REAL, invoice_number TEXT
    );
    CREATE TABLE invoice_items (
      id INTEGER PRIMARY KEY, invoice_id INTEGER NOT NULL, description TEXT,
      net_total REAL, category TEXT
    );
    CREATE TABLE expenses (
      id INTEGER PRIMARY KEY, expense_date TEXT, category TEXT,
      expense_type TEXT, amount_net REAL
    );
    CREATE TABLE recurring_services (
      id INTEGER PRIMARY KEY, client_id INTEGER NOT NULL, service_name TEXT,
      category TEXT, period TEXT, unit_price REAL, last_invoiced_date TEXT,
      next_renewal_date TEXT, duration_years INTEGER, notes TEXT, active INTEGER
    );
    CREATE TABLE margin_rules (category TEXT PRIMARY KEY, margin_ratio REAL);
    INSERT INTO margin_rules VALUES ('hosting', .85), ('other', .80);
    INSERT INTO clients VALUES (1, 'Client A'), (2, 'Client B');
    INSERT INTO invoices VALUES
      (1, 1, '2026-01-10', 100, 'A-1'),
      (2, 2, '2026-01-20', 50, 'B-1');
    INSERT INTO invoice_items VALUES
      (1, 1, 'Hosting Pro', 100, 'hosting');
    INSERT INTO expenses VALUES
      (1, '2026-01-12', 'hosting_cost', 'client_cost', 20),
      (2, '2026-01-15', 'cloud', 'overhead', 10),
      (3, '2026-01-25', 'tax_payment', 'overhead', 24);
    INSERT INTO recurring_services VALUES
      (1, 1, 'Hosting Pro', 'hosting', 'annual', 100, '2026-01-10', '2026-06-20', 1, NULL, 1),
      (2, 2, 'Old domain', 'domain', 'annual', 20, '2022-01-01', '2023-01-01', 1, NULL, 1),
      (3, 2, 'No date', 'other', 'annual', 30, '2026-01-01', NULL, 1, NULL, 1);
  `);
  db.close();
  return filename;
}

afterEach(() => {
  for (const directory of tempPaths.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe("Dorothy finance store", () => {
  it("keeps tax/VAT cash outflows separate from operating result", async () => {
    const result = await readFinancePnl({ year: 2026, month: 1 }, fixture());
    expect(result).toMatchObject({
      ok: true,
      accountingStatement: false,
      summary: {
        revenue: 150,
        directCostsActual: 20,
        directCostsEstimated: 10,
        grossProfit: 120,
        operatingExpenses: 10,
        operatingResult: 110,
        taxVatCashOutflows: 24,
        coverage: { unclassifiedRevenue: 50 },
      },
    });
  });

  it("labels client profitability costs as allocated or estimated", async () => {
    const result = await readFinanceProfitability({
      year: 2026,
      month: 1,
      groupBy: "client",
    }, fixture());
    expect(result).toMatchObject({
      ok: true,
      groupBy: "client",
      rows: [
        expect.objectContaining({
          name: "Client A",
          revenue: 100,
          allocatedCost: 20,
          costSource: "allocated_category_cost",
        }),
        expect.objectContaining({
          name: "Client B",
          revenue: 50,
          allocatedCost: 10,
          costSource: "estimated_margin",
        }),
      ],
    });
  });

  it("uses synced Elorus revenue with MyDash costs", async () => {
    const filename = fixture();
    const db = new DatabaseSync(filename);
    db.exec(`
      CREATE TABLE elorus_invoices (
        id TEXT PRIMARY KEY, client_id TEXT, client_name TEXT, issue_date TEXT,
        status TEXT, draft INTEGER, currency TEXT, net_total REAL
      );
      CREATE TABLE elorus_invoice_items (
        id TEXT PRIMARY KEY, invoice_id TEXT, title TEXT, description TEXT,
        net_total REAL, category TEXT
      );
      CREATE TABLE finance_sync_runs (
        id INTEGER PRIMARY KEY, source TEXT, finished_at TEXT, status TEXT,
        list_count INTEGER, details_fetched INTEGER, items_upserted INTEGER
      );
      INSERT INTO elorus_invoices VALUES
        ('e1', 'c1', 'Client A', '2026-01-10', 'paid', 0, 'EUR', 10);
      INSERT INTO elorus_invoice_items VALUES
        ('ei1', 'e1', 'Web hosting', 'Cloud', 10, 'hosting');
      INSERT INTO finance_sync_runs VALUES
        (1, 'elorus', '2026-06-12T12:00:00Z', 'success', 1, 1, 1);
    `);
    db.close();

    const result = await readFinancePnl({ year: 2026, month: 1 }, filename);
    expect(result).toMatchObject({
      ok: true,
      sources: {
        revenueSource: "elorus_live_snapshot",
        costSource: "legacy_mydash_snapshot",
      },
      summary: {
        revenue: 10,
        directCostsActual: 20,
        grossProfit: -10,
      },
    });
  });

  it("returns only credible upcoming or recent overdue renewals by default", async () => {
    const result = await readFinanceRenewals(
      { days: 90 },
      fixture(),
      new Date("2026-06-12T10:00:00Z"),
    );
    expect(result).toMatchObject({
      ok: true,
      candidateData: true,
      count: 1,
      rows: [expect.objectContaining({ service: "Hosting Pro", status: "upcoming", confidence: "high" })],
      dataQuality: {
        statusCounts: expect.objectContaining({ stale: 1, undated: 1 }),
      },
    });
  });

  it("fails closed when the finance database is unavailable", async () => {
    const result = await readFinancePnl({}, "/definitely/missing/dorothy-finance.sqlite");
    expect(result).toMatchObject({ ok: false, readOnly: true, error: "finance_database_missing" });
  });
});
