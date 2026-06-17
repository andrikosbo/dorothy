"use strict";

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const API_BASE_URL = "https://api.enablebanking.com";
const DEFAULT_REDIRECT_URL = "https://dorothy.your-tailnet.ts.net/api/open-banking/callback";

function base64url(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function resolveConfiguration(env = process.env) {
  const applicationId = String(env.ENABLE_BANKING_APP_ID || "").trim();
  const privateKeyPath = path.resolve(String(
    env.ENABLE_BANKING_PRIVATE_KEY_PATH
      || path.join(os.homedir(), ".openclaw", "secrets", "enable-banking", `${applicationId}.pem`)
  ));
  const redirectUrl = String(env.ENABLE_BANKING_REDIRECT_URL || DEFAULT_REDIRECT_URL).trim();

  return { applicationId, privateKeyPath, redirectUrl };
}

function configurationStatus(env = process.env) {
  const config = resolveConfiguration(env);
  let privateKeyConfigured = false;
  let privateKeySecure = false;

  try {
    const stat = fs.statSync(config.privateKeyPath);
    privateKeyConfigured = stat.isFile();
    privateKeySecure = (stat.mode & 0o077) === 0;
  } catch {}

  return {
    configured: Boolean(config.applicationId && config.redirectUrl && privateKeyConfigured),
    applicationId: config.applicationId,
    redirectUrl: config.redirectUrl,
    privateKeyConfigured,
    privateKeySecure,
  };
}

function createJwt({ applicationId, privateKey, now = Date.now(), ttlSeconds = 3600 }) {
  if (!/^[0-9a-f-]{36}$/i.test(String(applicationId || ""))) {
    throw new Error("Enable Banking application ID is not configured.");
  }
  if (!privateKey) throw new Error("Enable Banking private key is not configured.");

  const issuedAt = Math.floor(now / 1000);
  const expiresAt = issuedAt + Math.min(Math.max(Number(ttlSeconds) || 3600, 60), 86_400);
  const header = base64url(JSON.stringify({
    typ: "JWT",
    alg: "RS256",
    kid: applicationId,
  }));
  const payload = base64url(JSON.stringify({
    iss: "enablebanking.com",
    aud: "api.enablebanking.com",
    iat: issuedAt,
    exp: expiresAt,
  }));
  const signingInput = `${header}.${payload}`;
  const signature = crypto.sign("RSA-SHA256", Buffer.from(signingInput), privateKey);
  return `${signingInput}.${base64url(signature)}`;
}

function createEnableBankingClient(options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const config = resolveConfiguration(env);

  if (typeof fetchImpl !== "function") {
    throw new Error("Fetch is unavailable.");
  }

  function jwt() {
    const privateKey = fs.readFileSync(config.privateKeyPath);
    return createJwt({
      applicationId: config.applicationId,
      privateKey,
      now: options.now ? options.now() : Date.now(),
    });
  }

  async function request(method, pathname, body) {
    const response = await fetchImpl(`${API_BASE_URL}${pathname}`, {
      method,
      headers: {
        "Accept": "application/json",
        "Authorization": `Bearer ${jwt()}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

    const raw = await response.text();
    let payload = {};
    try {
      payload = raw ? JSON.parse(raw) : {};
    } catch {
      payload = { message: raw.slice(0, 500) };
    }

    if (!response.ok) {
      const message = payload?.error_description
        || payload?.detail
        || payload?.message
        || payload?.error
        || `Enable Banking returned HTTP ${response.status}`;
      const error = new Error(String(message));
      error.status = response.status;
      error.payload = payload;
      throw error;
    }

    return payload;
  }

  return {
    config: {
      applicationId: config.applicationId,
      redirectUrl: config.redirectUrl,
    },
    getApplication() {
      return request("GET", "/application");
    },
    listBanks(country = "GR") {
      return request("GET", `/aspsps?country=${encodeURIComponent(country)}`);
    },
    startAuthorization({ bankName, state, psuType = "personal", validUntil }) {
      return request("POST", "/auth", {
        access: { valid_until: validUntil },
        aspsp: { name: bankName, country: "GR" },
        state,
        redirect_url: config.redirectUrl,
        psu_type: psuType,
        language: "en",
      });
    },
    createSession(code) {
      return request("POST", "/sessions", { code });
    },
    getAccountBalances(accountId) {
      return request("GET", `/accounts/${encodeURIComponent(accountId)}/balances`);
    },
    getAccountTransactions(accountId, options = {}) {
      const query = new URLSearchParams();
      if (options.dateFrom) query.set("date_from", options.dateFrom);
      if (options.dateTo) query.set("date_to", options.dateTo);
      if (options.continuationKey) query.set("continuation_key", options.continuationKey);
      if (options.transactionStatus) query.set("transaction_status", options.transactionStatus);
      if (options.strategy) query.set("strategy", options.strategy);
      const suffix = query.size ? `?${query.toString()}` : "";
      return request(
        "GET",
        `/accounts/${encodeURIComponent(accountId)}/transactions${suffix}`,
      );
    },
  };
}

module.exports = {
  API_BASE_URL,
  DEFAULT_REDIRECT_URL,
  base64url,
  configurationStatus,
  createEnableBankingClient,
  createJwt,
  resolveConfiguration,
};
