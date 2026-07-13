"use strict";

const fs = require("fs");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");

const { extractInsights } = require("../document-intelligence.js");
const { classifyBrowserAction } = require("../feature-store.js");

test("browser actions distinguish read-only work from side effects", () => {
  const readOnly = classifyBrowserAction("Άνοιξε τη σελίδα και πες μου τον τίτλο");
  const sideEffect = classifyBrowserAction("Συμπλήρωσε τη φόρμα και πάτα submit");

  assert.equal(readOnly.requiresConfirmation, false);
  assert.equal(readOnly.risk, "read-only");
  assert.equal(sideEffect.requiresConfirmation, true);
  assert.equal(sideEffect.risk, "confirmation");
});

test("document extraction finds dates, amounts, and email addresses", () => {
  const insights = extractInsights(
    "Invoice due 13/06/2026. Total 125,00 € and contact qa@example.com."
  );

  assert.deepEqual(insights.dates, ["13/06/2026"]);
  assert.deepEqual(insights.amounts, ["125,00 €"]);
  assert.deepEqual(insights.emails, ["qa@example.com"]);
});

test("manifest exposes Dorothy as a PWA share target", () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "public", "manifest.json"), "utf8")
  );

  assert.equal(manifest.share_target.action, "/share");
  assert.equal(manifest.share_target.method, "POST");
  assert.equal(manifest.share_target.params.files[0].name, "file");
});

test("communications expose cross-device dismiss and undo controls", () => {
  const features = fs.readFileSync(
    path.join(__dirname, "..", "public", "features.js"),
    "utf8"
  );
  const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  const cache = fs.readFileSync(
    path.join(__dirname, "..", "communications-cache.js"),
    "utf8"
  );

  assert.match(features, /data-mail-quick-dismiss/);
  assert.match(features, /Dismiss · Διαβάστηκε/);
  assert.match(features, /Αναίρεση/);
  assert.match(server, /\/api\\\/communications\\\/\(\\d\+\)\\\/read/);
  assert.match(cache, /readStatus = options\.read/);
});

test("settings use non-scrolling navigation and sessions expose delete controls", () => {
  const html = fs.readFileSync(
    path.join(__dirname, "..", "public", "index.html"),
    "utf8"
  );
  const app = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
  const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");

  assert.match(html, /class="settings-body"/);
  assert.match(html, /aria-label="Κατηγορίες ρυθμίσεων"/);
  assert.match(app, /className = "session-delete"/);
  assert.match(app, /method: "DELETE"/);
  assert.match(server, /deleteStoredSession/);
});
