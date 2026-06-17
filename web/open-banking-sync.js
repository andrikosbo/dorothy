"use strict";

const fs = require("fs");
const {
  createEnableBankingClient,
  resolveConfiguration,
} = require("./enable-banking-client.js");
const {
  deriveEncryptionKey,
  finishSyncRun,
  getStatus,
  latestSuccessfulSync,
  pruneTransactions,
  readBankData,
  recategorizeStoredTransactions,
  saveAccountSnapshot,
  saveTransactions,
  startSyncRun,
} = require("./open-banking-store.js");
const {
  CATEGORY_LABELS,
  CATEGORY_VERSION,
  categorizeTransaction,
} = require("./spending-categories.js");

function encryptionKey(env = process.env) {
  const config = resolveConfiguration(env);
  return deriveEncryptionKey(fs.readFileSync(config.privateKeyPath), config.applicationId);
}

async function syncOpenBanking(options = {}) {
  const client = options.client || createEnableBankingClient();
  const databasePath = options.databasePath;
  const key = options.encryptionKey || encryptionKey(options.env);
  const status = getStatus(databasePath);
  const accounts = status.accounts || [];
  const today = startOfUtcDay(options.now || new Date());
  const previous = latestSuccessfulSync(databasePath);
  const initialDays = Math.min(Math.max(Number(options.initialDays || 90), 30), 365);
  const overlapDays = Math.min(Math.max(Number(options.overlapDays || 14), 3), 30);
  const dateFrom = formatDate(addDays(today, previous ? -overlapDays : -initialDays));
  const dateTo = formatDate(today);
  const runId = startSyncRun({ dateFrom, dateTo, accountCount: accounts.length }, databasePath);
  const result = {
    ok: true,
    status: "success",
    dateFrom,
    dateTo,
    accountCount: accounts.length,
    accountSuccessCount: 0,
    balanceCount: 0,
    transactionCount: 0,
    errorCount: 0,
    errors: [],
  };

  for (const account of accounts) {
    try {
      const balancesPayload = await client.getAccountBalances(account.accountId);
      const balances = (balancesPayload.balances || []).map(normalizeBalance).filter(Boolean);
      saveAccountSnapshot(account.accountId, { balances }, key, databasePath);
      result.balanceCount += balances.length;

      const transactions = await fetchTransactions(client, account.accountId, {
        dateFrom,
        dateTo,
        maxPages: options.maxPages || 100,
      });
      result.transactionCount += saveTransactions(
        account.accountId,
        transactions.map(normalizeTransaction).filter(Boolean),
        key,
        databasePath,
      );
      result.accountSuccessCount += 1;
    } catch (error) {
      result.errorCount += 1;
      result.errors.push({
        bankName: account.bankName,
        maskedIdentifier: account.maskedIdentifier,
        error: safeError(error),
      });
    }
    if (options.delayMs !== 0) await delay(options.delayMs || 120);
  }

  pruneTransactions(formatDate(addDays(today, -400)), databasePath);
  result.status = result.errorCount === 0
    ? "success"
    : result.accountSuccessCount > 0
      ? "partial"
      : "failed";
  result.ok = result.status !== "failed";
  finishSyncRun(runId, result, databasePath);
  return result;
}

async function fetchTransactions(client, accountId, options) {
  const transactions = [];
  let continuationKey = "";
  const seen = new Set();

  for (let page = 0; page < options.maxPages; page += 1) {
    const payload = await client.getAccountTransactions(accountId, {
      dateFrom: options.dateFrom,
      dateTo: options.dateTo,
      continuationKey,
      strategy: "default",
    });
    transactions.push(...(payload.transactions || []));
    continuationKey = String(payload.continuation_key || "");
    if (!continuationKey || seen.has(continuationKey)) break;
    seen.add(continuationKey);
  }
  return transactions;
}

