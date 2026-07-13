"use strict";

// Google Analytics (GA4) integration for Dorothy Web.
// OAuth user-consent flow (analytics.readonly). Mirrors the Keychain secret
// pattern used by elorus-settings.js and the OAuth connect/callback pattern
// used by open banking. All secrets live in the macOS Keychain; nothing is
// written to disk. Read-only — never mutates Google Analytics.

const SECURITY_BIN = "/usr/bin/security";
const KEYCHAIN_ACCOUNT = "dorothy";
const CLIENT_ID_SERVICE = "com.dorothy.analytics.client-id";
const CLIENT_SECRET_SERVICE = "com.dorothy.analytics.client-secret";
const REFRESH_TOKEN_SERVICE = "com.dorothy.analytics.refresh-token";
const PROPERTY_ID_SERVICE = "com.dorothy.analytics.property-id";
const PROPERTY_NAME_SERVICE = "com.dorothy.analytics.property-name";

const OAUTH_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const ADMIN_API = "https://analyticsadmin.googleapis.com/v1beta";
const DATA_API = "https://analyticsdata.googleapis.com/v1beta";
const SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
const DEFAULT_REDIRECT_URI = "https://dorothy.your-tailnet.ts.net/api/analytics/callback";

function redirectUri() {
  return String(process.env.ANALYTICS_REDIRECT_URI || DEFAULT_REDIRECT_URI).trim();
}

// ---- Keychain (same shape as elorus-settings.js) ----
async function readSecret(runCommand, service) {
  const result = await runCommand(SECURITY_BIN, [
    "find-generic-password", "-a", KEYCHAIN_ACCOUNT, "-s", service, "-w",
  ]);
  return result.ok ? String(result.stdout || "").trim() : "";
}

async function writeSecret(runCommand, service, value) {
  return runCommand(SECURITY_BIN, [
    "add-generic-password", "-a", KEYCHAIN_ACCOUNT, "-s", service, "-w", value, "-U",
  ]);
}

async function deleteSecret(runCommand, service) {
  return runCommand(SECURITY_BIN, [
    "delete-generic-password", "-a", KEYCHAIN_ACCOUNT, "-s", service,
  ]);
}

// ---- Settings ----
async function readAnalyticsSettings(runCommand) {
  const [clientId, clientSecret, refresh, propertyId, propertyName] = await Promise.all([
    readSecret(runCommand, CLIENT_ID_SERVICE),
    readSecret(runCommand, CLIENT_SECRET_SERVICE),
    readSecret(runCommand, REFRESH_TOKEN_SERVICE),
    readSecret(runCommand, PROPERTY_ID_SERVICE),
    readSecret(runCommand, PROPERTY_NAME_SERVICE),
  ]);
  return {
    ok: true,
    clientConfigured: Boolean(clientId && clientSecret),
    connected: Boolean(refresh),
    propertyId: propertyId || "",
    propertyName: propertyName || "",
    redirectUri: redirectUri(),
    scope: SCOPE,
    storage: "macOS Keychain",
  };
}

function validateClient(input) {
  const clientId = String(input?.clientId || "").trim();
  const clientSecret = String(input?.clientSecret || "").trim();
  if (!/\.apps\.googleusercontent\.com$/.test(clientId)) {
    return { ok: false, error: "The Client ID must end in .apps.googleusercontent.com" };
  }
  if (clientSecret.length < 10) {
    return { ok: false, error: "The Client Secret is not valid." };
  }
  return { ok: true, clientId, clientSecret };
}

async function saveAnalyticsClient(input, runCommand) {
  const validated = validateClient(input);
  if (!validated.ok) return validated;
  await writeSecret(runCommand, CLIENT_ID_SERVICE, validated.clientId);
  await writeSecret(runCommand, CLIENT_SECRET_SERVICE, validated.clientSecret);
  return { ok: true, clientConfigured: true };
}

async function disconnectAnalytics(runCommand) {
  await Promise.all([
    deleteSecret(runCommand, REFRESH_TOKEN_SERVICE),
    deleteSecret(runCommand, PROPERTY_ID_SERVICE),
    deleteSecret(runCommand, PROPERTY_NAME_SERVICE),
  ]);
  return { ok: true };
}

// ---- OAuth ----
function buildAuthorizationUrl({ clientId, state }) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    state,
  });
  return `${OAUTH_AUTH_URL}?${params.toString()}`;
}

async function startAuthorization({ state, runCommand }) {
  const clientId = await readSecret(runCommand, CLIENT_ID_SERVICE);
  if (!clientId) {
    const error = new Error("client_not_configured");
    error.code = "client_not_configured";
    throw error;
  }
  return { url: buildAuthorizationUrl({ clientId, state }) };
}

