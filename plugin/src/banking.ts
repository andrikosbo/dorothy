import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export const BANKING_DAYS_MAX = 365;
export const BANKING_LIMIT_MAX = 100;

const DEFAULT_APPLICATION_ID = "";
const DEFAULT_DATABASE_PATH = path.join(
  os.homedir(),
  ".openclaw",
  "data",
  "dorothy-open-banking.sqlite",
);
const CATEGORY_LABELS: Record<string, string> = {
  income: "Έσοδα",
  transfer: "Μεταφορές",
  delivery: "Delivery",
  groceries: "Σούπερ μάρκετ",
  dining: "Εστίαση",
  transport: "Μετακινήσεις",
  utilities: "Λογαριασμοί",
  subscriptions: "Συνδρομές",
  shopping: "Αγορές",
  health: "Υγεία",
  taxes: "Φόροι",
  cash: "Μετρητά",
  fees: "Τραπεζικά έξοδα",
  travel: "Ταξίδια",
  housing: "Στέγαση",
  entertainment: "Ψυχαγωγία",
  insurance: "Ασφάλειες",
  education: "Εκπαίδευση",
  pets: "Κατοικίδια",
  business: "Επαγγελματικά",
  other: "Λοιπά",
};

type JsonRow = Record<string, unknown>;
type BankingInput = {
  view?: "overview" | "accounts" | "categories" | "recent";
  days?: number;
  limit?: number;
  bank?: string;
  category?: string;
  search?: string;
  from?: string;
  to?: string;
};
type Account = {
  accountId: string;
  bankName: string;
  displayName: string;
  maskedIdentifier: string;
  currency: string;
  syncedAt: string | null;
  balances: Balance[];
};
type Balance = {
  amount: number;
  currency: string;
  type: string;
};
type Transaction = {
  accountId: string;
  bookingDate: string;
  amount: number;
  currency: string;
  status: string;
  description: string;
  counterparty: string;
  category: string;
};

function applicationId() {
  return String(process.env.ENABLE_BANKING_APP_ID || DEFAULT_APPLICATION_ID);
}

function privateKeyPath() {
  const id = applicationId();
  return process.env.ENABLE_BANKING_PRIVATE_KEY_PATH
    || path.join(os.homedir(), ".openclaw", "secrets", "enable-banking", `${id}.pem`);
}

export function deriveBankingEncryptionKey(privateKey: Buffer, appId: string) {
  return crypto.createHash("sha256")
    .update("dorothy-open-banking-data-v1\0")
    .update(appId)
    .update("\0")
    .update(privateKey)
    .digest();
}

export function encryptBankingPayload(payload: unknown, key: Buffer) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return ["v1", iv, tag, encrypted].map((value) => (
    Buffer.isBuffer(value) ? value.toString("base64url") : value
  )).join(".");
}

function decryptPayload(value: unknown, key: Buffer) {
  const [version, iv, tag, encrypted] = String(value || "").split(".");
  if (version !== "v1" || !iv || !tag || !encrypted) throw new Error("banking_decryption_failed");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return JSON.parse(Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64url")),
    decipher.final(),
  ]).toString("utf8")) as JsonRow;
}

function openDatabase(databasePath?: string) {
  try {
    return new DatabaseSync(
      databasePath || process.env.DOROTHY_OPEN_BANKING_DB || DEFAULT_DATABASE_PATH,
      { readOnly: true },
    );
  } catch {
    throw new Error("banking_database_missing");
  }
}

function tableExists(db: DatabaseSync, table: string) {
  return Boolean(db.prepare(`
    SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?
  `).get(table));
}

function readData(db: DatabaseSync, key: Buffer, from: string, to?: string) {
  if (!tableExists(db, "open_banking_accounts")
    || !tableExists(db, "open_banking_transactions")
    || !tableExists(db, "open_banking_account_snapshots")) {
    throw new Error("banking_database_not_synced");
  }

  const accounts = (db.prepare(`
    SELECT a.account_id, a.bank_name, a.display_name, a.currency,
      a.masked_identifier, s.encrypted_payload, s.synced_at
    FROM open_banking_accounts a
    LEFT JOIN open_banking_account_snapshots s ON s.account_id = a.account_id
    ORDER BY a.bank_name, a.display_name, a.account_id
  `).all() as JsonRow[]).map((row): Account => {
    const payload = row.encrypted_payload
      ? decryptPayload(row.encrypted_payload, key)
      : {};
    return {
      accountId: String(row.account_id || ""),
      bankName: String(row.bank_name || ""),
      displayName: String(row.display_name || "Λογαριασμός"),
      maskedIdentifier: String(row.masked_identifier || ""),
      currency: String(row.currency || ""),
      syncedAt: row.synced_at ? String(row.synced_at) : null,
      balances: Array.isArray(payload.balances) ? payload.balances as Balance[] : [],
    };
  });

  const transactions = (db.prepare(`
    SELECT account_id, encrypted_payload
    FROM open_banking_transactions
    WHERE booking_date >= ?${to ? " AND booking_date <= ?" : ""}
    ORDER BY booking_date DESC
  `).all(...(to ? [from, to] : [from])) as JsonRow[]).map((row): Transaction => {
    const payload = decryptPayload(row.encrypted_payload, key);
    return {
      accountId: String(row.account_id || ""),
      bookingDate: String(payload.bookingDate || ""),
      amount: Number(payload.amount || 0),
      currency: String(payload.currency || ""),
      status: String(payload.status || ""),
      description: String(payload.description || ""),
      counterparty: String(payload.counterparty || ""),
      category: String(payload.category || "other"),
    };
  });
  return { accounts, transactions };
}

