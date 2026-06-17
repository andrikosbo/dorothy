"use strict";

const fs = require("fs");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.join(__dirname, "..");

test("service worker removes legacy caches and uses a network-only fetch policy", () => {
  const source = fs.readFileSync(path.join(root, "public", "sw.js"), "utf8");

  assert.match(source, /key\.startsWith\(CACHE_PREFIX\)/);
  assert.match(source, /caches\.delete\(key\)/);
  assert.match(source, /addEventListener\(["']fetch["']/);
  assert.match(source, /cache:\s*["']no-store["']/);
  assert.doesNotMatch(source, /caches\.open\(/);
  assert.doesNotMatch(source, /caches\.match\(/);
});

test("HTML references the current build and bypasses the service worker script cache", () => {
  const html = fs.readFileSync(path.join(root, "public", "index.html"), "utf8");
  const version = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version
    .replace(/\./g, "\\.");

  assert.match(html, new RegExp(`app\\.js\\?v=${version}`));
  assert.match(html, new RegExp(`style\\.css\\?v=${version}`));
  assert.match(html, /updateViaCache:\s*['"]none['"]/);
});
