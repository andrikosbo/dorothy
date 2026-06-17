"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildCommunicationOverview,
  classifyCommunication,
  enrichCommunications,
} = require("../communication-intelligence.js");

const NOW = "2026-06-14T10:00:00+03:00";

function mail(overrides = {}) {
  return {
    mailId: 1,
    messageId: "message-1",
    account: "iCloud",
    accountAddresses: ["user@example.com"],
    sender: "Person <person@example.com>",
    subject: "Κανονικό μήνυμα",
    excerpt: "",
    receivedAt: "2026-06-14T06:30:00Z",
    read: false,
    flagged: false,
    replied: false,
    ...overrides,
  };
}

test("classifies OTP separately, expires it, and does not create a task", () => {
  const result = classifyCommunication(mail({
    sender: "Bank <no-reply@bank.example>",
    subject: "Your verification code",
    excerpt: "Use verification code 123456 to continue.",
    receivedAt: "2026-06-14T06:30:00Z",
  }), { now: NOW, channel: "mail" });

  assert.equal(result.category, "otp");
  assert.equal(result.action, "none");
  assert.equal(result.status, "expired");
  assert.equal(result.sensitive, true);
});

test("keeps read human work requests pending until replied or tracked", () => {
  const item = mail({
    accountAddresses: ["info@acme.example"],
    subject: "Hosting update",
    excerpt: "Μπορείς να μου στείλεις τα νέα στοιχεία μέχρι αύριο;",
    read: true,
  });
  const pending = classifyCommunication(item, { now: NOW, channel: "mail" });
  const tracked = classifyCommunication(item, {
    now: NOW,
    channel: "mail",
    trackedSourceIds: new Set(["mail:message-1"]),
  });

  assert.equal(pending.category, "work");
  assert.equal(pending.action, "reply");
  assert.equal(pending.status, "pending");
  assert.equal(tracked.status, "tracked");
});

test("redacts OTP digits before persisting enriched cache items", () => {
  const [item] = enrichCommunications([mail({
    subject: "Security code",
    excerpt: "Your security code is 654321.",
  })], { now: NOW, channel: "mail" });

  assert.equal(item.intelligence.category, "otp");
  assert.doesNotMatch(item.excerpt, /654321/);
});

test("keeps read security alerts classified without treating them as pending", () => {
  const result = classifyCommunication(mail({
    sender: "Account <no-reply@example.com>",
    subject: "New device signed in",
    read: true,
  }), { now: NOW, channel: "mail" });

  assert.equal(result.category, "security");
  assert.equal(result.action, "none");
  assert.equal(result.status, "informational");
});

test("builds a bounded pending overview grouped by category and status", () => {
  const items = enrichCommunications([
    mail({
      messageId: "work-1",
      accountAddresses: ["info@acme.example"],
      excerpt: "Μπορείς να ετοιμάσεις την προσφορά;",
    }),
    mail({
      mailId: 2,
      messageId: "promo-1",
      sender: "Shop <news@shop.example>",
      subject: "Newsletter: summer deals",
    }),
  ], { now: NOW, channel: "mail" });
  const overview = buildCommunicationOverview(items, { now: NOW });

  assert.equal(overview.total, 2);
  assert.equal(overview.pendingCount, 1);
  assert.equal(overview.byCategory.work, 1);
  assert.equal(overview.byCategory.marketing, 1);
  assert.equal(overview.pending[0].messageId, "work-1");
});
