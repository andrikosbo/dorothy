"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  isAutomated,
  isNoise,
  isReplyCandidate,
  isAttentionWorthy,
  isActionable,
  isPendingCandidate,
  summarizeToday,
} = require("../public/communications-summary.js");

const NOW = new Date("2026-06-11T21:30:00+03:00");

function mail(overrides) {
  return {
    sender: "Person <person@example.com>",
    subject: "Κανονικό μήνυμα",
    excerpt: "",
    receivedAt: "2026-06-11T17:00:00Z",
    read: true,
    flagged: false,
    replied: false,
    ...overrides,
  };
}

test("filters newsletters and WordPress comment spam as noise", () => {
  assert.equal(isNoise(mail({
    sender: "ABOUT YOU Προσφορές <news@aboutyou.com>",
    subject: "Early Summer Deals: Έως και -50%",
  })), true);

  assert.equal(isNoise(mail({
    sender: "WordPress <no-reply@example.gr>",
    subject: "Παρακαλούμε συντονίστε: νέο σχόλιο",
    excerpt: "Υπάρχει ένα νέο σχόλιο για έγκριση https://spam.example.ru",
  })), true);
});

test("reply candidates exclude automated notifications but keep human mail", () => {
  assert.equal(isReplyCandidate(mail({ read: false })), true);
  assert.equal(isReplyCandidate(mail({
    sender: "Temu <temu@orders.temu.com>",
    subject: "Your order was delivered",
  })), false);
  assert.equal(isReplyCandidate(mail({
    sender: "Apple <noreply@email.apple.com>",
    subject: "An app-specific password was generated",
  })), false);
  assert.equal(isReplyCandidate(mail({
    sender: "myschool Ενημερωτικό Σημείωμα <myschool-info@sch.gr>",
    subject: "ΕΝΗΜΕΡΩΣΗ ΕΚΔΡΟΜΗΣ",
  })), false);
});

test("attention excludes marketing and treats read mail as completed", () => {
  assert.equal(isAttentionWorthy(mail({
    sender: "Shop <news@shop.example>",
    subject: "Newsletter: Offers",
    read: false,
  })), false);
  assert.equal(isAttentionWorthy(mail({
    sender: "Netflix <info@account.netflix.com>",
    subject: "A new device is using your account",
    read: true,
  })), false);
  assert.equal(isAttentionWorthy(mail({
    sender: "Netflix <info@account.netflix.com>",
    subject: "A new device is using your account",
    read: false,
  })), true);
  assert.equal(isAttentionWorthy(mail({
    subject: "Παλιό αλλά flagged",
    read: true,
    flagged: true,
  })), true);
});

test("automated reports and product announcements are never reply candidates", () => {
  const ollama = mail({
    sender: "Ollama <hello@ollama.com>",
    subject: "Kimi K2.7 Code is now on Ollama's US-hosted cloud",
    read: false,
  });
  const jetpack = mail({
    sender: "Jetpack.com <updates@jetpack.com>",
    subject: "Jetpack Monthly Report - https://example.com",
    read: false,
  });
  assert.equal(isAutomated(ollama), true);
  assert.equal(isAutomated(jetpack), true);
  assert.equal(isReplyCandidate(ollama), false);
  assert.equal(isReplyCandidate(jetpack), false);
  assert.equal(isActionable(ollama), false);
  assert.equal(isActionable(jetpack), false);
});

test("read human mail is excluded from reply-needed", () => {
  assert.equal(isReplyCandidate(mail({ read: true })), false);
  assert.equal(isReplyCandidate(mail({ read: false })), true);
});

test("classified pending work survives read state in the pending view", () => {
  assert.equal(isPendingCandidate(mail({
    read: true,
    intelligence: {
      category: "work",
      action: "task",
      status: "pending",
    },
  })), true);
});

test("daily digest merges related Apple, Temu, and Skroutz messages", () => {
  const summary = summarizeToday([
    mail({
      sender: "Apple <noreply@email.apple.com>",
      subject: "Your Apple Account was used to sign in to iCloud via a web browser.",
      read: false,
    }),
    mail({
      sender: "Apple <noreply@email.apple.com>",
      subject: "An app-specific password was generated for your Apple Account.",
      read: false,
    }),
    mail({
      sender: "Temu <temu@orders.temu.com>",
      subject: "Your Temu order delivered notification (#PO-079-05251791876472009)",
      flagged: true,
    }),
    mail({
      sender: "Temu <temu@orders.temu.com>",
      subject: "Your Temu order has been partially refunded (#PO-079-05251791876472009)",
      excerpt: "Total Refund amount: 4,55€",
      flagged: true,
    }),
    mail({
      sender: "Skroutz <ecommerce-support@skroutz.gr>",
      subject: "Μόλις λάβαμε την παραγγελία σου #260611-6659847",
      flagged: true,
    }),
    mail({
      sender: "Revolut <no-reply@revolut.com>",
      subject: "Your Skroutz order",
      flagged: true,
    }),
  ], { now: NOW });

  assert.equal(summary.totalMessages, 6);
  assert.equal(summary.groups.length, 3);
  assert.equal(summary.collapsedMessages, 3);
  assert.match(summary.groups[0].summary, /Apple Account/);
  assert.match(summary.groups.find(group => group.key.includes("temu")).summary, /4,55€/);
  assert.match(summary.groups.find(group => group.key.includes("skroutz")).summary, /Revolut/);
});
