"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  categorizeTransaction,
  fetchTransactions,
  normalizeBalance,
  normalizeTransaction,
} = require("../open-banking-sync.js");

test("normalizes debit and credit transactions with stable categories", () => {
  const debit = normalizeTransaction({
    transaction_amount: { amount: "12.45", currency: "EUR" },
    credit_debit_indicator: "DBIT",
    booking_date: "2026-06-14",
    creditor: { name: "NETFLIX.COM" },
    remittance_information: ["Monthly subscription"],
    status: "BOOK",
  });
  const credit = normalizeTransaction({
    transaction_amount: { amount: "500", currency: "EUR" },
    credit_debit_indicator: "CRDT",
    booking_date: "2026-06-13",
    debtor: { name: "Client SA" },
    status: "BOOK",
  });

  assert.equal(debit.amount, -12.45);
  assert.equal(debit.category, "subscriptions");
  assert.equal(credit.amount, 500);
  assert.equal(credit.category, "income");
});

test("normalizes debit balances as negative", () => {
  assert.deepEqual(normalizeBalance({
    balance_amount: { amount: "100.25", currency: "EUR" },
    credit_debit_indicator: "DBIT",
    balance_type: "CLBD",
  }), {
    amount: -100.25,
    currency: "EUR",
    type: "CLBD",
    referenceDate: null,
  });
});

test("transaction pagination stops after the final continuation key", async () => {
  const calls = [];
  const client = {
    async getAccountTransactions(_accountId, options) {
      calls.push(options.continuationKey || "");
      return options.continuationKey
        ? { transactions: [{ id: 2 }], continuation_key: null }
        : { transactions: [{ id: 1 }], continuation_key: "next-page" };
    },
  };

  const rows = await fetchTransactions(client, "account-1", {
    dateFrom: "2026-05-01",
    dateTo: "2026-06-14",
    maxPages: 10,
  });
  assert.deepEqual(rows, [{ id: 1 }, { id: 2 }]);
  assert.deepEqual(calls, ["", "next-page"]);
});

test("categorizes common Greek banking descriptions", () => {
  assert.equal(categorizeTransaction({
    amount: -20,
    description: "ΣΚΛΑΒΕΝΙΤΗΣ",
    counterparty: "",
  }), "groceries");
  assert.equal(categorizeTransaction({
    amount: -80,
    description: "ΑΑΔΕ",
    counterparty: "",
  }), "taxes");
});

test("separates delivery platforms from restaurant spending", () => {
  for (const merchant of ["WOLT", "EFOOD*019E7A0", "e-food.gr"]) {
    assert.equal(categorizeTransaction({
      amount: -20,
      description: merchant,
      counterparty: "",
    }), "delivery");
  }
  assert.equal(categorizeTransaction({
    amount: -20,
    description: "PIZZA FAN",
    counterparty: "",
  }), "dining");
});

test("uses bank transaction details and MCC as classification fallbacks", () => {
  assert.equal(categorizeTransaction({
    amount: -40,
    description: "Συναλλαγή",
    bankTransactionCode: { description: "ΠΛΗΡΩΜΗ ΚΑΡΤΑΣ" },
  }), "transfer");
  assert.equal(categorizeTransaction({
    amount: -15,
    description: "Card purchase",
    merchantCategoryCode: "5411",
  }), "groceries");
});
