"use strict";

const KEYCHAIN_ACCOUNT = "dorothy";
const API_KEY_SERVICE = "com.dorothy.elorus.api-key";
const ORGANIZATION_ID_SERVICE = "com.dorothy.elorus.organization-id";
const SECURITY_BIN = "/usr/bin/security";

function validateElorusSettings(input, hasExistingApiKey = false) {
  const apiKey = String(input?.apiKey || "").trim();
  const organizationId = String(input?.organizationId || "").trim();

  if (!apiKey && !hasExistingApiKey) {
    return { ok: false, error: "Το ELORUS_API_KEY είναι υποχρεωτικό." };
  }
  if (apiKey && !/^[A-Za-z0-9_-]{32,128}$/.test(apiKey)) {
    return { ok: false, error: "Το ELORUS_API_KEY δεν έχει έγκυρη μορφή." };
  }
  if (!/^\d{8,30}$/.test(organizationId)) {
    return { ok: false, error: "Το ELORUS_ORGANIZATION_ID πρέπει να περιέχει μόνο ψηφία." };
  }

  return { ok: true, apiKey, organizationId };
}

async function readElorusSettings(runCommand) {
  const [apiKey, organizationId] = await Promise.all([
    readSecret(runCommand, API_KEY_SERVICE),
    readSecret(runCommand, ORGANIZATION_ID_SERVICE),
  ]);

  return {
    ok: true,
    apiKeyConfigured: Boolean(apiKey),
    organizationId: organizationId || "",
    storage: "macOS Keychain",
  };
}

async function saveElorusSettings(input, runCommand) {
  const current = await readElorusSettings(runCommand);
  const validated = validateElorusSettings(input, current.apiKeyConfigured);
  if (!validated.ok) return validated;

  if (validated.apiKey) {
    const apiKeyResult = await writeSecret(runCommand, API_KEY_SERVICE, validated.apiKey);
    if (!apiKeyResult.ok) {
      return { ok: false, error: "Δεν αποθηκεύτηκε το ELORUS_API_KEY στο Keychain." };
    }
  }

  const organizationResult = await writeSecret(
    runCommand,
    ORGANIZATION_ID_SERVICE,
    validated.organizationId,
  );
  if (!organizationResult.ok) {
    return { ok: false, error: "Δεν αποθηκεύτηκε το ELORUS_ORGANIZATION_ID στο Keychain." };
  }

  return {
    ok: true,
    apiKeyConfigured: current.apiKeyConfigured || Boolean(validated.apiKey),
    organizationId: validated.organizationId,
    storage: "macOS Keychain",
  };
}

async function readSecret(runCommand, service) {
  const result = await runCommand(SECURITY_BIN, [
    "find-generic-password",
    "-a",
    KEYCHAIN_ACCOUNT,
    "-s",
    service,
    "-w",
  ]);
  return result.ok ? String(result.stdout || "").trim() : "";
}

async function writeSecret(runCommand, service, value) {
  return runCommand(SECURITY_BIN, [
    "add-generic-password",
    "-a",
    KEYCHAIN_ACCOUNT,
    "-s",
    service,
    "-w",
    value,
    "-U",
  ]);
}

module.exports = {
  API_KEY_SERVICE,
  KEYCHAIN_ACCOUNT,
  ORGANIZATION_ID_SERVICE,
  readElorusSettings,
  saveElorusSettings,
  validateElorusSettings,
};
