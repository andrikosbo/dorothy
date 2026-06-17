"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  API_KEY_SERVICE,
  readGeminiSettings,
  saveGeminiSettings,
  validateGeminiApiKey,
} = require("../gemini-settings.js");

const VALID_KEY = `AIza${"a".repeat(35)}`;

test("validates Gemini API keys without exposing them", () => {
  assert.equal(validateGeminiApiKey({ apiKey: VALID_KEY }).ok, true);
  assert.equal(validateGeminiApiKey({ apiKey: "not-a-google-key" }).ok, false);
  assert.equal(validateGeminiApiKey({ apiKey: "" }, true).ok, true);
});

test("Gemini status reports configuration without returning the key", async () => {
  const runCommand = async (_command, args) => ({
    ok: args.includes(API_KEY_SERVICE),
    stdout: VALID_KEY,
    stderr: "",
  });

  const status = await readGeminiSettings(runCommand);
  assert.equal(status.apiKeyConfigured, true);
  assert.equal(JSON.stringify(status).includes(VALID_KEY), false);
});

test("saving a Gemini key writes Keychain and provisions OpenClaw through stdin", async () => {
  const calls = [];
  const runCommand = async (command, args, timeout, input) => {
    calls.push({ command, args, timeout, input });
    if (args[0] === "find-generic-password") {
      return { ok: false, stdout: "", stderr: "not found" };
    }
    return { ok: true, stdout: "", stderr: "" };
  };

  const result = await saveGeminiSettings({ apiKey: VALID_KEY }, runCommand);

  assert.equal(result.ok, true);
  assert.equal(calls.some(call => call.args.includes(API_KEY_SERVICE)), true);
  const authCall = calls.find(call => call.args.includes("paste-api-key"));
  assert.equal(authCall.input, `${VALID_KEY}\n`);
  assert.deepEqual(authCall.args.slice(-4), [
    "--provider",
    "google",
    "--profile-id",
    "google:default",
  ]);
});
