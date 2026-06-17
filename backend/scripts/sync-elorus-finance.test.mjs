import assert from "node:assert/strict";
import test from "node:test";
import { classifyElorusItem } from "./sync-elorus-finance.mjs";

test("classifies common Elorus revenue lines", () => {
  assert.equal(classifyElorusItem("Web hosting", "Cloud 2GB").category, "hosting");
  assert.equal(classifyElorusItem("Domain name", "example.gr annual renewal").category, "domain");
  assert.equal(classifyElorusItem("WP-Support", "monthly backups and security check").category, "maintenance");
  assert.equal(classifyElorusItem("Κατασκευή ιστοσελίδας", "WordPress").category, "web_design");
  assert.equal(classifyElorusItem("Google Ads", "Campaign management").category, "marketing");
  assert.equal(classifyElorusItem("SSL certificate", "").category, "ssl");
  assert.equal(classifyElorusItem("Microsoft 365 mailbox", "").category, "email");
});

test("falls back transparently instead of inventing a category", () => {
  assert.deepEqual(classifyElorusItem("Custom consulting", "One-off work"), {
    category: "other",
    source: "fallback_other",
  });
});
