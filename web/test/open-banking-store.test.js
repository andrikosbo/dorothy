"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  consumeAuthState,
  createAuthState,
  deriveEncryptionKey,
  encryptPayload,
  getStatus,
  maskIdentifier,
  readBankData,
  recategorizeStoredTransactions,
  saveAccountSnapshot,
  saveSession,
  saveTransactions,
} = require("../open-banking-store.js");

function testDatabase() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dorothy-open-banking-"));
  return path.join(directory, "open-banking.sqlite");
}

test("authorization state can be consumed only once", () => {
  const databasePath = testDatabase();
  createAuthState({
    state: "state-value",
    bankName: "Alpha Bank",
    psuType: "personal",
  }, databasePath);

  assert.equal(consumeAuthState("state-value", databasePath).bankName, "Alpha Bank");
  assert.equal(consumeAuthState("state-value", databasePath), null);
});

test("stores only masked account identifiers", () => {
  const databasePath = testDatabase();
  saveSession({
    session_id: "session-1",
    accounts: [{
      uid: "account-1",
      name: "Current account",
      currency: "EUR",
      iban: "GR1601101250000000012300695",
    }],
  }, {
    bankName: "National Bank of Greece",
    psuType: "personal",
  }, databasePath);

  const status = getStatus(databasePath);
  assert.equal(status.sessions.length, 1);
  assert.equal(status.accounts.length, 1);
  assert.equal(status.accounts[0].maskedIdentifier, "GR16••••0695");
  assert.equal(JSON.stringify(status).includes("000000012300"), false);
});

test("masks short and long account identifiers", () => {
  assert.equal(maskIdentifier("1234"), "••••1234");
  assert.equal(maskIdentifier("GR0012345678"), "GR00••••5678");
});

test("encrypts balances and transaction details at rest", () => {
  const databasePath = testDatabase();
  const key = deriveEncryptionKey(Buffer.from("private-key-material"), "application-id");
  saveSession({
    session_id: "session-1",
    accounts: [{ uid: "account-1", name: "Main", currency: "EUR" }],
  }, {
    bankName: "Test Bank",
    psuType: "personal",
  }, databasePath);
  saveAccountSnapshot("account-1", {
    balances: [{ amount: 1234.56, currency: "EUR", type: "CLBD" }],
  }, key, databasePath);
  saveTransactions("account-1", [{
    bookingDate: "2026-06-14",
    amount: -42.5,
    currency: "EUR",
    description: "Sensitive merchant description",
    category: "shopping",
  }], key, databasePath);

  const bytes = fs.readFileSync(databasePath).toString("utf8");
  assert.equal(bytes.includes("Sensitive merchant description"), false);
  assert.equal(bytes.includes("1234.56"), false);
  const data = readBankData(key, databasePath);
  assert.equal(data.accounts[0].snapshot.balances[0].amount, 1234.56);
  assert.equal(data.transactions[0].description, "Sensitive merchant description");
});

test("encrypted payload uses authenticated encryption", () => {
  const key = deriveEncryptionKey(Buffer.from("key"), "app");
  const encrypted = encryptPayload({ secret: "value" }, key);
  assert.match(encrypted, /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.equal(encrypted.includes("value"), false);
});

test("migrates encrypted transaction categories once per rules version", () => {
  const databasePath = testDatabase();
  const key = deriveEncryptionKey(Buffer.from("private-key-material"), "application-id");
  saveSession({
    session_id: "session-1",
    accounts: [{ uid: "account-1", name: "Main", currency: "EUR" }],
  }, {
    bankName: "Test Bank",
    psuType: "personal",
  }, databasePath);
  saveTransactions("account-1", [{
    bookingDate: "2026-06-14",
    amount: -18,
    currency: "EUR",
    description: "WOLT",
    category: "dining",
  }], key, databasePath);

  const categorize = transaction => transaction.description === "WOLT" ? "delivery" : "other";
  assert.equal(recategorizeStoredTransactions(categorize, 2, key, databasePath), 1);
  assert.equal(readBankData(key, databasePath).transactions[0].category, "delivery");
  assert.equal(recategorizeStoredTransactions(categorize, 2, key, databasePath), 0);
});
