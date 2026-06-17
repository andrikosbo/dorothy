"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  CHAT_MODES,
  getChatMode,
  modeForSessionKey,
  normalizeSessionKey,
  publicChatModes,
} = require("../chat-modes.js");

test("chat mode registry exposes the product modes", () => {
  assert.deepEqual(CHAT_MODES.map(mode => mode.id), ["dorothy", "ai"]);
  assert.equal(getChatMode("unknown").id, "dorothy");
  assert.equal(publicChatModes().find(mode => mode.id === "ai").modelSelection, true);
});

test("session keys resolve current mode prefixes", () => {
  assert.equal(modeForSessionKey("web-abc123").id, "dorothy");
  assert.equal(modeForSessionKey("ai-web-abc123").id, "ai");
});

test("session key normalization rejects unknown or unsafe prefixes", () => {
  assert.equal(normalizeSessionKey("ai-web-safe_123"), "ai-web-safe_123");
  assert.equal(normalizeSessionKey("other-web-123"), "");
  assert.equal(normalizeSessionKey("../../web-123"), "");
});
