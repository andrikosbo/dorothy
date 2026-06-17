"use strict";

const fs = require("fs");
const crypto = require("crypto");
const os = require("os");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const DEFAULT_DATABASE_PATH = path.join(
  os.homedir(),
  ".openclaw",
  "data",
  "dorothy-open-banking.sqlite",
);

function openDatabase(databasePath = process.env.DOROTHY_OPEN_BANKING_DB || DEFAULT_DATABASE_PATH) {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true, mode: 0o700 });
  try { fs.chmodSync(path.dirname(databasePath), 0o700); } catch {}
  const db = new DatabaseSync(databasePath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS open_banking_auth_states (
      state TEXT PRIMARY KEY,
      bank_name TEXT NOT NULL,
      psu_type TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT
    );

    CREATE TABLE IF NOT EXISTS open_banking_sessions (
      session_id TEXT PRIMARY KEY,
      bank_name TEXT NOT NULL,
      psu_type TEXT NOT NULL,
      authorized_at TEXT NOT NULL,
      valid_until TEXT,
      status TEXT NOT NULL DEFAULT 'active'
    );

    CREATE TABLE IF NOT EXISTS open_banking_accounts (
      account_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      bank_name TEXT NOT NULL,
      display_name TEXT,
      currency TEXT,
      masked_identifier TEXT,
      FOREIGN KEY(session_id) REFERENCES open_banking_sessions(session_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS open_banking_sync_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      date_from TEXT NOT NULL,
      date_to TEXT NOT NULL,
      status TEXT NOT NULL,
      account_count INTEGER NOT NULL DEFAULT 0,
      account_success_count INTEGER NOT NULL DEFAULT 0,
      balance_count INTEGER NOT NULL DEFAULT 0,
      transaction_count INTEGER NOT NULL DEFAULT 0,
      error_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS open_banking_account_snapshots (
      account_id TEXT PRIMARY KEY,
      encrypted_payload TEXT NOT NULL,
      synced_at TEXT NOT NULL,
      FOREIGN KEY(account_id) REFERENCES open_banking_accounts(account_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS open_banking_transactions (
      fingerprint TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      booking_date TEXT NOT NULL,
      status TEXT,
      encrypted_payload TEXT NOT NULL,
      synced_at TEXT NOT NULL,
      FOREIGN KEY(account_id) REFERENCES open_banking_accounts(account_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS open_banking_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS open_banking_transactions_date_idx
      ON open_banking_transactions(booking_date DESC);
    CREATE INDEX IF NOT EXISTS open_banking_transactions_account_idx
      ON open_banking_transactions(account_id, booking_date DESC);
  `);
  secureDatabaseFiles(databasePath);
  return db;
}

function secureDatabaseFiles(databasePath) {
  for (const filename of [databasePath, `${databasePath}-wal`, `${databasePath}-shm`]) {
    try { fs.chmodSync(filename, 0o600); } catch {}
  }
}

function createAuthState({ state, bankName, psuType, ttlMinutes = 15 }, databasePath) {
  const db = openDatabase(databasePath);
  try {
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + ttlMinutes * 60_000);
    db.prepare(`
      INSERT INTO open_banking_auth_states
        (state, bank_name, psu_type, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(state, bankName, psuType, createdAt.toISOString(), expiresAt.toISOString());
    return { state, bankName, psuType, expiresAt: expiresAt.toISOString() };
  } finally {
    db.close();
  }
}

function consumeAuthState(state, databasePath) {
  const db = openDatabase(databasePath);
  try {
    const row = db.prepare(`
      SELECT state, bank_name, psu_type, expires_at, used_at
      FROM open_banking_auth_states
      WHERE state = ?
    `).get(state);
    if (!row || row.used_at || Date.parse(row.expires_at) <= Date.now()) return null;

    db.prepare(`
      UPDATE open_banking_auth_states
      SET used_at = ?
      WHERE state = ? AND used_at IS NULL
    `).run(new Date().toISOString(), state);
    return {
      state: row.state,
      bankName: row.bank_name,
      psuType: row.psu_type,
      expiresAt: row.expires_at,
    };
  } finally {
    db.close();
  }
}

function saveSession(session, metadata, databasePath) {
  const sessionId = String(session?.session_id || session?.id || "").trim();
  if (!sessionId) throw new Error("Enable Banking did not return a session ID.");

  const db = openDatabase(databasePath);
  const authorizedAt = new Date().toISOString();
  const validUntil = session?.access?.valid_until || session?.valid_until || null;
  const accounts = Array.isArray(session?.accounts) ? session.accounts : [];

  try {
    db.exec("BEGIN");
    db.prepare(`
      INSERT INTO open_banking_sessions
        (session_id, bank_name, psu_type, authorized_at, valid_until, status)
      VALUES (?, ?, ?, ?, ?, 'active')
      ON CONFLICT(session_id) DO UPDATE SET
        bank_name = excluded.bank_name,
        psu_type = excluded.psu_type,
        authorized_at = excluded.authorized_at,
        valid_until = excluded.valid_until,
        status = 'active'
    `).run(
      sessionId,
      metadata.bankName,
      metadata.psuType,
      authorizedAt,
      validUntil,
    );

    for (const account of accounts) {
      const accountId = String(
        typeof account === "string" ? account : account?.uid || account?.account_id || account?.id || ""
      ).trim();
      if (!accountId) continue;

      const identifier = account?.account_id?.iban
        || account?.iban
        || account?.identification
        || "";
      db.prepare(`
        INSERT INTO open_banking_accounts
          (account_id, session_id, bank_name, display_name, currency, masked_identifier)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(account_id) DO UPDATE SET
          session_id = excluded.session_id,
          bank_name = excluded.bank_name,
          display_name = excluded.display_name,
          currency = excluded.currency,
          masked_identifier = excluded.masked_identifier
      `).run(
        accountId,
        sessionId,
        metadata.bankName,
        String(account?.name || account?.product || account?.cash_account_type || "").slice(0, 160),
        String(account?.currency || "").slice(0, 12),
        maskIdentifier(identifier),
      );
    }
    db.exec("COMMIT");
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch {}
    throw error;
  } finally {
    db.close();
  }

  return { sessionId, accountCount: accounts.length };
}

function getStatus(databasePath) {
  const db = openDatabase(databasePath);
  try {
    const sessions = db.prepare(`
      SELECT session_id, bank_name, psu_type, authorized_at, valid_until, status
      FROM open_banking_sessions
      ORDER BY authorized_at DESC
    `).all().map(row => ({
      sessionId: row.session_id,
      bankName: row.bank_name,
      psuType: row.psu_type,
      authorizedAt: row.authorized_at,
      validUntil: row.valid_until,
      status: row.status,
    }));
    const accounts = db.prepare(`
      SELECT account_id, session_id, bank_name, display_name, currency, masked_identifier
      FROM open_banking_accounts
      ORDER BY bank_name, display_name, account_id
    `).all().map(row => ({
      accountId: row.account_id,
      sessionId: row.session_id,
      bankName: row.bank_name,
      displayName: row.display_name,
      currency: row.currency,
      maskedIdentifier: row.masked_identifier,
    }));
    return { sessions, accounts };
  } finally {
    db.close();
  }
}

function startSyncRun({ dateFrom, dateTo, accountCount }, databasePath) {
  const db = openDatabase(databasePath);
  try {
    const result = db.prepare(`
      INSERT INTO open_banking_sync_runs
        (started_at, date_from, date_to, status, account_count)
      VALUES (?, ?, ?, 'running', ?)
    `).run(new Date().toISOString(), dateFrom, dateTo, accountCount);
    return Number(result.lastInsertRowid);
  } finally {
    db.close();
  }
}

function finishSyncRun(runId, result, databasePath) {
  const db = openDatabase(databasePath);
  try {
    db.prepare(`
      UPDATE open_banking_sync_runs
      SET finished_at = ?, status = ?, account_success_count = ?,
        balance_count = ?, transaction_count = ?, error_count = ?
      WHERE id = ?
    `).run(
      new Date().toISOString(),
      result.status,
      Number(result.accountSuccessCount || 0),
      Number(result.balanceCount || 0),
      Number(result.transactionCount || 0),
      Number(result.errorCount || 0),
      runId,
    );
  } finally {
    db.close();
  }
}

function latestSuccessfulSync(databasePath) {
  const db = openDatabase(databasePath);
  try {
    const row = db.prepare(`
      SELECT started_at, finished_at, date_from, date_to, account_count,
        account_success_count, balance_count, transaction_count, error_count
      FROM open_banking_sync_runs
      WHERE status IN ('success', 'partial')
      ORDER BY id DESC LIMIT 1
    `).get();
    if (!row) return null;
    return {
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      dateFrom: row.date_from,
      dateTo: row.date_to,
      accountCount: Number(row.account_count || 0),
      accountSuccessCount: Number(row.account_success_count || 0),
      balanceCount: Number(row.balance_count || 0),
      transactionCount: Number(row.transaction_count || 0),
      errorCount: Number(row.error_count || 0),
    };
  } finally {
    db.close();
  }
}

function saveAccountSnapshot(accountId, payload, encryptionKey, databasePath) {
  const db = openDatabase(databasePath);
  try {
    db.prepare(`
      INSERT INTO open_banking_account_snapshots
        (account_id, encrypted_payload, synced_at)
      VALUES (?, ?, ?)
      ON CONFLICT(account_id) DO UPDATE SET
        encrypted_payload = excluded.encrypted_payload,
        synced_at = excluded.synced_at
    `).run(
      accountId,
      encryptPayload(payload, encryptionKey),
      new Date().toISOString(),
    );
  } finally {
    db.close();
  }
}

function saveTransactions(accountId, transactions, encryptionKey, databasePath) {
  if (!transactions.length) return 0;
  const db = openDatabase(databasePath);
  const syncedAt = new Date().toISOString();
  let count = 0;
  try {
    db.exec("BEGIN");
    const statement = db.prepare(`
      INSERT INTO open_banking_transactions
        (fingerprint, account_id, booking_date, status, encrypted_payload, synced_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(fingerprint) DO UPDATE SET
        booking_date = excluded.booking_date,
        status = excluded.status,
        encrypted_payload = excluded.encrypted_payload,
        synced_at = excluded.synced_at
    `);
    for (const transaction of transactions) {
      statement.run(
        transactionFingerprint(accountId, transaction, encryptionKey),
        accountId,
        transaction.bookingDate,
        transaction.status || "",
        encryptPayload(transaction, encryptionKey),
        syncedAt,
      );
      count += 1;
    }
    db.exec("COMMIT");
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch {}
    throw error;
  } finally {
    db.close();
  }
  return count;
}

function pruneTransactions(beforeDate, databasePath) {
  const db = openDatabase(databasePath);
  try {
    return Number(db.prepare(`
      DELETE FROM open_banking_transactions WHERE booking_date < ?
    `).run(beforeDate).changes || 0);
  } finally {
    db.close();
  }
}

function readBankData(encryptionKey, databasePath) {
  const db = openDatabase(databasePath);
  try {
    const accounts = db.prepare(`
      SELECT a.account_id, a.bank_name, a.display_name, a.currency,
        a.masked_identifier, s.encrypted_payload, s.synced_at
      FROM open_banking_accounts a
      LEFT JOIN open_banking_account_snapshots s ON s.account_id = a.account_id
      ORDER BY a.bank_name, a.display_name, a.account_id
    `).all().map(row => ({
      accountId: row.account_id,
      bankName: row.bank_name,
      displayName: row.display_name,
      currency: row.currency,
      maskedIdentifier: row.masked_identifier,
      syncedAt: row.synced_at || null,
      snapshot: row.encrypted_payload
        ? decryptPayload(row.encrypted_payload, encryptionKey)
        : null,
    }));
    const transactions = db.prepare(`
      SELECT account_id, booking_date, encrypted_payload
      FROM open_banking_transactions
      ORDER BY booking_date DESC
    `).all().map(row => ({
      accountId: row.account_id,
      bookingDate: row.booking_date,
      ...decryptPayload(row.encrypted_payload, encryptionKey),
    }));
    return { accounts, transactions };
  } finally {
    db.close();
  }
}

function recategorizeStoredTransactions(categorizeTransaction, categoryVersion, encryptionKey, databasePath) {
  const db = openDatabase(databasePath);
  const metadataKey = "spending_category_version";
  try {
    const currentVersion = db.prepare(
      "SELECT value FROM open_banking_metadata WHERE key = ?"
    ).get(metadataKey)?.value;
    if (Number(currentVersion) === Number(categoryVersion)) return 0;

    const rows = db.prepare(
      "SELECT fingerprint, encrypted_payload FROM open_banking_transactions"
    ).all();
    const update = db.prepare(`
      UPDATE open_banking_transactions
      SET encrypted_payload = ?
      WHERE fingerprint = ?
    `);
    let count = 0;

    db.exec("BEGIN");
    for (const row of rows) {
      const transaction = decryptPayload(row.encrypted_payload, encryptionKey);
      const category = categorizeTransaction(transaction);
      if (
        transaction.category !== category
        || Number(transaction.categoryVersion || 0) !== Number(categoryVersion)
      ) {
        update.run(encryptPayload({
          ...transaction,
          category,
          categoryVersion,
        }, encryptionKey), row.fingerprint);
        count += 1;
      }
    }
    db.prepare(`
      INSERT INTO open_banking_metadata (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(metadataKey, String(categoryVersion));
    db.exec("COMMIT");
    secureDatabaseFiles(databasePath);
    return count;
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch {}
    throw error;
  } finally {
    db.close();
  }
}

function deriveEncryptionKey(privateKey, applicationId) {
  return crypto.createHash("sha256")
    .update("dorothy-open-banking-data-v1\0")
    .update(String(applicationId || ""))
    .update("\0")
    .update(privateKey)
    .digest();
}

function encryptPayload(payload, encryptionKey) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey, iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return ["v1", iv, tag, encrypted].map(value => (
    Buffer.isBuffer(value) ? value.toString("base64url") : value
  )).join(".");
}

function decryptPayload(value, encryptionKey) {
  const [version, iv, tag, encrypted] = String(value || "").split(".");
  if (version !== "v1" || !iv || !tag || !encrypted) {
    throw new Error("Invalid encrypted open banking payload.");
  }
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    encryptionKey,
    Buffer.from(iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return JSON.parse(Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64url")),
    decipher.final(),
  ]).toString("utf8"));
}

function transactionFingerprint(accountId, transaction, encryptionKey) {
  const identity = [
    accountId,
    transaction.transactionId || "",
    transaction.entryReference || "",
    transaction.bookingDate || "",
    transaction.amount || 0,
    transaction.currency || "",
    transaction.description || "",
  ].join("\0");
  return crypto.createHmac("sha256", encryptionKey).update(identity).digest("hex");
}

function maskIdentifier(value) {
  const normalized = String(value || "").replace(/\s+/g, "");
  if (!normalized) return "";
  if (normalized.length <= 8) return `••••${normalized.slice(-4)}`;
  return `${normalized.slice(0, 4)}••••${normalized.slice(-4)}`;
}

module.exports = {
  DEFAULT_DATABASE_PATH,
  consumeAuthState,
  createAuthState,
  decryptPayload,
  deriveEncryptionKey,
  encryptPayload,
  finishSyncRun,
  getStatus,
  latestSuccessfulSync,
  maskIdentifier,
  openDatabase,
  pruneTransactions,
  readBankData,
  recategorizeStoredTransactions,
  saveAccountSnapshot,
  saveSession,
  saveTransactions,
  secureDatabaseFiles,
  startSyncRun,
  transactionFingerprint,
};
