"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const {
  createEnableBankingClient,
  createJwt,
} = require("../enable-banking-client.js");

test("creates an RS256 JWT accepted by the configured public key", () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const applicationId = "11111111-1111-1111-1111-111111111111";
  const jwt = createJwt({
    applicationId,
    privateKey,
    now: Date.UTC(2026, 5, 14, 8, 0, 0),
  });
  const [headerPart, payloadPart, signaturePart] = jwt.split(".");
  const header = JSON.parse(Buffer.from(headerPart, "base64url").toString("utf8"));
  const payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8"));

  assert.deepEqual(header, { typ: "JWT", alg: "RS256", kid: applicationId });
  assert.equal(payload.iss, "enablebanking.com");
  assert.equal(payload.aud, "api.enablebanking.com");
  assert.equal(payload.exp - payload.iat, 3600);
  assert.equal(
    crypto.verify(
      "RSA-SHA256",
      Buffer.from(`${headerPart}.${payloadPart}`),
      publicKey,
      Buffer.from(signaturePart, "base64url"),
    ),
    true,
  );
});

test("client exposes account-information calls and no payment calls", () => {
  const client = createEnableBankingClient({
    env: {
      ENABLE_BANKING_APP_ID: "11111111-1111-1111-1111-111111111111",
      ENABLE_BANKING_PRIVATE_KEY_PATH: "/unused-in-test.pem",
      ENABLE_BANKING_REDIRECT_URL: "https://example.test/callback",
    },
    fetchImpl: async () => {
      throw new Error("not called");
    },
  });

  assert.equal("createPayment" in client, false);
  assert.equal("startPayment" in client, false);
  assert.equal(typeof client.getAccountBalances, "function");
  assert.equal(typeof client.getAccountTransactions, "function");
  assert.equal(client.config.redirectUrl, "https://example.test/callback");
});
