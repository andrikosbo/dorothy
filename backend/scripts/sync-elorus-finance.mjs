#!/usr/bin/env node

import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { DatabaseSync } from "node:sqlite";

const execFileAsync = promisify(execFile);
const API_BASE = "https://api.elorus.com";
const API_VERSION = "v1.2";
const PAGE_SIZE = 250;
const DETAIL_CONCURRENCY = 2;
const KEYCHAIN_ACCOUNT = "dorothy";
const API_KEY_SERVICE = "com.dorothy.elorus.api-key";
const ORGANIZATION_SERVICE = "com.dorothy.elorus.organization-id";
const DEFAULT_DATABASE = path.join(os.homedir(), ".openclaw", "data", "dorothy-finance.sqlite");

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asString(value) {
  return typeof value === "string" ? value : "";
}

function asNumber(value) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : 0;
}

function money(value) {
  return Math.round((asNumber(value) + Number.EPSILON) * 100) / 100;
}

function normalizedText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("el-GR");
}

export function classifyElorusItem(title, description) {
  const text = normalizedText(`${title || ""} ${description || ""}`);
  const rules = [
    ["ssl", /\bssl\b|certificate|πιστοποιητικ/],
    ["domain", /\bdomain\b|domain name|ονομα χωρου|κατοχυρωσ|ανανέωση \.(?:gr|com|eu|net|org)\b/],
    ["email", /\be-?mail\b|mailbox|google workspace|microsoft 365|office 365/],
    ["hosting", /\bhosting\b|web hosting|φιλοξεν|server|vps|cloud (?:server|hosting)|ssd (?:small|medium|large)/],
    ["maintenance", /\bwp-?support\b|maintenance|συντηρησ|υποστηριξ|backup|security check|performance check/],
    ["marketing", /\bmarketing\b|google ads|meta ads|facebook ads|instagram ads|social media|\bseo\b|campaign|διαφημισ/],
    ["web_design", /web design|website|web site|ιστοσελιδ|e-?shop|eshop|landing page|woocommerce|κατασκευη web/],
  ];
  for (const [category, pattern] of rules) {
    if (pattern.test(text)) return { category, source: "title_description_rule" };
  }
  return { category: "other", source: "fallback_other" };
}

function ensureSchema(db) {
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS elorus_invoices (
      id TEXT PRIMARY KEY,
      client_id TEXT,
      client_name TEXT NOT NULL DEFAULT '',
      client_vat_number TEXT,
      representation TEXT,
      invoice_number TEXT,
      issue_date TEXT,
      due_date TEXT,
      status TEXT,
      draft INTEGER NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'EUR',
      net_total REAL NOT NULL DEFAULT 0,
      gross_total REAL NOT NULL DEFAULT 0,
      payable REAL NOT NULL DEFAULT 0,
      paid_amount REAL NOT NULL DEFAULT 0,
      mydata_document_type TEXT,
      modified_at TEXT,
      permalink TEXT,
      synced_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS elorus_invoice_items (
      id TEXT PRIMARY KEY,
      invoice_id TEXT NOT NULL REFERENCES elorus_invoices(id) ON DELETE CASCADE,
      position INTEGER NOT NULL DEFAULT 0,
      title TEXT,
      description TEXT,
      quantity REAL NOT NULL DEFAULT 0,
      unit_value REAL NOT NULL DEFAULT 0,
      discount_pct REAL NOT NULL DEFAULT 0,
      net_total REAL NOT NULL DEFAULT 0,
      category TEXT NOT NULL DEFAULT 'other',
      category_source TEXT NOT NULL DEFAULT 'fallback_other'
    );

    CREATE TABLE IF NOT EXISTS finance_sync_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      status TEXT NOT NULL,
      list_count INTEGER NOT NULL DEFAULT 0,
      details_fetched INTEGER NOT NULL DEFAULT 0,
      invoices_upserted INTEGER NOT NULL DEFAULT 0,
      items_upserted INTEGER NOT NULL DEFAULT 0,
      error TEXT
    );

    CREATE INDEX IF NOT EXISTS elorus_invoices_date_idx ON elorus_invoices(issue_date);
    CREATE INDEX IF NOT EXISTS elorus_invoices_client_idx ON elorus_invoices(client_id);
    CREATE INDEX IF NOT EXISTS elorus_items_invoice_idx ON elorus_invoice_items(invoice_id);
    CREATE INDEX IF NOT EXISTS elorus_items_category_idx ON elorus_invoice_items(category);
    CREATE INDEX IF NOT EXISTS finance_sync_runs_status_idx ON finance_sync_runs(status, finished_at);
  `);
}

async function readSecret(service) {
  try {
    const { stdout } = await execFileAsync("/usr/bin/security", [
      "find-generic-password",
      "-a",
      KEYCHAIN_ACCOUNT,
      "-s",
      service,
      "-w",
    ], { timeout: 5_000, maxBuffer: 16_384 });
    return stdout.trim();
  } catch {
    return "";
  }
}

async function loadCredentials() {
  const [apiKey, organizationId] = await Promise.all([
    readSecret(API_KEY_SERVICE),
    readSecret(ORGANIZATION_SERVICE),
  ]);
  if (!apiKey || !organizationId) throw new Error("elorus_credentials_missing");
  return { apiKey, organizationId };
}

async function elorusGet(urlOrPath, credentials, fetchImpl = fetch) {
  const url = urlOrPath instanceof URL
    ? urlOrPath
    : new URL(`/${API_VERSION}/${String(urlOrPath).replace(/^\/+/, "")}`, API_BASE);
  if (url.origin !== API_BASE || !url.pathname.startsWith(`/${API_VERSION}/`)) {
    throw new Error("elorus_invalid_pagination_url");
  }
  for (let attempt = 0; attempt < 7; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetchImpl(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Token ${credentials.apiKey}`,
          "X-Elorus-Organization": credentials.organizationId,
        },
        signal: controller.signal,
      });
      if (response.ok) return await response.json();
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt === 6) throw new Error(`elorus_http_${response.status}`);
      const retryAfter = Number(response.headers.get("retry-after") || 0);
      const delay = retryAfter > 0
        ? retryAfter * 1_000
        : Math.min(30_000, 1_500 * (2 ** attempt));
      await new Promise((resolve) => setTimeout(resolve, delay));
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("elorus_unavailable");
}

