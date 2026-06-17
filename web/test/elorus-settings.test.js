"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  API_KEY_SERVICE,
  ORGANIZATION_ID_SERVICE,
  readElorusSettings,
  saveElorusSettings,
  validateElorusSettings,
} = require("../elorus-settings.js");

test("validates first-time Elorus credentials", () => {
  assert.equal(validateElorusSettings({
    apiKey: "a".repeat(40),
    organizationId: "1871067974387893841",
  }).ok, true);

  assert.equal(validateElorusSettings({
    apiKey: "",
    organizationId: "1871067974387893841",
  }).ok, false);

  assert.equal(validateElorusSettings({
    apiKey: "a".repeat(40),
    organizationId: "not-numeric",
  }).ok, false);
});

test("status never exposes the stored API key", async () => {
  const secrets = new Map([
    [API_KEY_SERVICE, "secret-value-that-must-not-be-returned"],
    [ORGANIZATION_ID_SERVICE, "1871067974387893841"],
  ]);
  const runCommand = async (_command, args) => {
    const service = args[args.indexOf("-s") + 1];
    return secrets.has(service)
      ? { ok: true, stdout: secrets.get(service), stderr: "" }
      : { ok: false, stdout: "", stderr: "not found" };
  };

  const status = await readElorusSettings(runCommand);
  assert.deepEqual(status, {
    ok: true,
    apiKeyConfigured: true,
    organizationId: "1871067974387893841",
    storage: "macOS Keychain",
  });
  assert.equal(JSON.stringify(status).includes("secret-value"), false);
});

test("blank API key preserves an existing key while updating organization", async () => {
  const secrets = new Map([
    [API_KEY_SERVICE, "a".repeat(40)],
    [ORGANIZATION_ID_SERVICE, "11111111"],
  ]);
  const writes = [];
  const runCommand = async (_command, args) => {
    const service = args[args.indexOf("-s") + 1];
    if (args[0] === "find-generic-password") {
      return secrets.has(service)
        ? { ok: true, stdout: secrets.get(service), stderr: "" }
        : { ok: false, stdout: "", stderr: "not found" };
    }
    const value = args[args.indexOf("-w") + 1];
    secrets.set(service, value);
    writes.push({ service, value });
    return { ok: true, stdout: "", stderr: "" };
  };

  const result = await saveElorusSettings({
    apiKey: "",
    organizationId: "1871067974387893841",
  }, runCommand);

  assert.equal(result.ok, true);
  assert.deepEqual(writes, [{
    service: ORGANIZATION_ID_SERVICE,
    value: "1871067974387893841",
  }]);
  assert.equal(secrets.get(API_KEY_SERVICE), "a".repeat(40));
});