function normalizeBalance(balance) {
  const amount = Number(balance?.balance_amount?.amount ?? balance?.balanceAmount?.amount);
  const currency = String(
    balance?.balance_amount?.currency ?? balance?.balanceAmount?.currency ?? ""
  ).toUpperCase();
  if (!Number.isFinite(amount) || !currency) return null;
  const indicator = String(
    balance?.credit_debit_indicator ?? balance?.creditDebitIndicator ?? ""
  ).toUpperCase();
  return {
    amount: indicator === "DBIT" ? -Math.abs(amount) : amount,
    currency,
    type: String(balance?.balance_type ?? balance?.balanceType ?? balance?.name ?? ""),
    referenceDate: balance?.reference_date ?? balance?.referenceDate ?? null,
  };
}

function normalizeTransaction(transaction) {
  const rawAmount = Number(
    transaction?.transaction_amount?.amount ?? transaction?.transactionAmount?.amount
  );
  const currency = String(
    transaction?.transaction_amount?.currency ?? transaction?.transactionAmount?.currency ?? ""
  ).toUpperCase();
  const indicator = String(
    transaction?.credit_debit_indicator ?? transaction?.creditDebitIndicator ?? ""
  ).toUpperCase();
  const bookingDate = String(
    transaction?.booking_date
      ?? transaction?.bookingDate
      ?? transaction?.value_date
      ?? transaction?.valueDate
      ?? ""
  ).slice(0, 10);
  if (!Number.isFinite(rawAmount) || !currency || !/^\d{4}-\d{2}-\d{2}$/.test(bookingDate)) {
    return null;
  }

  const amount = indicator === "DBIT"
    ? -Math.abs(rawAmount)
    : indicator === "CRDT"
      ? Math.abs(rawAmount)
      : rawAmount;
  const creditor = partyName(transaction?.creditor);
  const debtor = partyName(transaction?.debtor);
  const bankTransactionCode = normalizeBankTransactionCode(
    transaction?.bank_transaction_code ?? transaction?.bankTransactionCode
  );
  const remittance = Array.isArray(transaction?.remittance_information)
    ? transaction.remittance_information.join(" ")
    : Array.isArray(transaction?.remittanceInformation)
      ? transaction.remittanceInformation.join(" ")
      : "";
  const description = firstText([
    remittance,
    transaction?.note,
    amount < 0 ? creditor : debtor,
    bankTransactionCode.description,
    transaction?.reference_number,
    transaction?.referenceNumber,
    transaction?.entry_reference,
    transaction?.entryReference,
    "Συναλλαγή",
  ]);
  const counterparty = firstText([amount < 0 ? creditor : debtor, creditor, debtor]);

  return {
    transactionId: String(transaction?.transaction_id ?? transaction?.transactionId ?? ""),
    entryReference: String(transaction?.entry_reference ?? transaction?.entryReference ?? ""),
    bookingDate,
    valueDate: String(transaction?.value_date ?? transaction?.valueDate ?? "").slice(0, 10),
    amount: roundMoney(amount),
    currency,
    status: String(transaction?.status || ""),
    indicator,
    description: description.slice(0, 500),
    counterparty: counterparty.slice(0, 240),
    merchantCategoryCode: String(
      transaction?.merchant_category_code ?? transaction?.merchantCategoryCode ?? ""
    ),
    bankTransactionCode,
    category: categorizeTransaction({
      amount,
      description,
      counterparty,
      merchantCategoryCode: transaction?.merchant_category_code ?? transaction?.merchantCategoryCode,
      bankTransactionCode,
    }),
    categoryVersion: CATEGORY_VERSION,
  };
}