async function exchangeCodeForTokens({ code, runCommand }) {
  const [clientId, clientSecret] = await Promise.all([
    readSecret(runCommand, CLIENT_ID_SERVICE),
    readSecret(runCommand, CLIENT_SECRET_SERVICE),
  ]);
  if (!clientId || !clientSecret) throw new Error("client_not_configured");
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri(),
    grant_type: "authorization_code",
  });
  const res = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error_description || data.error || "token_exchange_failed");
    error.status = res.status;
    throw error;
  }
  if (data.refresh_token) {
    await writeSecret(runCommand, REFRESH_TOKEN_SERVICE, data.refresh_token);
  }
  return data;
}

async function getAccessToken(runCommand) {
  const [clientId, clientSecret, refresh] = await Promise.all([
    readSecret(runCommand, CLIENT_ID_SERVICE),
    readSecret(runCommand, CLIENT_SECRET_SERVICE),
    readSecret(runCommand, REFRESH_TOKEN_SERVICE),
  ]);
  if (!clientId || !clientSecret) throw new Error("client_not_configured");
  if (!refresh) throw new Error("not_connected");
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refresh,
    grant_type: "refresh_token",
  });
  const res = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    const error = new Error(data.error_description || data.error || "refresh_failed");
    error.status = res.status;
    throw error;
  }
  return data.access_token;
}

// ---- GA4 reads (read-only) ----
async function listProperties(runCommand) {
  const accessToken = await getAccessToken(runCommand);
  const res = await fetch(`${ADMIN_API}/accountSummaries?pageSize=200`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error?.message || "properties_failed");
    error.status = res.status;
    throw error;
  }
  const properties = [];
  for (const account of data.accountSummaries || []) {
    for (const property of account.propertySummaries || []) {
      properties.push({
        propertyId: String(property.property || "").replace("properties/", ""),
        displayName: String(property.displayName || "Property")
          + (account.displayName ? ` · ${account.displayName}` : ""),
      });
    }
  }
  return { ok: true, properties };
}

async function saveSelectedProperty({ propertyId, propertyName }, runCommand) {
  const id = String(propertyId || "").replace(/[^0-9]/g, "");
  if (!id) return { ok: false, error: "Invalid property id." };
  await writeSecret(runCommand, PROPERTY_ID_SERVICE, id);
  await writeSecret(runCommand, PROPERTY_NAME_SERVICE, String(propertyName || "").slice(0, 120));
  return { ok: true, propertyId: id };
}

function metricValue(row, index) {
  return Number(row?.metricValues?.[index]?.value || 0);
}

async function getOverview(runCommand) {
  const [propertyId, propertyName] = await Promise.all([
    readSecret(runCommand, PROPERTY_ID_SERVICE),
    readSecret(runCommand, PROPERTY_NAME_SERVICE),
  ]);
  if (!propertyId) return { ok: false, error: "not_configured", needsProperty: true };
  const accessToken = await getAccessToken(runCommand);
  const res = await fetch(`${DATA_API}/properties/${propertyId}:runReport`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({
      dateRanges: [{ startDate: "27daysAgo", endDate: "today" }],
      metrics: [
        { name: "activeUsers" },
        { name: "sessions" },
        { name: "screenPageViews" },
        { name: "engagementRate" },
      ],
      dimensions: [{ name: "date" }],
      orderBys: [{ dimension: { dimensionName: "date" } }],
      limit: 60,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error?.message || "report_failed");
    error.status = res.status;
    throw error;
  }
  const rows = data.rows || [];
  const series = rows.map((row) => ({
    date: String(row.dimensionValues?.[0]?.value || ""),
    users: metricValue(row, 0),
    sessions: metricValue(row, 1),
  }));
  const totals = rows.reduce((acc, row) => ({
    users: acc.users + metricValue(row, 0),
    sessions: acc.sessions + metricValue(row, 1),
    pageViews: acc.pageViews + metricValue(row, 2),
  }), { users: 0, sessions: 0, pageViews: 0 });
  const engagementRows = rows.map((row) => metricValue(row, 3)).filter((value) => value > 0);
  const engagementRate = engagementRows.length
    ? engagementRows.reduce((sum, value) => sum + value, 0) / engagementRows.length
    : 0;
  return {
    ok: true,
    propertyId,
    propertyName: propertyName || "",
    window: "28 days",
    totals: {
      users: totals.users,
      sessions: totals.sessions,
      pageViews: totals.pageViews,
      engagementRate: Math.round(engagementRate * 1000) / 10, // percent, 1 decimal
    },
    series,
  };
}

module.exports = {
  CLIENT_ID_SERVICE,
  CLIENT_SECRET_SERVICE,
  REFRESH_TOKEN_SERVICE,
  redirectUri,
  readAnalyticsSettings,
  validateClient,
  saveAnalyticsClient,
  disconnectAnalytics,
  buildAuthorizationUrl,
  startAuthorization,
  exchangeCodeForTokens,
  getAccessToken,
  listProperties,
  saveSelectedProperty,
  getOverview,
};
