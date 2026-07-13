import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  deriveBankingEncryptionKey,
  encryptBankingPayload,
  readBankingSummary,
} from "./banking.js";

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dorothy-banking-"));
  const databasePath = path.join(directory, "banking.sqlite");
  const key = deriveBankingEncryptionKey(Buffer.from("private"), "application");
  const db = new DatabaseSync(databasePath);
  db.exec(`
    CREATE TABLE open_banking_accounts (
      account_id TEXT PRIMARY KEY, session_id TEXT, bank_name TEXT,
      display_name TEXT, currency TEXT, masked_identifier TEXT
    );
    CREATE TABLE open_banking_account_snapshots (
      account_id TEXT PRIMARY KEY, encrypted_payload TEXT, synced_at TEXT
    );
    CREATE TABLE open_banking_transactions (
      fingerprint TEXT PRIMARY KEY, account_id TEXT, booking_date TEXT,
      status TEXT, encrypted_payload TEXT, synced_at TEXT
    );
    CREATE TABLE open_banking_sync_runs (
      id INTEGER PRIMARY KEY, finished_at TEXT, date_from TEXT, date_to TEXT,
      status TEXT, account_count INTEGER, account_success_count INTEGER,
      balance_count INTEGER, transaction_count INTEGER, error_count INTEGER
    );
  `);
  db.prepare("INSERT INTO open_banking_accounts VALUES (?, ?, ?, ?, ?, ?)").run(
    "account-1", "session-1", "Test Bank", "Main", "EUR", "GR00••••1234",
  );
  db.prepare("INSERT INTO open_banking_account_snapshots VALUES (?, ?, ?)").run(
    "account-1",
    encryptBankingPayload({
      balances: [{ amount: 1000, currency: "EUR", type: "CLBD" }],
    }, key),
    new Date().toISOString(),
  );
  const today = new Date().toISOString().slice(0, 10);
  db.prepare("INSERT INTO open_banking_transactions VALUES (?, ?, ?, ?, ?, ?)").run(
    crypto.randomUUID(),
    "account-1",
    today,
    "BOOK",
    encryptBankingPayload({
      bookingDate: today,
      amount: -25,
      currency: "EUR",
      status: "BOOK",
      description: "Supermarket",
      counterparty: "Market",
      category: "groceries",
    }, key),
    new Date().toISOString(),
  );
  db.prepare("INSERT INTO open_banking_sync_runs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
    1, new Date().toISOString(), today, today, "success", 1, 1, 1, 1, 0,
  );
  db.close();
  return { databasePath, key };
}

describe("Dorothy banking summary", () => {
  it("returns a bounded read-only overview without internal identifiers", async () => {
    const { databasePath, key } = fixture();
    const result = await readBankingSummary({ view: "overview", days: 30 }, databasePath, key);
    expect(result).toMatchObject({
      ok: true,
      readOnly: true,
      paymentInitiation: false,
      summary: {
        bankCount: 1,
        accountCount: 1,
        eurCashBalance: 1000,
        outflow: 25,
      },
    });
    expect(JSON.stringify(result)).not.toContain("account-1");
    expect(JSON.stringify(result)).not.toContain("session-1");
  });

  it("fails closed when the encryption key is unavailable", async () => {
    const result = await readBankingSummary({}, "/missing/banking.sqlite", Buffer.alloc(32));
    expect(result).toMatchObject({ ok: false, readOnly: true, paymentInitiation: false });
  });
});