function getOpenBankingOverview(options = {}) {
  const key = options.encryptionKey || encryptionKey(options.env);
  const databasePath = options.databasePath;
  const now = options.now || new Date();
  const days = Math.min(Math.max(Number(options.days || 30), 7), 365);
  const from = formatDate(addDays(startOfUtcDay(now), -(days - 1)));
  recategorizeStoredTransactions(
    categorizeTransaction,
    CATEGORY_VERSION,
    key,
    databasePath,
  );
  const data = readBankData(key, databasePath);
  const accountMap = new Map(data.accounts.map(account => [account.accountId, account]));
  const recent = data.transactions.filter(transaction => transaction.bookingDate >= from);
  const booked = recent.filter(transaction => !["CNCL", "RJCT"].includes(transaction.status));
  const inflow = booked.filter(row => row.amount > 0).reduce((sum, row) => sum + row.amount, 0);
  const outflow = Math.abs(
    booked.filter(row => row.amount < 0).reduce((sum, row) => sum + row.amount, 0)
  );
  const categoryMap = new Map();
  for (const row of booked.filter(item => item.amount < 0)) {
    categoryMap.set(row.category, (categoryMap.get(row.category) || 0) + Math.abs(row.amount));
  }
  const categories = [...categoryMap.entries()]
    .map(([category, amount]) => ({
      category,
      label: CATEGORY_LABELS[category] || category,
      amount: roundMoney(amount),
    }))
    .sort((a, b) => b.amount - a.amount);

  const accounts = data.accounts.map(account => {
    const balances = account.snapshot?.balances || [];
    const preferred = preferredBalance(balances, account.currency);
    return {
      bankName: account.bankName,
      displayName: account.displayName || "Λογαριασμός",
      maskedIdentifier: account.maskedIdentifier,
      currency: preferred?.currency || account.currency,
      balance: preferred ? roundMoney(preferred.amount) : null,
      isCard: /card|κάρτ/i.test(account.displayName || ""),
      syncedAt: account.syncedAt,
    };
  });
  const eurCashBalance = accounts
    .filter(account => account.currency === "EUR" && !account.isCard && account.balance !== null)
    .reduce((sum, account) => sum + account.balance, 0);

  return {
    ok: true,
    days,
    from,
    summary: {
      bankCount: new Set(accounts.map(account => account.bankName)).size,
      accountCount: accounts.length,
      eurCashBalance: roundMoney(eurCashBalance),
      inflow: roundMoney(inflow),
      outflow: roundMoney(outflow),
      netFlow: roundMoney(inflow - outflow),
      transactionCount: booked.length,
    },
    accounts,
    categories,
    recentTransactions: booked.slice(0, 30).map(transaction => ({
      bookingDate: transaction.bookingDate,
      amount: transaction.amount,
      currency: transaction.currency,
      description: transaction.description,
      counterparty: transaction.counterparty,
      category: transaction.category,
      categoryLabel: CATEGORY_LABELS[transaction.category] || transaction.category,
      bankName: accountMap.get(transaction.accountId)?.bankName || "",
      account: accountMap.get(transaction.accountId)?.maskedIdentifier || "",
    })),
    lastSync: latestSuccessfulSync(databasePath),
  };
}

function preferredBalance(balances, currency) {
  const rows = balances.filter(balance => !currency || balance.currency === currency);
  const priorities = ["CLBD", "ITAV", "XPCD", "OPBD", "closingBooked", "interimAvailable"];
  return priorities.map(type => rows.find(row => row.type === type)).find(Boolean) || rows[0] || null;
}

function partyName(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return String(value.name || value.full_name || "");
}

function normalizeBankTransactionCode(value) {
  if (!value || typeof value !== "object") {
    return { description: "", code: "", subCode: "" };
  }
  return {
    description: String(value.description || "").slice(0, 240),
    code: String(value.code || value.family || "").slice(0, 80),
    subCode: String(value.sub_code || value.subCode || value.sub_family || "").slice(0, 80),
  };
}

function firstText(values) {
  return values.map(value => String(value || "").trim()).find(Boolean) || "";
}

function safeError(error) {
  const value = String(error?.message || "Unknown sync error");
  return value.replace(/[A-Z]{2}\d{10,34}/g, "[redacted]").slice(0, 240);
}

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function startOfUtcDay(value) {
  const date = new Date(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 86_400_000);
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  CATEGORY_LABELS,
  categorizeTransaction,
  encryptionKey,
  fetchTransactions,
  getOpenBankingOverview,
  normalizeBalance,
  normalizeTransaction,
  syncOpenBanking,
};
