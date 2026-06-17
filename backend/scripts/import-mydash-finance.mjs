#!/usr/bin/env node

import { createHash, randomBytes } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { DatabaseSync } from "node:sqlite";

const execFileAsync = promisify(execFile);
const DEFAULT_SOURCE = "/Users/you/Downloads/sharethe_mydash_2026-06-12_13-37-14.sql";
const DEFAULT_OUTPUT = path.join(os.homedir(), ".openclaw", "data", "dorothy-finance.sqlite");
const DATABASE = "mydash_import";

const TABLES = {
  clients: {
    query: `
      SELECT JSON_OBJECT(
        'id', id, 'name', name, 'afm', afm, 'notes', notes, 'created_at', created_at
      ) FROM clients ORDER BY id
    `,
    insert: `
      INSERT INTO clients (id, name, afm, notes, created_at)
      VALUES (:id, :name, :afm, :notes, :created_at)
    `,
  },
  invoices: {
    query: `
      SELECT JSON_OBJECT(
        'id', id, 'client_id', client_id, 'invoice_number', invoice_number,
        'invoice_type', invoice_type, 'issue_date', issue_date, 'net_total', net_total,
        'vat_total', vat_total, 'gross_total', gross_total, 'paid_amount', paid_amount,
        'unpaid_amount', unpaid_amount, 'filename', filename, 'created_at', created_at
      ) FROM invoices ORDER BY id
    `,
    insert: `
      INSERT INTO invoices (
        id, client_id, invoice_number, invoice_type, issue_date, net_total, vat_total,
        gross_total, paid_amount, unpaid_amount, filename, created_at
      ) VALUES (
        :id, :client_id, :invoice_number, :invoice_type, :issue_date, :net_total, :vat_total,
        :gross_total, :paid_amount, :unpaid_amount, :filename, :created_at
      )
    `,
  },
  invoice_items: {
    query: `
      SELECT JSON_OBJECT(
        'id', id, 'invoice_id', invoice_id, 'description', description, 'price', price,
        'discount_pct', discount_pct, 'quantity', quantity, 'net_total', net_total,
        'category', category, 'duration_years', duration_years, 'is_recurring', is_recurring
      ) FROM invoice_items ORDER BY id
    `,
    insert: `
      INSERT INTO invoice_items (
        id, invoice_id, description, price, discount_pct, quantity, net_total,
        category, duration_years, is_recurring
      ) VALUES (
        :id, :invoice_id, :description, :price, :discount_pct, :quantity, :net_total,
        :category, :duration_years, :is_recurring
      )
    `,
  },
  recurring_services: {
    query: `
      SELECT JSON_OBJECT(
        'id', id, 'client_id', client_id, 'service_name', service_name, 'category', category,
        'period', period, 'unit_price', unit_price, 'last_invoice_id', last_invoice_id,
        'last_invoiced_date', last_invoiced_date, 'next_renewal_date', next_renewal_date,
        'duration_years', duration_years, 'notes', notes, 'active', active,
        'created_at', created_at, 'updated_at', updated_at
      ) FROM recurring_services ORDER BY id
    `,
    insert: `
      INSERT INTO recurring_services (
        id, client_id, service_name, category, period, unit_price, last_invoice_id,
        last_invoiced_date, next_renewal_date, duration_years, notes, active,
        created_at, updated_at
      ) VALUES (
        :id, :client_id, :service_name, :category, :period, :unit_price, :last_invoice_id,
        :last_invoiced_date, :next_renewal_date, :duration_years, :notes, :active,
        :created_at, :updated_at
      )
    `,
  },
  expenses: {
    query: `
      SELECT JSON_OBJECT(
        'id', id, 'expense_date', expense_date, 'year', year, 'category', category,
        'expense_type', expense_type, 'vendor', vendor, 'description', description,
        'amount_net', amount_net, 'filename', filename, 'notes', notes, 'created_at', created_at
      ) FROM expenses ORDER BY id
    `,
    insert: `
      INSERT INTO expenses (
        id, expense_date, year, category, expense_type, vendor, description,
        amount_net, filename, notes, created_at
      ) VALUES (
        :id, :expense_date, :year, :category, :expense_type, :vendor, :description,
        :amount_net, :filename, :notes, :created_at
      )
    `,
  },
};