function preferredBalance(account: Account) {
  const rows = account.balances.filter((balance) => (
    !account.currency || balance.currency === account.currency
  ));
  const priorities = ["CLBD", "ITAV", "XPCD", "OPBD", "closingBooked", "interimAvailable"];
  return priorities.map((type) => rows.find((row) => row.type === type)).find(Boolean)
    || rows[0]
    || null;
}

function latestSync(db: DatabaseSync) {
  if (!tableExists(db, "open_banking_sync_runs")) return null;
  const row = db.prepare(`
    SELECT finished_at, date_from, date_to, account_count, account_success_count,
      balance_count, transaction_count, error_count
    FROM open_banking_sync_runs
    WHERE status IN ('success', 'partial')
    ORDER BY id DESC LIMIT 1
  `).get() as JsonRow | undefined;
  return row ? {
    finishedAt: String(row.finished_at || ""),
    dateFrom: String(row.date_from || ""),
    dateTo: String(row.date_to || ""),
    accountCount: Number(row.account_count || 0),
    accountSuccessCount: Number(row.account_success_count || 0),
    balanceCount: Number(row.balance_count || 0),
    transactionCount: Number(row.transaction_count || 0),
    errorCount: Number(row.error_count || 0),
  } : null;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function bounded(value: number | undefined, fallback: number, maximum: number) {
  return Math.min(Math.max(Math.floor(value ?? fallback), 1), maximum);
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function lastDayOfMonth(month: string) {
  const [year, mon] = month.split("-").map(Number);
  return formatDate(new Date(Date.UTC(year, mon, 0)));
}

// Resolve an explicit date window from from/to inputs. Accepts YYYY-MM (whole
// month) or YYYY-MM-DD. Returns null when no valid explicit range is given, so
// the caller falls back to the rolling `days` window.
function resolveWindow(input: BankingInput) {
  const isDay = (value?: string) => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
  const isMonth = (value?: string) => Boolean(value && /^\d{4}-\d{2}$/.test(value));
  if (!isDay(input.from) && !isMonth(input.from) && !isDay(input.to) && !isMonth(input.to)) {
    return null;
  }
  let from: string | undefined;
  let to: string | undefined;
  if (isMonth(input.from)) from = `${input.from}-01`;
  else if (isDay(input.from)) from = input.from;
  if (isMonth(input.to)) to = lastDayOfMonth(input.to as string);
  else if (isDay(input.to)) to = input.to;
  // A single month given as `from` (no `to`) means "that whole month".
  if (isMonth(input.from) && !input.to) to = lastDayOfMonth(input.from as string);
  // Clamp the lower bound to the retention window.
  const floor = new Date();
  floor.setUTCHours(0, 0, 0, 0);
  floor.setUTCDate(floor.getUTCDate() - (BANKING_DAYS_MAX - 1));
  const floorStr = formatDate(floor);
  if (!from || from < floorStr) from = floorStr;
  return { from, to };
}

function safeFailure(error: unknown) {
  const message = error instanceof Error ? error.message : "banking_unavailable";
  const known = new Set([
    "banking_database_missing",
    "banking_database_not_synced",
    "banking_decryption_failed",
    "banking_key_missing",
  ]);
  return {
    ok: false,
    readOnly: true,
    paymentInitiation: false,
    error: known.has(message) ? message : "banking_unavailable",
  };
}

export async function readBankingSummary(
  input: BankingInput = {},
  databasePath?: string,
  encryptionKey?: Buffer,
): Promise<Record<string, unknown>> {
  let db: DatabaseSync | undefined;
  try {
    const limit = bounded(input.limit, 20, BANKING_LIMIT_MAX);
    const window = resolveWindow(input);
    let from: string;
    let to: string | undefined;
    let days: number | null;
    if (window) {
      from = window.from;
      to = window.to;
      days = null;
    } else {
      days = bounded(input.days, 30, BANKING_DAYS_MAX);
      const fromDate = new Date();
      fromDate.setUTCHours(0, 0, 0, 0);
      fromDate.setUTCDate(fromDate.getUTCDate() - (days - 1));
      from = formatDate(fromDate);
    }
    const key = encryptionKey || (() => {
      try {
        return deriveBankingEncryptionKey(fs.readFileSync(privateKeyPath()), applicationId());
      } catch {
        throw new Error("banking_key_missing");
      }
    })();
    db = openDatabase(databasePath);
    const data = readData(db, key, from, to);
    const accountMap = new Map(data.accounts.map((account) => [account.accountId, account]));
    const bankQuery = input.bank?.trim().toLocaleLowerCase("el");
    const categoryQuery = input.category?.trim().toLocaleLowerCase("el");
    const searchQuery = input.search?.trim().toLocaleLowerCase("el");
    const transactions = data.transactions.filter((transaction) => {
      if (["CNCL", "RJCT"].includes(transaction.status)) return false;
      const account = accountMap.get(transaction.accountId);
      if (bankQuery && !account?.bankName.toLocaleLowerCase("el").includes(bankQuery)) return false;
      const label = CATEGORY_LABELS[transaction.category] || transaction.category;
      if (categoryQuery
        && !`${transaction.category} ${label}`.toLocaleLowerCase("el").includes(categoryQuery)) {
        return false;
      }
      if (searchQuery) {
        const haystack = `${transaction.description} ${transaction.counterparty} ${label}`
          .toLocaleLowerCase("el");
        if (!haystack.includes(searchQuery)) return false;
      }
      return true;
    });
    const accounts = data.accounts
      .filter((account) => !bankQuery || account.bankName.toLocaleLowerCase("el").includes(bankQuery))
      .map((account) => {
        const balance = preferredBalance(account);
        return {
          bankName: account.bankName,
          displayName: account.displayName,
          maskedIdentifier: account.maskedIdentifier,
          currency: balance?.currency || account.currency,
          balance: balance ? roundMoney(Number(balance.amount || 0)) : null,
          isCard: /card|κάρτ/i.test(account.displayName),
          syncedAt: account.syncedAt,
        };
      });
    const categoryTotals = new Map<string, number>();
    for (const transaction of transactions.filter((row) => row.amount < 0)) {
      categoryTotals.set(
        transaction.category,
        (categoryTotals.get(transaction.category) || 0) + Math.abs(transaction.amount),
      );
    }
    const categories = [...categoryTotals.entries()]
      .map(([category, amount]) => ({
        category,
        label: CATEGORY_LABELS[category] || category,
        amount: roundMoney(amount),
      }))
      .sort((a, b) => b.amount - a.amount);
    const inflow = transactions
      .filter((row) => row.amount > 0)
      .reduce((sum, row) => sum + row.amount, 0);
    const outflow = Math.abs(transactions
      .filter((row) => row.amount < 0)
      .reduce((sum, row) => sum + row.amount, 0));
    const eurCashBalance = accounts
      .filter((account) => account.currency === "EUR" && !account.isCard && account.balance !== null)
      .reduce((sum, account) => sum + Number(account.balance || 0), 0);
    const recent = transactions.slice(0, limit).map((transaction) => ({
      bookingDate: transaction.bookingDate,
      amount: roundMoney(transaction.amount),
      currency: transaction.currency,
      description: transaction.description,
      counterparty: transaction.counterparty,
      category: transaction.category,
      categoryLabel: CATEGORY_LABELS[transaction.category] || transaction.category,
      bankName: accountMap.get(transaction.accountId)?.bankName || "",
      account: accountMap.get(transaction.accountId)?.maskedIdentifier || "",
    }));
    const common = {
      ok: true,
      readOnly: true,
      paymentInitiation: false,
      encryptedAtRest: true,
      days,
      from,
      to: to ?? null,
      lastSync: latestSync(db),
      caveats: [
        "This is a personal cash-flow view, not an accounting, tax, investment, or credit statement.",
        "Own-account transfers may inflate gross inflows and outflows.",
        "Bank data may be delayed or incomplete; official bank records prevail.",
      ],
    };
    const view = input.view || "overview";
    if (view === "accounts") return { ...common, view, count: accounts.length, accounts };
    if (view === "categories") {
      return { ...common, view, count: Math.min(categories.length, limit), categories: categories.slice(0, limit) };
    }
    if (view === "recent") return { ...common, view, count: recent.length, transactions: recent };
    return {
      ...common,
      view,
      summary: {
        bankCount: new Set(accounts.map((account) => account.bankName)).size,
        accountCount: accounts.length,
        eurCashBalance: roundMoney(eurCashBalance),
        inflow: roundMoney(inflow),
        outflow: roundMoney(outflow),
        netFlow: roundMoney(inflow - outflow),
        transactionCount: transactions.length,
      },
      accounts,
      categories: categories.slice(0, Math.min(limit, 12)),
      recentTransactions: recent,
    };
  } catch (error) {
    return safeFailure(error);
  } finally {
    db?.close();
  }
}
