"use strict";

const KEYCHAIN_ACCOUNT = "dorothy";
const API_KEY_SERVICE = "com.dorothy.gemini.api-key";
const SECURITY_BIN = "/usr/bin/security";
const OPENCLAW_BIN = process.env.OPENCLAW_BIN || "/opt/homebrew/bin/openclaw";

function validateGeminiApiKey(input, hasExistingApiKey = false) {
  const apiKey = String(input?.apiKey || "").trim();

  if (!apiKey && !hasExistingApiKey) {
    return { ok: false, error: "The Gemini API key is required." };
  }
  if (apiKey && !/^AIza[A-Za-z0-9_-]{30,60}$/.test(apiKey)) {
    return { ok: false, error: "The Gemini API key must start with AIza." };
  }

  return { ok: true, apiKey };
}

async function readGeminiSettings(runCommand) {
  const apiKey = await readSecret(runCommand);
  return {
    ok: true,
    apiKeyConfigured: Boolean(apiKey),
    model: "google/gemini-2.5-flash",
    storage: "macOS Keychain + local OpenClaw auth store",
  };
}

async function saveGeminiSettings(input, runCommand) {
  const current = await readGeminiSettings(runCommand);
  const validated = validateGeminiApiKey(input, current.apiKeyConfigured);
  if (!validated.ok) return validated;

  if (!validated.apiKey) return current;

  const keychainResult = await writeSecret(runCommand, validated.apiKey);
  if (!keychainResult.ok) {
    return { ok: false, error: "The Gemini API key wasn't saved to the Keychain." };
  }

  const authResult = await runCommand(
    OPENCLAW_BIN,
    [
      "models",
      "auth",
      "paste-api-key",
      "--provider",
      "google",
      "--profile-id",
      "google:default",
    ],
    60_000,
    `${validated.apiKey}\n`,
  );
  if (!authResult.ok) {
    return {
      ok: false,
      error: "The key was saved to the Keychain, but wasn't activated in OpenClaw.",
    };
  }

  return {
    ok: true,
    apiKeyConfigured: true,
    model: "google/gemini-2.5-flash",
    storage: "macOS Keychain + local OpenClaw auth store",
  };
}

async function readSecret(runCommand) {
  const result = await runCommand(SECURITY_BIN, [
    "find-generic-password",
    "-a",
    KEYCHAIN_ACCOUNT,
    "-s",
    API_KEY_SERVICE,
    "-w",
  ]);
  return result.ok ? String(result.stdout || "").trim() : "";
}

async function writeSecret(runCommand, value) {
  return runCommand(SECURITY_BIN, [
    "add-generic-password",
    "-a",
    KEYCHAIN_ACCOUNT,
    "-s",
    API_KEY_SERVICE,
    "-w",
    value,
    "-U",
  ]);
}

module.exports = {
  API_KEY_SERVICE,
  KEYCHAIN_ACCOUNT,
  OPENCLAW_BIN,
  readGeminiSettings,
  saveGeminiSettings,
  validateGeminiApiKey,
};