function parseArgs(argv) {
  const args = { source: DEFAULT_SOURCE, output: DEFAULT_OUTPUT };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--source") args.source = argv[++index];
    else if (value === "--output") args.output = argv[++index];
    else if (value === "--help") args.help = true;
    else throw new Error(`Unknown argument: ${value}`);
  }
  return args;
}

function usage() {
  console.log(`Usage: node scripts/import-mydash-finance.mjs [options]

Options:
  --source <dump.sql>   MyDash SQL dump
  --output <file>       Destination SQLite file
  --help                Show this help`);
}

async function run(command, args, options = {}) {
  return execFileAsync(command, args, {
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
}

async function waitForMySql(container, password) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      await run("docker", [
        "exec",
        container,
        "mysql",
        "-uroot",
        `-p${password}`,
        "-N",
        "-e",
        "SELECT 1",
      ]);
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }
  throw new Error("Temporary MySQL container did not become ready");
}

async function importDump(container, password, source) {
  await run("docker", [
    "exec",
    container,
    "mysql",
    "-uroot",
    `-p${password}`,
    "-e",
    `CREATE DATABASE ${DATABASE} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  ]);

  await new Promise((resolve, reject) => {
    const child = spawn("docker", [
      "exec",
      "-i",
      container,
      "mysql",
      "-uroot",
      `-p${password}`,
      "--default-character-set=utf8mb4",
      DATABASE,
    ], { stdio: ["pipe", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `mysql import exited with ${code}`));
    });
    fs.createReadStream(source).pipe(child.stdin);
  });
}

async function readTable(container, password, query) {
  const { stdout } = await run("docker", [
    "exec",
    container,
    "mysql",
    "-uroot",
    `-p${password}`,
    "--default-character-set=utf8mb4",
    "--batch",
    "--raw",
    "--skip-column-names",
    DATABASE,
    "-e",
    query.replace(/\s+/g, " ").trim(),
  ]);
  return stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function createSchema(db) {
  db.exec(`
    PRAGMA journal_mode = DELETE;
    PRAGMA foreign_keys = ON;

    CREATE TABLE metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE clients (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      afm TEXT,
      notes TEXT,
      created_at TEXT
    );

    CREATE TABLE invoices (
      id INTEGER PRIMARY KEY,
      client_id INTEGER NOT NULL REFERENCES clients(id),
      invoice_number TEXT,
      invoice_type TEXT,
      issue_date TEXT,
      net_total REAL NOT NULL DEFAULT 0,
      vat_total REAL NOT NULL DEFAULT 0,
      gross_total REAL NOT NULL DEFAULT 0,
      paid_amount REAL NOT NULL DEFAULT 0,
      unpaid_amount REAL NOT NULL DEFAULT 0,
      filename TEXT,
      created_at TEXT
    );

    CREATE TABLE invoice_items (
      id INTEGER PRIMARY KEY,
      invoice_id INTEGER NOT NULL REFERENCES invoices(id),
      description TEXT,
      price REAL NOT NULL DEFAULT 0,
      discount_pct REAL NOT NULL DEFAULT 0,
      quantity INTEGER NOT NULL DEFAULT 1,
      net_total REAL NOT NULL DEFAULT 0,
      category TEXT,
      duration_years INTEGER,
      is_recurring INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE recurring_services (
      id INTEGER PRIMARY KEY,
      client_id INTEGER NOT NULL REFERENCES clients(id),
      service_name TEXT NOT NULL,
      category TEXT,
      period TEXT,
      unit_price REAL NOT NULL DEFAULT 0,
      last_invoice_id INTEGER,
      last_invoiced_date TEXT,
      next_renewal_date TEXT,
      duration_years INTEGER,
      notes TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE expenses (
      id INTEGER PRIMARY KEY,
      expense_date TEXT,
      year INTEGER,
      category TEXT,
      expense_type TEXT NOT NULL,
      vendor TEXT,
      description TEXT,
      amount_net REAL NOT NULL DEFAULT 0,
      filename TEXT,
      notes TEXT,
      created_at TEXT
    );

    CREATE TABLE margin_rules (
      category TEXT PRIMARY KEY,
      margin_ratio REAL NOT NULL,
      rationale TEXT NOT NULL
    );

    CREATE INDEX invoices_issue_date_idx ON invoices(issue_date);
    CREATE INDEX invoices_client_idx ON invoices(client_id);
    CREATE INDEX invoice_items_invoice_idx ON invoice_items(invoice_id);
    CREATE INDEX invoice_items_category_idx ON invoice_items(category);
    CREATE INDEX recurring_renewal_idx ON recurring_services(next_renewal_date);
    CREATE INDEX recurring_client_idx ON recurring_services(client_id);
    CREATE INDEX expenses_date_idx ON expenses(expense_date);
    CREATE INDEX expenses_category_idx ON expenses(category);
  `);
}

async function hashFile(filename) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = fs.createReadStream(filename);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function buildSqlite(output, source, sourceHash, rowsByTable) {
  await fsp.mkdir(path.dirname(output), { recursive: true, mode: 0o700 });
  const temporary = `${output}.tmp-${process.pid}`;
  await fsp.rm(temporary, { force: true });

  const db = new DatabaseSync(temporary);
  try {
    createSchema(db);
    db.exec("BEGIN IMMEDIATE");
    try {
      for (const [table, config] of Object.entries(TABLES)) {
        const statement = db.prepare(config.insert);
        for (const row of rowsByTable[table]) statement.run(row);
      }

      const marginStatement = db.prepare(`
        INSERT INTO margin_rules (category, margin_ratio, rationale)
        VALUES (?, ?, ?)
      `);
      const margins = {
        hosting: 0.85,
        domain: 0.35,
        ssl: 0.50,
        email: 0.75,
        maintenance: 0.95,
        web_design: 0.95,
        marketing: 0.20,
        other: 0.80,
      };
      for (const [category, margin] of Object.entries(margins)) {
        marginStatement.run(category, margin, "Legacy MyDash fallback; used only when actual direct costs are unavailable.");
      }

      const metadata = db.prepare("INSERT INTO metadata (key, value) VALUES (?, ?)");
      metadata.run("source_file", path.resolve(source));
      metadata.run("source_sha256", sourceHash);
      metadata.run("imported_at", new Date().toISOString());
      metadata.run("privacy_scope", "Business finance tables only; users and authentication data excluded.");
      metadata.run("reporting_scope", "Managerial estimate, not an accounting or tax statement.");
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }

    const integrity = db.prepare("PRAGMA integrity_check").get();
    if (integrity.integrity_check !== "ok") throw new Error(`SQLite integrity check failed: ${integrity.integrity_check}`);
  } finally {
    db.close();
  }

  await fsp.chmod(temporary, 0o600);
  await fsp.rename(temporary, output);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }

  const source = path.resolve(args.source);
  const output = path.resolve(args.output);
  await fsp.access(source, fs.constants.R_OK);

  const suffix = randomBytes(4).toString("hex");
  const container = `dorothy-finance-import-${suffix}`;
  const password = randomBytes(18).toString("hex");

  try {
    await run("docker", [
      "run",
      "--name",
      container,
      "-e",
      `MYSQL_ROOT_PASSWORD=${password}`,
      "-d",
      "mysql:8.4",
      "--character-set-server=utf8mb4",
      "--collation-server=utf8mb4_unicode_ci",
    ]);
    await waitForMySql(container, password);
    await importDump(container, password, source);

    const rowsByTable = {};
    for (const [table, config] of Object.entries(TABLES)) {
      rowsByTable[table] = await readTable(container, password, config.query);
    }

    const sourceHash = await hashFile(source);
    await buildSqlite(output, source, sourceHash, rowsByTable);
    console.log(JSON.stringify({
      ok: true,
      output,
      source,
      sourceSha256: sourceHash,
      excludedTables: ["users"],
      counts: Object.fromEntries(
        Object.entries(rowsByTable).map(([table, rows]) => [table, rows.length]),
      ),
    }, null, 2));
  } finally {
    await run("docker", ["rm", "-f", container]).catch(() => {});
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