async function fetchInvoiceList(credentials, fetchImpl) {
  const invoices = [];
  let next = new URL(`/${API_VERSION}/invoices/`, API_BASE);
  next.search = new URLSearchParams({
    ordering: "date",
    page_size: String(PAGE_SIZE),
    page: "1",
  }).toString();

  while (next) {
    const body = asRecord(await elorusGet(next, credentials, fetchImpl));
    const results = Array.isArray(body.results) ? body.results : [];
    invoices.push(...results.map(asRecord));
    next = body.next ? new URL(String(body.next)) : null;
  }
  return invoices;
}

async function mapConcurrent(values, concurrency, mapper) {
  const result = new Array(values.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      result[index] = await mapper(values[index], index);
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return result;
}

function legacySeedItems(db, listedInvoices) {
  const legacyInvoices = db.prepare(`
    SELECT i.id, i.issue_date, i.invoice_number, i.net_total, c.name, c.afm
    FROM invoices i
    JOIN clients c ON c.id = i.client_id
    WHERE i.issue_date IS NOT NULL
  `).all();
  const byVatDateNet = new Map();
  const byNameDateNet = new Map();
  const add = (map, key, row) => {
    const values = map.get(key) || [];
    values.push(row);
    map.set(key, values);
  };
  for (const row of legacyInvoices) {
    const amount = money(row.net_total).toFixed(2);
    const date = String(row.issue_date || "");
    const vat = String(row.afm || "").replace(/\D/g, "");
    if (vat) add(byVatDateNet, `${vat}\u0000${date}\u0000${amount}`, row);
    add(byNameDateNet, `${normalizedText(row.name)}\u0000${date}\u0000${amount}`, row);
  }

  const itemQuery = db.prepare(`
    SELECT id, description, price, discount_pct, quantity, net_total, category
    FROM invoice_items WHERE invoice_id = ? ORDER BY id
  `);
  const result = new Map();
  for (const listed of listedInvoices) {
    const id = asString(listed.id);
    const amount = money(listed.net).toFixed(2);
    const date = asString(listed.date);
    const vat = asString(listed.client_vat_number).replace(/\D/g, "");
    const vatMatches = vat ? byVatDateNet.get(`${vat}\u0000${date}\u0000${amount}`) || [] : [];
    const nameMatches = byNameDateNet.get(
      `${normalizedText(listed.client_display_name)}\u0000${date}\u0000${amount}`,
    ) || [];
    const matches = vatMatches.length === 1 ? vatMatches : nameMatches;
    if (matches.length !== 1) continue;
    const legacyInvoice = matches[0];
    const items = itemQuery.all(legacyInvoice.id).map((item, position) => ({
      id: `legacy:${id}:${item.id}`,
      invoice_id: id,
      position,
      title: "",
      description: String(item.description || ""),
      quantity: asNumber(item.quantity),
      unit_value: money(item.price),
      discount_pct: asNumber(item.discount_pct),
      net_total: money(item.net_total),
      category: asString(item.category) || "other",
      category_source: "legacy_mydash_seed",
    }));
    if (items.length) result.set(id, items);
  }
  return result;
}

function normalizeInvoice(value, syncedAt) {
  const invoice = asRecord(value);
  return {
    id: asString(invoice.id),
    client_id: asString(invoice.client),
    client_name: asString(invoice.client_display_name),
    client_vat_number: asString(invoice.client_vat_number),
    representation: asString(invoice.representation) || asString(invoice.sequence_flat),
    invoice_number: asString(invoice.number),
    issue_date: asString(invoice.date),
    due_date: asString(invoice.due_date),
    status: asString(invoice.status),
    draft: invoice.draft === true ? 1 : 0,
    currency: asString(invoice.currency_code) || "EUR",
    net_total: money(invoice.net),
    gross_total: money(invoice.total),
    payable: money(invoice.payable),
    paid_amount: money(invoice.paid),
    mydata_document_type: asString(invoice.mydata_document_type),
    modified_at: asString(invoice.modified),
    permalink: asString(invoice.permalink),
    synced_at: syncedAt,
  };
}

function normalizeItems(detail) {
  const invoice = asRecord(detail);
  const invoiceId = asString(invoice.id);
  const items = Array.isArray(invoice.items) ? invoice.items : [];
  return items.map((value, position) => {
    const item = asRecord(value);
    const title = asString(item.title);
    const description = asString(item.description);
    const classification = classifyElorusItem(title, description);
    return {
      id: asString(item.id) || `${invoiceId}:${position}`,
      invoice_id: invoiceId,
      position,
      title,
      description,
      quantity: asNumber(item.quantity),
      unit_value: money(item.unit_value),
      discount_pct: asNumber(item.unit_discount_percentage),
      net_total: money(item.item_net),
      category: classification.category,
      category_source: classification.source,
    };
  });
}

function backupDatabase(databasePath) {
  const backupDir = path.join(os.homedir(), ".openclaw", "backups");
  fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(backupDir, `dorothy-finance-before-elorus-${stamp}.sqlite`);
  fs.copyFileSync(databasePath, backupPath);
  fs.chmodSync(backupPath, 0o600);
  return backupPath;
}

export async function syncElorusFinance({
  databasePath = process.env.DOROTHY_FINANCE_DB || DEFAULT_DATABASE,
  fetchImpl = fetch,
  credentialLoader = loadCredentials,
  createBackup = false,
} = {}) {
  if (!fs.existsSync(databasePath)) throw new Error("finance_database_missing");
  const credentials = await credentialLoader();
  const db = new DatabaseSync(databasePath);
  const startedAt = new Date().toISOString();
  let runId;
  try {
    ensureSchema(db);
    runId = Number(db.prepare(`
      INSERT INTO finance_sync_runs (source, started_at, status)
      VALUES ('elorus', ?, 'running')
      RETURNING id
    `).get(startedAt).id);

    const list = await fetchInvoiceList(credentials, fetchImpl);
    const seededItems = legacySeedItems(db, list);
    const existing = new Map(db.prepare(`
      SELECT i.id, i.modified_at,
        EXISTS(SELECT 1 FROM elorus_invoice_items item WHERE item.invoice_id = i.id) AS has_items
      FROM elorus_invoices i
    `).all().map((row) => [String(row.id), row]));
    const currentYear = String(new Date().getFullYear());
    const changed = list.filter((invoice) => {
      const id = asString(invoice.id);
      const previous = existing.get(id);
      if (!previous && seededItems.has(id) && asString(invoice.date).slice(0, 4) !== currentYear) {
        return false;
      }
      return !previous
        || String(previous.modified_at || "") !== asString(invoice.modified)
        || Number(previous.has_items) !== 1;
    });

    const details = await mapConcurrent(changed, DETAIL_CONCURRENCY, async (invoice) =>
      asRecord(await elorusGet(`invoices/${encodeURIComponent(asString(invoice.id))}/`, credentials, fetchImpl)));
    const detailsById = new Map(details.map((detail) => [asString(detail.id), detail]));
    const syncedAt = new Date().toISOString();
    const backupPath = createBackup ? backupDatabase(databasePath) : null;

    db.exec("BEGIN IMMEDIATE");
    try {
      const upsertInvoice = db.prepare(`
        INSERT INTO elorus_invoices (
          id, client_id, client_name, client_vat_number, representation, invoice_number,
          issue_date, due_date, status, draft, currency, net_total, gross_total, payable,
          paid_amount, mydata_document_type, modified_at, permalink, synced_at
        ) VALUES (
          :id, :client_id, :client_name, :client_vat_number, :representation, :invoice_number,
          :issue_date, :due_date, :status, :draft, :currency, :net_total, :gross_total, :payable,
          :paid_amount, :mydata_document_type, :modified_at, :permalink, :synced_at
        )
        ON CONFLICT(id) DO UPDATE SET
          client_id = excluded.client_id,
          client_name = excluded.client_name,
          client_vat_number = excluded.client_vat_number,
          representation = excluded.representation,
          invoice_number = excluded.invoice_number,
          issue_date = excluded.issue_date,
          due_date = excluded.due_date,
          status = excluded.status,
          draft = excluded.draft,
          currency = excluded.currency,
          net_total = excluded.net_total,
          gross_total = excluded.gross_total,
          payable = excluded.payable,
          paid_amount = excluded.paid_amount,
          mydata_document_type = excluded.mydata_document_type,
          modified_at = excluded.modified_at,
          permalink = excluded.permalink,
          synced_at = excluded.synced_at
      `);
      const insertItem = db.prepare(`
        INSERT INTO elorus_invoice_items (
          id, invoice_id, position, title, description, quantity, unit_value,
          discount_pct, net_total, category, category_source
        ) VALUES (
          :id, :invoice_id, :position, :title, :description, :quantity, :unit_value,
          :discount_pct, :net_total, :category, :category_source
        )
      `);
      let itemCount = 0;
      for (const listed of list) {
        const detail = detailsById.get(asString(listed.id));
        upsertInvoice.run(normalizeInvoice(detail || listed, syncedAt));
        if (detail) {
          db.prepare("DELETE FROM elorus_invoice_items WHERE invoice_id = ?").run(asString(listed.id));
          for (const item of normalizeItems(detail)) {
            insertItem.run(item);
            itemCount += 1;
          }
        } else if (!existing.has(asString(listed.id)) && seededItems.has(asString(listed.id))) {
          for (const item of seededItems.get(asString(listed.id))) {
            insertItem.run(item);
            itemCount += 1;
          }
        }
      }

      db.prepare("DELETE FROM elorus_invoices WHERE synced_at <> ?").run(syncedAt);
      db.prepare(`
        UPDATE finance_sync_runs
        SET finished_at = ?, status = 'success', list_count = ?, details_fetched = ?,
          invoices_upserted = ?, items_upserted = ?, error = NULL
        WHERE id = ?
      `).run(syncedAt, list.length, details.length, list.length, itemCount, runId);
      db.prepare(`
        INSERT INTO metadata (key, value) VALUES ('elorus_last_synced_at', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `).run(syncedAt);
      db.exec("COMMIT");

      return {
        ok: true,
        source: "elorus",
        readOnlyApi: true,
        databasePath,
        backupPath,
        startedAt,
        finishedAt: syncedAt,
        listCount: list.length,
        detailsFetched: details.length,
        invoicesUpserted: list.length,
        itemsUpserted: itemCount,
      };
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  } catch (error) {
    if (runId) {
      db.prepare(`
        UPDATE finance_sync_runs
        SET finished_at = ?, status = 'failed', error = ?
        WHERE id = ?
      `).run(new Date().toISOString(), error instanceof Error ? error.message.slice(0, 500) : "sync_failed", runId);
    }
    throw error;
  } finally {
    db.close();
  }
}

function parseArgs(argv) {
  const args = { databasePath: DEFAULT_DATABASE, createBackup: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--database") args.databasePath = path.resolve(argv[++index]);
    else if (value === "--backup") args.createBackup = true;
    else if (value === "--help") args.help = true;
    else throw new Error(`Unknown argument: ${value}`);
  }
  return args;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("Usage: node scripts/sync-elorus-finance.mjs [--database <file>] [--backup]");
  } else {
    syncElorusFinance(args)
      .then((result) => console.log(JSON.stringify(result)))
      .catch((error) => {
        console.error(JSON.stringify({
          ok: false,
          error: error instanceof Error ? error.message : "sync_failed",
        }));
        process.exitCode = 1;
      });
  }
}
