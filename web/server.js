#!/usr/bin/env node
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");
const {
  CHAT_MODES,
  getChatMode,
  modeForSessionKey,
  normalizeSessionKey,
  publicChatModes,
} = require("./chat-modes.js");
const {
  readElorusSettings,
  saveElorusSettings,
} = require("./elorus-settings.js");
const {
  readGeminiSettings,
  saveGeminiSettings,
} = require("./gemini-settings.js");
const analyticsSettings = require("./analytics-settings.js");

// Short-lived in-memory OAuth state for the Google Analytics consent flow.
const analyticsAuthStates = new Map();
function createAnalyticsAuthState(state, ttlMs = 15 * 60 * 1000) {
  analyticsAuthStates.set(state, Date.now() + ttlMs);
}
function consumeAnalyticsAuthState(state) {
  const expiresAt = analyticsAuthStates.get(state);
  if (!expiresAt) return false;
  analyticsAuthStates.delete(state);
  return expiresAt > Date.now();
}
const {
  configurationStatus: getOpenBankingConfigurationStatus,
  createEnableBankingClient,
} = require("./enable-banking-client.js");
const {
  consumeAuthState,
  createAuthState,
  getStatus: getOpenBankingStoreStatus,
  saveSession: saveOpenBankingSession,
} = require("./open-banking-store.js");
const {
  getOpenBankingOverview,
  syncOpenBanking,
} = require("./open-banking-sync.js");
const {
  getOverview: getFinanceOverview,
  getRenewals: getFinanceRenewals,
  getSyncStatus: getFinanceSyncStatus,
} = require("./finance-store.js");
const { getPortfolioSnapshot } = require("./portfolio-store.js");
const {
  readCalendar,
  readReminders,
  recentFiles,
  searchFiles,
  searchNotes,
} = require("./assistant-data.js");
const {
  addDocument,
  addSharedItem,
  createBrowserAction,
  createProject,
  listBrowserActions,
  listDocuments,
  listProjects,
  listSharedItems,
  updateBrowserAction,
  updateProject,
} = require("./feature-store.js");
const { saveUploadedDocument } = require("./document-intelligence.js");
const { deleteStoredSession } = require("./session-store.js");
const {
  runGatewayAction,
  runMacPowerAction,
} = require("./system-control.js");

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, "public");

loadEnv(path.join(ROOT, ".env"));

const communicationsCache = require("./communications-cache.js");
const demoData = require("./demo-data.js");

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 3030);
const TOKEN = process.env.DOROTHY_WEB_TOKEN || "";
const AGENT_CMD = process.env.OPENCLAW_AGENT_CMD || "openclaw agent";
const AGENT_ID = process.env.OPENCLAW_AGENT_ID || "main";
const AI_AGENT_ID = process.env.OPENCLAW_AI_AGENT_ID || "ai";
const TIMEOUT_MS = Number(process.env.DOROTHY_TIMEOUT_MS || 120000);
const APP_VERSION = "3.3.0";
const CANONICAL_URL = "https://dorothy.your-tailnet.ts.net";
const FINANCE_SYNC_SCRIPT = path.join(ROOT, "..", "backend", "scripts", "sync-elorus-finance.mjs");
// Shared notification store written by the dorothy-control `dorothy_notify` tool.
const NOTIFICATIONS_STORE = path.join(process.env.HOME || "", ".openclaw", "data", "dorothy-web-notifications.json");

function readNotifications() {
  if (demoData.DEMO_MODE) return demoData.demoNotifications();
  try {
    const parsed = JSON.parse(fs.readFileSync(NOTIFICATIONS_STORE, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeNotifications(items) {
  if (demoData.DEMO_MODE) return;
  fs.mkdirSync(path.dirname(NOTIFICATIONS_STORE), { recursive: true });
  const tmp = `${NOTIFICATIONS_STORE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(items), "utf8");
  fs.renameSync(tmp, NOTIFICATIONS_STORE);
}

let financeSyncPromise = null;
let openBankingSyncPromise = null;
let localModelsCache = { expiresAt: 0, models: [] };
let todayCache = { expiresAt: 0, payload: null, promise: null };

if (!TOKEN || TOKEN === "change-me-to-a-long-random-token") {
  console.warn("\n[SECURITY] Set DOROTHY_WEB_TOKEN in .env before using outside localhost.\n");
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.hostname.toLowerCase() === "dorothy") {
      res.writeHead(308, {
        "Location": `${CANONICAL_URL}${url.pathname}${url.search}`,
        "Cache-Control": "no-store",
        "X-Dorothy-Version": APP_VERSION,
      });
      return res.end();
    }

    if (url.pathname === "/api/auth/check") {
      if (!authorized(req)) return json(res, 401, { ok: false, error: "Unauthorized" });
      return json(res, 200, { ok: true, version: APP_VERSION });
    }

    if (url.pathname === "/api/open-banking/callback" && req.method === "GET") {
      const state = String(url.searchParams.get("state") || "");
      const authState = state ? consumeAuthState(state) : null;
      if (!authState) {
        return openBankingCallbackPage(
          res,
          400,
          "Connection not completed",
          "The request expired or is not valid. Start the connection again from Dorothy.",
        );
      }

      const providerError = String(url.searchParams.get("error_description")
        || url.searchParams.get("error")
        || "");
      if (providerError) {
        return openBankingCallbackPage(
          res,
          400,
          "The bank didn't connect",
          providerError.slice(0, 300),
        );
      }

      const code = String(url.searchParams.get("code") || "");
      if (!code) {
        return openBankingCallbackPage(
          res,
          400,
          "Connection not completed",
          "No authorization code was returned.",
        );
      }

      try {
        const session = await createEnableBankingClient().createSession(code);
        const saved = saveOpenBankingSession(session, authState);
        return openBankingCallbackPage(
          res,
          200,
          "The bank connected",
          `Saved ${saved.accountCount} accounts from ${authState.bankName}. You can return to Dorothy.`,
        );
      } catch (error) {
        console.error("dorothy: open banking callback failed:", error.message);
        return openBankingCallbackPage(
          res,
          502,
          "Connection not completed",
          "Authorization succeeded, but no bank session was created. Try again from Dorothy.",
        );
      }
    }

    if (url.pathname === "/api/analytics/callback" && req.method === "GET") {
      const state = String(url.searchParams.get("state") || "");
      if (!state || !consumeAnalyticsAuthState(state)) {
        return openBankingCallbackPage(res, 400, "Connection not completed",
          "The request expired or is not valid. Start again from the Analytics settings.");
      }
      const providerError = String(url.searchParams.get("error_description")
        || url.searchParams.get("error") || "");
      if (providerError) {
        return openBankingCallbackPage(res, 400, "Google didn't connect", providerError.slice(0, 300));
      }
      const code = String(url.searchParams.get("code") || "");
      if (!code) {
        return openBankingCallbackPage(res, 400, "Connection not completed",
          "No authorization code was returned.");
      }
      try {
        await analyticsSettings.exchangeCodeForTokens({ code, runCommand });
        return openBankingCallbackPage(res, 200, "Google Analytics connected",
          "Return to Dorothy and choose which property you want to track.");
      } catch (error) {
        console.error("dorothy: analytics callback failed:", error.message);
        return openBankingCallbackPage(res, 502, "Connection not completed",
          "Authorization succeeded but the token exchange failed. Try again.");
      }
    }

    if (url.pathname === "/api/open-banking/status" && req.method === "GET") {
      if (!authorized(req)) return json(res, 401, { ok: false, error: "Unauthorized" });
      if (demoData.DEMO_MODE) return json(res, 200, demoData.demoOpenBankingStatus());
      return json(res, 200, {
        ok: true,
        configuration: getOpenBankingConfigurationStatus(),
        ...getOpenBankingStoreStatus(),
      });
    }

    if (url.pathname === "/api/open-banking/overview" && req.method === "GET") {
      if (!authorized(req)) return json(res, 401, { ok: false, error: "Unauthorized" });
      if (demoData.DEMO_MODE) return json(res, 200, demoData.demoOpenBankingOverview());
      try {
        return json(res, 200, getOpenBankingOverview({
          days: Number(url.searchParams.get("days") || 30),
        }));
      } catch (error) {
        console.error("dorothy: open banking overview failed:", error.message);
        return json(res, 503, { ok: false, error: "Bank data didn't load." });
      }
    }

    if (url.pathname === "/api/open-banking/sync" && req.method === "POST") {
      if (!authorized(req)) return json(res, 401, { ok: false, error: "Unauthorized" });
      try {
        return json(res, 200, await runOpenBankingSync());
      } catch (error) {
        console.error("dorothy: open banking sync failed:", error.message);
        return json(res, 502, { ok: false, error: "Bank sync failed." });
      }
    }

    if (url.pathname === "/api/open-banking/banks" && req.method === "GET") {
      if (!authorized(req)) return json(res, 401, { ok: false, error: "Unauthorized" });
      try {
        const payload = await createEnableBankingClient().listBanks("GR");
        const banks = (payload.aspsps || [])
          .map(bank => ({
            name: String(bank?.name || ""),
            country: String(bank?.country || "GR"),
            logo: String(bank?.logo || ""),
            psuTypes: Array.isArray(bank?.psu_types) ? bank.psu_types : [],
          }))
          .filter(bank => bank.name)
          .sort((a, b) => a.name.localeCompare(b.name));
        return json(res, 200, { ok: true, banks });
      } catch (error) {
        return json(res, error.status === 403 ? 409 : 502, {
          ok: false,
          error: error.status === 403
            ? "The Enable Banking app hasn't been activated yet."
            : "The available Greek banks didn't load.",
        });
      }
    }

    if (url.pathname === "/api/open-banking/connect" && req.method === "POST") {
      if (!authorized(req)) return json(res, 401, { ok: false, error: "Unauthorized" });
      const body = await readJson(req, 16 * 1024);
      const bankName = String(body.bankName || "").trim().slice(0, 160);
      const psuType = body.psuType === "business" ? "business" : "personal";
      if (!bankName) return json(res, 400, { ok: false, error: "Bank name is required." });

      const state = crypto.randomUUID();
      const authState = createAuthState({ state, bankName, psuType });
      const validUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      try {
        const result = await createEnableBankingClient().startAuthorization({
          bankName,
          state,
          psuType,
          validUntil,
        });
        if (!result?.url) throw new Error("Enable Banking did not return an authorization URL.");
        return json(res, 200, {
          ok: true,
          authorizationUrl: result.url,
          expiresAt: authState.expiresAt,
        });
      } catch (error) {
        console.error("dorothy: open banking authorization failed:", error.message);
        return json(res, error.status === 403 ? 409 : 502, {
          ok: false,
          error: error.status === 403
            ? "The Enable Banking app hasn't been activated yet."
            : "The bank authorization didn't start.",
        });
      }
    }

    if (url.pathname === "/api/communications") {
      if (!authorized(req)) return json(res, 401, { ok: false, error: "Unauthorized" });
      return json(res, 200, communicationsCache.getCachedCommunications());
    }

    if (url.pathname === "/api/communications/refresh" && req.method === "POST") {
      if (!authorized(req)) return json(res, 401, { ok: false, error: "Unauthorized" });
      const result = await communicationsCache.forceRefresh();
      return json(res, 200, result || { ok: false, error: "Refresh failed" });
    }

    const markReadMatch = url.pathname.match(/^\/api\/communications\/(\d+)\/read$/);
    if (markReadMatch && req.method === "POST") {
      if (!authorized(req)) return json(res, 401, { ok: false, error: "Unauthorized" });
      const body = await readJson(req, 16 * 1024);
      const result = await communicationsCache.markRead(Number(markReadMatch[1]), {
        account: body.account,
        read: body.read !== false,
      });
      if (!result.found) return json(res, 404, { ok: false, error: "Mail message not found" });
      todayCache = { expiresAt: 0, payload: null, promise: null };
      return json(res, 200, result);
    }

    if (url.pathname === "/api/today" && req.method === "GET") {
      if (!authorized(req)) return json(res, 401, { ok: false, error: "Unauthorized" });
      return json(res, 200, await getTodayPayload());
    }

    if (url.pathname === "/api/notifications" && req.method === "GET") {
      if (!authorized(req)) return json(res, 401, { ok: false, error: "Unauthorized" });
      const items = readNotifications();
      return json(res, 200, { ok: true, notifications: items, unread: items.filter(n => !n.read).length });
    }

    if (url.pathname === "/api/notifications/read-all" && req.method === "POST") {
      if (!authorized(req)) return json(res, 401, { ok: false, error: "Unauthorized" });
      const items = readNotifications().map(n => ({ ...n, read: true }));
      writeNotifications(items);
      return json(res, 200, { ok: true, unread: 0 });
    }

    if (url.pathname === "/api/notifications/clear" && req.method === "POST") {
      if (!authorized(req)) return json(res, 401, { ok: false, error: "Unauthorized" });
      writeNotifications([]);
      return json(res, 200, { ok: true });
    }

    const notifReadMatch = url.pathname.match(/^\/api\/notifications\/([^/]+)\/read$/);
    if (notifReadMatch && req.method === "POST") {
      if (!authorized(req)) return json(res, 401, { ok: false, error: "Unauthorized" });
      const id = decodeURIComponent(notifReadMatch[1]);
      const items = readNotifications().map(n => (n.id === id ? { ...n, read: true } : n));
      writeNotifications(items);
      return json(res, 200, { ok: true, unread: items.filter(n => !n.read).length });
    }

    if (url.pathname === "/api/search" && req.method === "GET") {
      if (!authorized(req)) return json(res, 401, { ok: false, error: "Unauthorized" });
      const query = String(url.searchParams.get("q") || "").trim().slice(0, 200);
      if (!query) return json(res, 200, { ok: true, query, results: [] });
      const lower = query.toLocaleLowerCase("el");
      const files = await searchFiles(query, 12);
      const communications = communicationsCache.getCachedCommunications();
      const mail = (communications.mail || [])
        .filter(item => `${item.sender} ${item.subject} ${item.excerpt}`.toLocaleLowerCase("el").includes(lower))
        .slice(0, 10)
        .map(item => ({
          type: "mail",
          id: String(item.mailId || item.messageId || item.subject),
          title: item.subject || "(no subject)",
          subtitle: item.sender || item.account,
          excerpt: item.excerpt || "",
          updatedAt: item.receivedAt || "",
        }));
      const sessions = listWebSessions()
        .filter(item => item.title.toLocaleLowerCase("el").includes(lower))
        .slice(0, 10)
        .map(item => ({
          type: "chat",
          id: item.key,
          title: item.title,
          subtitle: `${item.mode.toUpperCase()} · ${item.messageCount} messages`,
          updatedAt: item.updatedAt ? new Date(item.updatedAt).toISOString() : "",
        }));
      const projects = listProjects()
        .filter(item => `${item.name} ${item.description} ${(item.notes || []).map(note => note.text).join(" ")}`
          .toLocaleLowerCase("el").includes(lower))
        .slice(0, 10)
        .map(item => ({
          type: "project",
          id: item.id,
          title: item.name,
          subtitle: item.description || "Project",
          updatedAt: item.updatedAt,
        }));
      const documents = listDocuments()
        .filter(item => `${item.name} ${item.text || ""}`.toLocaleLowerCase("el").includes(lower))
        .slice(0, 10)
        .map(item => ({
          type: "document",
          id: item.id,
          title: item.name,
          subtitle: item.path,
          excerpt: item.insights?.excerpt || "",
          updatedAt: item.createdAt,
        }));
      const shared = listSharedItems()
        .filter(item => `${item.title} ${item.text} ${item.url}`.toLocaleLowerCase("el").includes(lower))
        .slice(0, 8)
        .map(item => ({
          type: "shared",
          id: item.id,
          title: item.title || item.url || item.fileName || "Shared item",
          subtitle: item.url || item.filePath || "Share to Dorothy",
          excerpt: item.text,
          updatedAt: item.createdAt,
        }));
      return json(res, 200, {
        ok: true,
        query,
        results: [...sessions, ...mail, ...files, ...projects, ...documents, ...shared]
          .slice(0, 50),
      });
    }

    if (url.pathname === "/api/search/notes" && req.method === "GET") {
      if (!authorized(req)) return json(res, 401, { ok: false, error: "Unauthorized" });
      const query = String(url.searchParams.get("q") || "").trim().slice(0, 200);
      return json(res, 200, {
        ok: true,
        query,
        results: query ? await searchNotes(query, 10) : [],
      });
    }

    if (url.pathname === "/api/projects" && req.method === "GET") {
      if (!authorized(req)) return json(res, 401, { ok: false, error: "Unauthorized" });
      return json(res, 200, { ok: true, projects: listProjects() });
    }

    if (url.pathname === "/api/projects" && req.method === "POST") {
      if (!authorized(req)) return json(res, 401, { ok: false, error: "Unauthorized" });
      const body = await readJson(req, 64 * 1024);
      return json(res, 201, { ok: true, project: createProject(body) });
    }

    const projectMatch = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
    if (projectMatch && req.method === "POST") {
      if (!authorized(req)) return json(res, 401, { ok: false, error: "Unauthorized" });
      const body = await readJson(req, 64 * 1024);
      return json(res, 200, {
        ok: true,
        project: updateProject(decodeURIComponent(projectMatch[1]), body),
      });
    }

    if (url.pathname === "/api/documents" && req.method === "GET") {
      if (!authorized(req)) return json(res, 401, { ok: false, error: "Unauthorized" });
      return json(res, 200, { ok: true, documents: listDocuments() });
    }

    if (url.pathname === "/api/documents" && req.method === "POST") {
      if (!authorized(req)) return json(res, 401, { ok: false, error: "Unauthorized" });
      const body = await readJson(req, 26 * 1024 * 1024);
      const extracted = await saveUploadedDocument(body);
      return json(res, 201, { ok: true, document: addDocument(extracted) });
    }

    if (url.pathname === "/api/shared" && req.method === "GET") {
      if (!authorized(req)) return json(res, 401, { ok: false, error: "Unauthorized" });
      return json(res, 200, { ok: true, items: listSharedItems() });
    }

    if (url.pathname === "/api/browser-actions" && req.method === "GET") {
      if (!authorized(req)) return json(res, 401, { ok: false, error: "Unauthorized" });
      return json(res, 200, { ok: true, actions: listBrowserActions() });
    }

    if (url.pathname === "/api/browser-actions" && req.method === "POST") {
      if (!authorized(req)) return json(res, 401, { ok: false, error: "Unauthorized" });
      const body = await readJson(req, 64 * 1024);
      return json(res, 201, { ok: true, action: createBrowserAction(body) });
    }

    const browserExecuteMatch = url.pathname.match(/^\/api\/browser-actions\/([^/]+)\/execute$/);
    if (browserExecuteMatch && req.method === "POST") {
      if (!authorized(req)) return json(res, 401, { ok: false, error: "Unauthorized" });
      const body = await readJson(req, 32 * 1024);
      const id = decodeURIComponent(browserExecuteMatch[1]);
      const action = listBrowserActions().find(item => item.id === id);
      if (!action) return json(res, 404, { ok: false, error: "Browser action not found" });
      if (action.requiresConfirmation && body.confirmed !== true) {
        return json(res, 409, { ok: false, confirmationRequired: true, action });
      }
      updateBrowserAction(id, { status: "running", result: "" });
      try {
        const sessionKey = newWebSessionKey(getChatMode("dorothy"));
        const approval = action.requiresConfirmation
          ? "The user saw the preview of this exact action and explicitly approved it."
          : "This is a read-only action.";
        const result = await runAgent(
          `Browser Action Mode.\n${approval}\nURL: ${action.url || "use the appropriate existing tab"}\nAction: ${action.instruction}\nUse the dorothy_browser_* tools, respect the confirmation boundaries, and return a short result.`,
          sessionKey,
          getChatMode("dorothy"),
        );
        const updated = updateBrowserAction(id, { status: "done", result: result.output });
        return json(res, 200, { ok: true, action: updated });
      } catch (error) {
        const updated = updateBrowserAction(id, { status: "failed", result: error.message });
        return json(res, 502, { ok: false, error: error.message, action: updated });
      }
    }

    if (url.pathname === "/share" && (req.method === "GET" || req.method === "POST")) {
      let fields = Object.fromEntries(url.searchParams.entries());
      if (req.method === "POST") {
        const raw = await readBuffer(req, 24 * 1024 * 1024);
        fields = parseShareBody(req.headers["content-type"] || "", raw);
      }
      const upload = fields.file;
      let filePath = "";
      let fileName = "";
      if (upload?.data?.length) {
        const saved = await saveUploadedDocument({
          name: upload.name,
          type: upload.type,
          data: upload.data.toString("base64"),
        });
        const document = addDocument(saved);
        filePath = document.path;
        fileName = document.name;
      }
      const item = addSharedItem({
        title: fields.title,
        text: fields.text,
        url: fields.url,
        filePath,
        fileName,
      });
      res.writeHead(303, {
        "Location": `/?shared=${encodeURIComponent(item.id)}`,
        "Cache-Control": "no-store",
      });
      return res.end();
    }

    if (url.pathname === "/api/finance/overview" && req.method === "GET") {
      if (!authorized(req)) return json(res, 401, { ok: false, error: "Unauthorized" });
      const year = url.searchParams.get("year");
      try {
        return json(res, 200, getFinanceOverview({
          year: year ? Number(year) : undefined,
          renewalDays: 90,
        }));
      } catch (error) {
        const message = error?.message === "invalid_year" ? "Invalid finance year" : "Finance data unavailable";
        return json(res, error?.message === "invalid_year" ? 400 : 503, { ok: false, error: message });
      }
    }

    if (url.pathname === "/api/finance/portfolio" && req.method === "GET") {
      if (!authorized(req)) return json(res, 401, { ok: false, error: "Unauthorized" });
      try {
        return json(res, 200, await getPortfolioSnapshot({
          force: url.searchParams.get("refresh") === "1",
        }));
      } catch {
        return json(res, 503, { ok: false, error: "Portfolio data unavailable" });
      }
    }

    if (url.pathname === "/api/finance/sync" && req.method === "GET") {
      if (!authorized(req)) return json(res, 401, { ok: false, error: "Unauthorized" });
      try {
        return json(res, 200, { ok: true, ...getFinanceSyncStatus() });
      } catch {
        return json(res, 503, { ok: false, error: "Finance sync status unavailable" });
      }
    }

    if (url.pathname === "/api/finance/sync" && req.method === "POST") {
      if (!authorized(req)) return json(res, 401, { ok: false, error: "Unauthorized" });
      try {
        return json(res, 200, await runFinanceSync());
      } catch (error) {
        return json(res, 502, {
          ok: false,
          error: error instanceof Error ? error.message : "Elorus finance sync failed",
        });
      }
    }

    if (url.pathname === "/api/finance/renewals" && req.method === "GET") {
      if (!authorized(req)) return json(res, 401, { ok: false, error: "Unauthorized" });
      try {
        return json(res, 200, {
          ok: true,
          ...getFinanceRenewals({
            days: Number(url.searchParams.get("days") || 90),
            limit: Number(url.searchParams.get("limit") || 30),
          }),
        });
      } catch {
        return json(res, 503, { ok: false, error: "Finance data unavailable" });
      }
    }

    if (url.pathname === "/api/sessions" && req.method === "GET") {
      if (!authorized(req)) return json(res, 401, { ok: false, error: "Unauthorized" });
      return json(res, 200, { ok: true, sessions: listWebSessions() });
    }

    if (url.pathname === "/api/chat-modes" && req.method === "GET") {
      if (!authorized(req)) return json(res, 401, { ok: false, error: "Unauthorized" });
      return json(res, 200, {
        ok: true,
        modes: publicChatModes(),
        aiModels: await getAiModels(),
      });
    }

    if (url.pathname === "/api/sessions/new" && req.method === "POST") {
      if (!authorized(req)) return json(res, 401, { ok: false, error: "Unauthorized" });
      const body = await readJson(req, 32 * 1024);
      const mode = getChatMode(body.mode);
      let model = "";
      if (mode.id === "ai") {
        try {
          model = await resolveAiModel("", body.model);
        } catch (error) {
          return json(res, 400, { ok: false, error: error.message });
        }
      }
      return json(res, 201, {
        ok: true,
        session: {
          key: newWebSessionKey(mode),
          title: mode.title,
          mode: mode.id,
          model,
          updatedAt: Date.now(),
          pending: true
        }
      });
    }

    const deleteSessionMatch = url.pathname.match(/^\/api\/sessions\/([a-zA-Z0-9-]+)$/);
    if (deleteSessionMatch && req.method === "DELETE") {
      if (!authorized(req)) return json(res, 401, { ok: false, error: "Unauthorized" });
      const key = normalizeWebSessionKey(deleteSessionMatch[1]);
      if (!key) return json(res, 400, { ok: false, error: "Invalid session key" });
      const mode = modeForSessionKey(key);
      if (!mode) return json(res, 400, { ok: false, error: "Invalid session mode" });
      const result = deleteStoredSession({
        homeDir: process.env.HOME || "",
        agentId: agentIdForMode(mode),
        key,
      });
      if (!result.found) return json(res, 404, { ok: false, error: "Session not found" });
      return json(res, 200, { ok: true, key, transcriptDeleted: result.transcriptDeleted });
    }

    if (url.pathname === "/api/sessions/history" && req.method === "GET") {
      if (!authorized(req)) return json(res, 401, { ok: false, error: "Unauthorized" });
      const key = normalizeWebSessionKey(url.searchParams.get("key"));
      if (!key) return json(res, 400, { ok: false, error: "Invalid session key" });
      return json(res, 200, { ok: true, key, messages: readSessionHistory(key) });
    }

    if (url.pathname === "/api/mac/status" && req.method === "GET") {
      if (!authorized(req)) return json(res, 401, { ok: false, error: "Unauthorized" });
      const [schedule, applications, fileVault, autoLogin] = await Promise.all([
        runCommand("/usr/bin/pmset", ["-g", "sched"]),
        runCommand("/usr/bin/osascript", [
          "-e",
          'tell application "System Events" to get name of every application process whose background only is false',
        ]),
        runCommand("/usr/bin/fdesetup", ["status"]),
        runCommand("/usr/sbin/sysadminctl", ["-autologin", "status"]),
      ]);
      const autoLoginOutput = `${autoLogin.stdout}\n${autoLogin.stderr}`.trim();
      return json(res, 200, {
        ok: schedule.ok && applications.ok,
        schedule: schedule.stdout || schedule.stderr,
        scheduleSummary: summarizePowerSchedule(schedule.stdout || schedule.stderr),
        applications: applications.stdout ? applications.stdout.split(", ").filter(Boolean) : [],
        bootAutomation: {
          fileVaultOff: /FileVault is Off/i.test(`${fileVault.stdout}\n${fileVault.stderr}`),
          autoLoginUser: autoLoginOutput.match(/Automatic login user:\s*([^\s]+)/i)?.[1] || "",
        },
      });
    }

    if (url.pathname === "/api/system/status" && req.method === "GET") {
      if (!authorized(req)) return json(res, 401, { ok: false, error: "Unauthorized" });
      return json(res, 200, await getSystemStatus());
    }

    if (url.pathname === "/api/control-center/status" && req.method === "GET") {
      if (!authorized(req)) return json(res, 401, { ok: false, error: "Unauthorized" });
      const gateway = await probeHttp("http://127.0.0.1:18789/health", 2_000);
      return json(res, 200, {
        ok: true,
        macOnline: true,
        gatewayOnline: gateway.ok,
        checkedAt: new Date().toISOString(),
      });
    }

    if (url.pathname === "/api/system/gateway" && req.method === "POST") {
      if (!authorized(req)) return json(res, 401, { ok: false, error: "Unauthorized" });
      const body = await readJson(req, 16 * 1024);
      const result = await runGatewayAction({
        action: String(body.action || ""),
        confirmed: body.confirmed,
        runCommand,
      });
      return json(res, result.status, result.payload);
    }

    if (url.pathname === "/api/integrations/elorus" && req.method === "GET") {
      if (!authorized(req)) return json(res, 401, { ok: false, error: "Unauthorized" });
      return json(res, 200, await readElorusSettings(runCommand));
    }

    if (url.pathname === "/api/integrations/elorus" && req.method === "POST") {
      if (!authorized(req)) return json(res, 401, { ok: false, error: "Unauthorized" });
      const body = await readJson(req, 16 * 1024);
      const result = await saveElorusSettings({
        apiKey: body.apiKey,
        organizationId: body.organizationId,
      }, runCommand);
      return json(res, result.ok ? 200 : 400, result);
    }

    if (url.pathname === "/api/integrations/gemini" && req.method === "GET") {
      if (!authorized(req)) return json(res, 401, { ok: false, error: "Unauthorized" });
      return json(res, 200, await readGeminiSettings(runCommand));
    }

    if (url.pathname === "/api/integrations/gemini" && req.method === "POST") {
      if (!authorized(req)) return json(res, 401, { ok: false, error: "Unauthorized" });
      const body = await readJson(req, 16 * 1024);
      const result = await saveGeminiSettings({ apiKey: body.apiKey }, runCommand);
      return json(res, result.ok ? 200 : 400, result);
    }

    if (url.pathname === "/api/analytics/status" && req.method === "GET") {
      if (!authorized(req)) return json(res, 401, { ok: false, error: "Unauthorized" });
      if (demoData.DEMO_MODE) return json(res, 200, demoData.demoAnalyticsStatus());
      return json(res, 200, await analyticsSettings.readAnalyticsSettings(runCommand));
    }

    if (url.pathname === "/api/analytics/client" && req.method === "POST") {
      if (!authorized(req)) return json(res, 401, { ok: false, error: "Unauthorized" });
      const body = await readJson(req, 16 * 1024);
      const result = await analyticsSettings.saveAnalyticsClient(
        { clientId: body.clientId, clientSecret: body.clientSecret }, runCommand);
      return json(res, result.ok ? 200 : 400, result);
    }

    if (url.pathname === "/api/analytics/connect" && req.method === "POST") {
      if (!authorized(req)) return json(res, 401, { ok: false, error: "Unauthorized" });
      const state = crypto.randomUUID();
      try {
        const { url: authorizationUrl } = await analyticsSettings.startAuthorization({ state, runCommand });
        createAnalyticsAuthState(state);
        return json(res, 200, { ok: true, authorizationUrl });
      } catch (error) {
        if (error.code === "client_not_configured") {
          return json(res, 409, { ok: false, error: "Save the Client ID & Secret first." });
        }
        console.error("dorothy: analytics connect failed:", error.message);
        return json(res, 502, { ok: false, error: "Google authorization didn't start." });
      }
    }

    if (url.pathname === "/api/analytics/properties" && req.method === "GET") {
      if (!authorized(req)) return json(res, 401, { ok: false, error: "Unauthorized" });
      try {
        return json(res, 200, await analyticsSettings.listProperties(runCommand));
      } catch (error) {
        console.error("dorothy: analytics properties failed:", error.message);
        return json(res, 502, { ok: false, error: "GA4 properties didn't load." });
      }
    }

    if (url.pathname === "/api/analytics/property" && req.method === "POST") {
      if (!authorized(req)) return json(res, 401, { ok: false, error: "Unauthorized" });
      const body = await readJson(req, 16 * 1024);
      const result = await analyticsSettings.saveSelectedProperty(
        { propertyId: body.propertyId, propertyName: body.propertyName }, runCommand);
      return json(res, result.ok ? 200 : 400, result);
    }

    if (url.pathname === "/api/analytics/overview" && req.method === "GET") {
      if (!authorized(req)) return json(res, 401, { ok: false, error: "Unauthorized" });
      if (demoData.DEMO_MODE) return json(res, 200, demoData.demoAnalyticsOverview());
      try {
        const overview = await analyticsSettings.getOverview(runCommand);
        return json(res, overview.ok ? 200 : 409, overview);
      } catch (error) {
        console.error("dorothy: analytics overview failed:", error.message);
        return json(res, 502, { ok: false, error: "Analytics data didn't load." });
      }
    }

    if (url.pathname === "/api/analytics/disconnect" && req.method === "POST") {
      if (!authorized(req)) return json(res, 401, { ok: false, error: "Unauthorized" });
      return json(res, 200, await analyticsSettings.disconnectAnalytics(runCommand));
    }

    if (url.pathname === "/api/mac/power" && req.method === "POST") {
      if (!authorized(req)) return json(res, 401, { ok: false, error: "Unauthorized" });
      const body = await readJson(req, 32 * 1024);
      const result = await runMacPowerAction({
        action: String(body.action || ""),
        confirmed: body.confirmed,
        runCommand,
      });
      return json(res, result.status, result.payload);
    }

    if (url.pathname === "/api/mac/application" && req.method === "POST") {
      if (!authorized(req)) return json(res, 401, { ok: false, error: "Unauthorized" });
      const body = await readJson(req, 32 * 1024);
      const application = String(body.application || "").trim();
      const action = String(body.action || "");
      if (!application || application.length > 100 || !["open", "activate", "hide", "quit"].includes(action)) {
        return json(res, 400, { ok: false, error: "Invalid application action" });
      }
      if (action === "quit" && body.confirmed !== true) {
        return json(res, 409, { ok: false, confirmationRequired: true, action, application });
      }

      let result;
      if (action === "open" || action === "activate") {
        result = await runCommand("/usr/bin/open", ["-a", application], 15_000);
      } else {
        const command = action === "hide" ? "set visible to false" : "quit";
        const script = action === "hide"
          ? `on run argv\ntell application "System Events" to tell process (item 1 of argv) to ${command}\nend run`
          : `on run argv\ntell application (item 1 of argv) to ${command}\nend run`;
        result = await runCommand("/usr/bin/osascript", ["-e", script, application], 15_000);
      }
      return json(res, result.ok ? 200 : 500, {
        ok: result.ok,
        application,
        action,
        error: result.stderr || undefined,
      });
    }

    if (url.pathname === "/api/health") {
      return json(res, 200, {
        ok: true,
        app: "dorothy-web",
        version: APP_VERSION,
        host: HOST,
        port: PORT,
        agentCommand: AGENT_CMD,
        agentId: AGENT_ID,
        localOnly: HOST === "127.0.0.1" || HOST === "localhost"
      });
    }

    if (url.pathname === "/api/chat" && req.method === "POST") {
      if (!authorized(req)) return json(res, 401, { ok: false, error: "Unauthorized" });

      const body = await readJson(req, 256 * 1024);
      const originalMessage = String(body.message || "").trimEnd();
      if (!originalMessage.trim()) return json(res, 400, { ok: false, error: "Message is required" });

      // Session key keeps conversation history alive across turns.
      const sessionKey = normalizeSessionKey(body.sessionKey);
      if (!sessionKey) return json(res, 400, { ok: false, error: "Invalid session key" });
      const mode = modeForSessionKey(sessionKey);
      const prepared = prepareChatMessage(originalMessage, sessionKey);
      if (!prepared.ok) return json(res, prepared.status, { ok: false, error: prepared.error });
      let model = "";
      if (mode.id === "ai") {
        try {
          model = await resolveAiModel(sessionKey, body.model);
        } catch (error) {
          return json(res, 400, { ok: false, error: error.message });
        }
      }

      const started = Date.now();
      const result = await runAgent(prepared.message, sessionKey, mode, model);
      return json(res, 200, {
        ok: true,
        reply: result.output,
        durationMs: Date.now() - started,
        stderr: result.stderr ? result.stderr.slice(-2000) : ""
      });
    }

    if (url.pathname === "/api/tts" && req.method === "POST") {
      if (!authorized(req)) return json(res, 401, { ok: false, error: "Unauthorized" });

      const body = await readJson(req, 512 * 1024);
      const text = normalizeTtsText(String(body.text || "").trim());
      if (!text) return json(res, 400, { ok: false, error: "Text is required" });

      const engine = String(body.engine || "edge-tts").trim();
      const rate = String(body.rate || "1.0").trim();

      if (engine === "gtts") {
        const input = JSON.stringify({ segments: [{ text, lang: "el" }], rate: parseFloat(rate) || 1.0 });

        const child = spawn("/opt/homebrew/bin/python3", [path.join(ROOT, "tts_gtts.py")], {
          stdio: ["pipe", "pipe", "pipe"]
        });

        res.writeHead(200, {
          "Content-Type": "audio/mpeg",
          "Cache-Control": "no-cache",
          "X-Content-Type-Options": "nosniff"
        });

        child.stdout.pipe(res);
        child.stderr.on("data", chunk => {
          console.error("dorothy: gtts stderr:", chunk.toString().trimEnd());
        });
        child.on("error", () => { res.end(); });
        child.on("close", () => { res.end(); });
        child.stdin.end(input);

        req.on("close", () => { child.kill("SIGTERM"); });
        return;
      }

      if (engine === "piper") {
        const input = JSON.stringify({ segments: [{ text, lang: "el" }], rate: parseFloat(rate) || 1.0 });

        const child = spawn("/opt/homebrew/bin/python3", [path.join(ROOT, "tts_piper.py")], {
          stdio: ["pipe", "pipe", "pipe"]
        });

        res.writeHead(200, {
          "Content-Type": "audio/mpeg",
          "Cache-Control": "no-cache",
          "X-Content-Type-Options": "nosniff"
        });

        child.stdout.pipe(res);
        child.stderr.on("data", chunk => {
          console.error("dorothy: piper stderr:", chunk.toString().trimEnd());
        });
        child.on("error", () => { res.end(); });
        child.on("close", () => { res.end(); });
        child.stdin.end(input);

        req.on("close", () => { child.kill("SIGTERM"); });
        return;
      }

      if (engine === "google") {
        const input = JSON.stringify({ segments: [{ text, lang: "el" }], rate: parseFloat(rate) || 1.0 });

        const child = spawn("/opt/homebrew/bin/python3", [path.join(ROOT, "tts_google.py")], {
          stdio: ["pipe", "pipe", "pipe"],
          env: { ...process.env, GOOGLE_TTS_API_KEY: process.env.GOOGLE_TTS_API_KEY || "" }
        });

        res.writeHead(200, {
          "Content-Type": "audio/mpeg",
          "Cache-Control": "no-cache",
          "X-Content-Type-Options": "nosniff"
        });

        child.stdout.pipe(res);
        child.stderr.on("data", chunk => {
          const msg = chunk.toString().trimEnd();
          if (msg.includes("GOOGLE_TTS_MISSING_KEY")) {
            console.error("dorothy: google tts missing API key");
          } else {
            console.error("dorothy: google tts stderr:", msg);
          }
        });
        child.on("error", () => { res.end(); });
        child.on("close", () => { res.end(); });
        child.stdin.end(input);

        req.on("close", () => { child.kill("SIGTERM"); });
        return;
      }

      // Default: edge-tts
      const greekVoice = String(body.greekVoice || "el-GR-AthinaNeural").trim();
      const englishVoice = String(body.englishVoice || "en-GB-LibbyNeural").trim();

      const ssml = textToSsml(text, greekVoice, englishVoice, rate);

      const child = spawn("edge-tts", ["--text", ssml, "--write-media", "-"], {
        stdio: ["ignore", "pipe", "pipe"]
      });

      res.writeHead(200, {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-cache",
        "X-Content-Type-Options": "nosniff"
      });

      child.stdout.pipe(res);
      child.stderr.on("data", chunk => {
        console.error("dorothy: edge-tts stderr:", chunk.toString().trimEnd());
      });
      child.on("error", () => { res.end(); });
      child.on("close", () => { res.end(); });

      req.on("close", () => { child.kill("SIGTERM"); });
      return;
    }

    if (url.pathname === "/api/chat/stream" && req.method === "POST") {
      if (!authorized(req)) return json(res, 401, { ok: false, error: "Unauthorized" });

      const body = await readJson(req, 256 * 1024);
      const originalMessage = String(body.message || "").trimEnd();
      if (!originalMessage.trim()) return json(res, 400, { ok: false, error: "Message is required" });

      const sessionKey = normalizeSessionKey(body.sessionKey);
      if (!sessionKey) return json(res, 400, { ok: false, error: "Invalid session key" });
      const mode = modeForSessionKey(sessionKey);
      const prepared = prepareChatMessage(originalMessage, sessionKey);
      if (!prepared.ok) return json(res, prepared.status, { ok: false, error: prepared.error });
      let model = "";
      if (mode.id === "ai") {
        try {
          model = await resolveAiModel(sessionKey, body.model);
        } catch (error) {
          return json(res, 400, { ok: false, error: error.message });
        }
      }

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      });

      const parts = splitCommand(AGENT_CMD);
      const cmd = parts.shift();
      const args = [
        ...parts,
        "--agent",
        agentIdForMode(mode),
        "--message",
        prepared.message,
      ];
      if (sessionKey) args.push("--session-key", sessionKey);
      if (model) args.push("--model", model);

      const child = spawn(cmd, args, { cwd: ROOT, env: process.env, shell: false });
      let done = false;
      let skippedWarnings = true;
      let buffer = "";

      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        child.kill("SIGTERM");
        sseSend(res, { error: "Timed out" });
        res.end();
      }, TIMEOUT_MS);

      child.stdout.on("data", chunk => {
        const text = chunk.toString();

        if (skippedWarnings) {
          buffer += text;
          const offset = findResponseOffset(buffer);
          if (offset !== -1) {
            skippedWarnings = false;
            const rest = buffer.slice(offset);
            buffer = "";
            if (rest.trim()) {
              sseSend(res, { text: rest });
            }
          }
        } else {
          sseSend(res, { text });
        }
      });

      child.stderr.on("data", () => { /* suppress warnings on stderr */ });

      child.on("error", err => {
        clearTimeout(timer);
        if (done) return;
        done = true;
        sseSend(res, { error: err.message });
        res.end();
      });

      child.on("close", code => {
        clearTimeout(timer);
        if (done) return;
        done = true;
        if (code !== 0 && skippedWarnings) {
          sseSend(res, { error: "No response" });
        }
        sseSend(res, {});
        res.end();
      });

      req.on("close", () => {
        if (!done) {
          done = true;
          child.kill("SIGTERM");
          clearTimeout(timer);
        }
      });

      return;
    }

    return serveStatic(req, res, url.pathname);
  } catch (err) {
    return json(res, 500, { ok: false, error: err.message || String(err) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Dorothy Web running at http://${HOST}:${PORT}`);
  console.log(`Command: ${AGENT_CMD}`);
  communicationsCache.startCacheWorker();
  getTodayPayload(true).catch(error => console.error("dorothy: today warmup failed:", error.message));
  const todayTimer = setInterval(() => {
    getTodayPayload(true).catch(error => console.error("dorothy: today refresh failed:", error.message));
  }, 60_000);
  todayTimer.unref();
});

function authorized(req) {
  const auth = req.headers.authorization || "";
  const got = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!TOKEN) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(TOKEN));
  } catch {
    return false;
  }
}

function runAgent(message, sessionKey, mode, model = "") {
  return new Promise((resolve, reject) => {
    const parts = splitCommand(AGENT_CMD);
    const cmd = parts.shift();
    // Always pass --agent, --message, --json explicitly so the command works
    // regardless of how OPENCLAW_AGENT_CMD is configured.
    const args = [
      ...parts,
      "--agent",
      agentIdForMode(mode),
      "--message",
      message,
      "--json",
    ];
    // Attach session key so conversation history is preserved across turns.
    if (sessionKey) args.push("--session-key", sessionKey);
    if (model) args.push("--model", model);

    const child = spawn(cmd, args, {
      cwd: ROOT,
      env: process.env,
      shell: false
    });

    let stdout = "";
    let stderr = "";
    let done = false;

    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      child.kill("SIGTERM");
      reject(new Error(`Dorothy timed out after ${TIMEOUT_MS}ms`));
    }, TIMEOUT_MS);

    child.stdout.on("data", chunk => stdout += chunk.toString());
    child.stderr.on("data", chunk => stderr += chunk.toString());

    child.on("error", err => {
      clearTimeout(timer);
      if (done) return;
      done = true;
      reject(err);
    });

    child.on("close", code => {
      clearTimeout(timer);
      if (done) return;
      done = true;
      const output = extractAgentReply(stdout);
      if (code !== 0 && !output) {
        reject(new Error(stderr || `OpenClaw exited with code ${code}`));
      } else {
        resolve({ output: output || "(No response)", stderr });
      }
    });
  });
}

function runCommand(command, args, timeout = 10000, input = "") {
  return new Promise(resolve => {
    const child = spawn(command, args, { cwd: ROOT, env: process.env, shell: false });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      resolve({ ok: false, stdout, stderr: stderr || "Timed out" });
    }, timeout);
    child.stdout.on("data", chunk => { stdout += chunk.toString(); });
    child.stderr.on("data", chunk => { stderr += chunk.toString(); });
    child.on("error", error => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: false, stdout, stderr: error.message });
    });
    child.on("close", code => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: code === 0, stdout: stdout.trim(), stderr: stderr.trim() });
    });
    child.stdin.end(input);
  });
}

function normalizeAiModelId(value, provider = "", runtime = "") {
  const model = String(value || "").trim();
  if (!model) return "";
  if (model.includes("/")) return model;
  const runtimeId = String(runtime?.id || runtime || "").trim();
  if (runtimeId === "google-gemini-cli") return `google-gemini-cli/${model}`;
  const providerId = String(provider || "").trim();
  return providerId ? `${providerId}/${model}` : `ollama/${model}`;
}

async function getLocalModels(force = false) {
  if (!force && localModelsCache.expiresAt > Date.now() && localModelsCache.models.length) {
    return localModelsCache.models;
  }

  let models = [];
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4_000);
    const response = await fetch("http://127.0.0.1:11434/api/tags", { signal: controller.signal });
    clearTimeout(timer);
    if (!response.ok) throw new Error(`Ollama returned HTTP ${response.status}`);
    const data = await response.json();
    models = (data.models || [])
      .map(item => {
        const name = String(item?.name || "").trim();
        const id = name === "lfm2.5:latest"
          ? "ollama/lfm2.5"
          : normalizeAiModelId(name);
        return {
          id,
          name,
          size: Number(item?.size || 0),
          modifiedAt: item?.modified_at || null,
        };
      })
      .filter(model => model.name && !model.name.endsWith(":cloud"));
  } catch (error) {
    console.error("dorothy: local model discovery failed:", error.message);
  }

  if (!models.length) {
    models = [
      { id: "ollama/qwen3.5:9b", name: "qwen3.5:9b", size: 0, modifiedAt: null },
      { id: "ollama/qwen3:14b", name: "qwen3:14b", size: 0, modifiedAt: null },
      { id: "ollama/qwen3.5:27b", name: "qwen3.5:27b", size: 0, modifiedAt: null },
    ];
  }

  const preferredOrder = [
    "ollama/qwen3.5:9b",
    "ollama/qwen3:14b",
    "ollama/qwen3.5:27b",
    "ollama/qwen3.5:2b",
  ];
  models.sort((a, b) => {
    const aIndex = preferredOrder.indexOf(a.id);
    const bIndex = preferredOrder.indexOf(b.id);
    if (aIndex !== -1 || bIndex !== -1) {
      return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
    }
    return a.name.localeCompare(b.name);
  });

  localModelsCache = {
    expiresAt: Date.now() + 60_000,
    models,
  };
  return models;
}

async function getAiModels() {
  const models = [
    {
      id: "google/gemini-2.5-flash",
      name: "Gemini 2.5 Flash",
      provider: "Google API",
      remote: true,
    },
  ];
  if (process.env.DOROTHY_ENABLE_GEMINI_CLI === "1") {
    models.push({
      id: "google-gemini-cli/gemini-3-flash-preview",
      name: "Gemini 3 Flash",
      provider: "Google login",
      remote: true,
    });
  }
  return [...models, ...await getLocalModels()];
}

async function resolveAiModel(sessionKey, requestedModel) {
  const models = await getAiModels();
  const allowed = new Set(models.map(model => model.id));
  const requested = normalizeAiModelId(requestedModel);
  if (requested && !allowed.has(requested)) {
    throw new Error("The selected AI model isn't available.");
  }

  if (requested) return requested;

  if (sessionKey) {
    const stored = loadSessionStore(AI_AGENT_ID)[`agent:${AI_AGENT_ID}:${sessionKey}`];
    const storedModel = normalizeAiModelId(
      stored?.model,
      stored?.modelProvider,
      stored?.agentRuntime,
    );
    if (allowed.has(storedModel)) return storedModel;
  }

  const configuredDefault = normalizeAiModelId(
    process.env.OPENCLAW_AI_DEFAULT_MODEL || "google/gemini-2.5-flash"
  );
  if (allowed.has(configuredDefault)) return configuredDefault;
  return models[0]?.id || "google/gemini-2.5-flash";
}

async function runFinanceSync() {
  if (!financeSyncPromise) {
    financeSyncPromise = (async () => {
      const result = await runCommand(process.execPath, [FINANCE_SYNC_SCRIPT], 10 * 60 * 1000);
      if (!result.ok) {
        let message = result.stderr || "Elorus finance sync failed";
        try {
          message = JSON.parse(result.stderr || "{}").error || message;
        } catch {}
        throw new Error(message);
      }
      const lines = result.stdout.split(/\r?\n/).filter(Boolean);
      const output = JSON.parse(lines[lines.length - 1] || "{}");
      if (!output.ok) throw new Error(output.error || "Elorus finance sync failed");
      return output;
    })().finally(() => {
      financeSyncPromise = null;
    });
  }
  return financeSyncPromise;
}

async function runOpenBankingSync() {
  if (!openBankingSyncPromise) {
    openBankingSyncPromise = syncOpenBanking().finally(() => {
      openBankingSyncPromise = null;
    });
  }
  return openBankingSyncPromise;
}

async function getTodayPayload(force = false) {
  if (!force && todayCache.payload && todayCache.expiresAt > Date.now()) {
    return todayCache.payload;
  }
  if (todayCache.promise) return todayCache.promise;
  todayCache.promise = (async () => {
    const [calendar, reminders, files] = await Promise.all([
      readCalendar(3, 24),
      readReminders(21, 24),
      recentFiles(8),
    ]);
    let finance = null;
    try {
      finance = getFinanceOverview({ year: new Date().getFullYear(), renewalDays: 90 });
    } catch {}
    const payload = {
      ok: true,
      generatedAt: new Date().toISOString(),
      calendar,
      reminders,
      communications: communicationsCache.getCachedCommunications(),
      finance,
      files,
      projects: listProjects().slice(0, 6),
      browserActions: listBrowserActions().slice(0, 6),
      documents: listDocuments().slice(0, 6),
      sharedItems: listSharedItems().slice(0, 6),
    };
    todayCache = {
      expiresAt: Date.now() + 60_000,
      payload,
      promise: null,
    };
    return payload;
  })().catch(error => {
    todayCache.promise = null;
    throw error;
  });
  return todayCache.promise;
}

async function getSystemStatus() {
  if (demoData.DEMO_MODE) return demoData.demoSystemStatus(APP_VERSION);
  const [
    openClaw,
    n8n,
    ollama,
    tailscale,
    docker,
    fileVault,
    autoLogin,
  ] = await Promise.all([
    probeHttp("http://127.0.0.1:18789/health"),
    probeHttp("http://127.0.0.1:5678/healthz"),
    probeHttp("http://127.0.0.1:11434/api/tags"),
    runCommand("/usr/local/bin/tailscale", ["status", "--json"], 6000),
    runCommand("/usr/local/bin/docker", ["info", "--format", "{{.ServerVersion}}"], 6000),
    runCommand("/usr/bin/fdesetup", ["status"]),
    runCommand("/usr/sbin/sysadminctl", ["-autologin", "status"]),
  ]);

  let tailscaleOnline = false;
  let tailscaleDetail = "Offline";
  if (tailscale.ok) {
    try {
      const status = JSON.parse(tailscale.stdout);
      tailscaleOnline = status.BackendState === "Running" && status.Self?.Online !== false;
      tailscaleDetail = tailscaleOnline
        ? status.Self?.HostName || "Connected"
        : status.BackendState || "Offline";
    } catch {
      tailscaleDetail = "Invalid status";
    }
  }

  const services = [
    { id: "openclaw", label: "Dorothy", ok: openClaw.ok, detail: openClaw.ok ? "OpenClaw online" : openClaw.error },
    { id: "webapp", label: "Web app", ok: true, detail: `v${APP_VERSION}` },
    { id: "tailscale", label: "Tailscale", ok: tailscaleOnline, detail: tailscaleDetail },
    { id: "docker", label: "Docker", ok: docker.ok, detail: docker.ok ? `v${docker.stdout}` : docker.stderr },
    { id: "n8n", label: "n8n", ok: n8n.ok, detail: n8n.ok ? "Healthy" : n8n.error },
    { id: "ollama", label: "Ollama", ok: ollama.ok, detail: ollama.ok ? "Models ready" : ollama.error },
  ].map(service => ({
    ...service,
    detail: String(service.detail || (service.ok ? "Online" : "Offline")).slice(0, 120),
  }));

  const autoLoginOutput = `${autoLogin.stdout}\n${autoLogin.stderr}`;
  const bootAutomation = {
    fileVaultOff: /FileVault is Off/i.test(`${fileVault.stdout}\n${fileVault.stderr}`),
    autoLoginUser: autoLoginOutput.match(/Automatic login user:\s*([^\s]+)/i)?.[1] || "",
  };
  bootAutomation.ready = bootAutomation.fileVaultOff && Boolean(bootAutomation.autoLoginUser);

  return {
    ok: true,
    ready: services.every(service => service.ok) && bootAutomation.ready,
    checkedAt: new Date().toISOString(),
    services,
    bootAutomation,
  };
}

async function probeHttp(url, timeout = 4000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return {
      ok: response.ok,
      status: response.status,
      error: response.ok ? "" : `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error.name === "AbortError" ? "Timed out" : error.message,
    };
  } finally {
    clearTimeout(timer);
  }
}

function summarizePowerSchedule(raw) {
  const text = String(raw || "");
  const repeatingWake = text.match(/wakepoweron at (\d{1,2}:\d{2}[AP]M) every day/i)?.[1];
  const repeatingShutdown = text.match(/shutdown at (\d{1,2}:\d{2}[AP]M) every day/i)?.[1];
  const secondWake = text.match(/wakeorpoweron at (\d{2}\/\d{2}\/\d{4}) (\d{2}:\d{2})/i);
  const parts = [];
  if (repeatingWake) parts.push(`Wake ${formatPowerTime(repeatingWake)}`);
  if (repeatingShutdown) parts.push(`Shutdown ${formatPowerTime(repeatingShutdown)}`);
  if (secondWake) parts.push(`Next wake ${secondWake[1]} ${secondWake[2]}`);
  return parts.join(" · ") || "No scheduled power schedule.";
}

function formatPowerTime(value) {
  const match = String(value).match(/^(\d{1,2}):(\d{2})(AM|PM)$/i);
  if (!match) return value;
  let hour = Number(match[1]) % 12;
  if (match[3].toUpperCase() === "PM") hour += 12;
  return `${String(hour).padStart(2, "0")}:${match[2]}`;
}

function agentIdForMode(mode) {
  return mode?.agent === "ai" ? AI_AGENT_ID : AGENT_ID;
}

function sessionDirectory(agentId) {
  return path.join(process.env.HOME || "", ".openclaw", "agents", agentId, "sessions");
}

function sessionStorePath(agentId) {
  return path.join(sessionDirectory(agentId), "sessions.json");
}

function newWebSessionKey(mode = getChatMode("dorothy")) {
  return `${mode.sessionPrefix}-${crypto.randomBytes(8).toString("hex")}`;
}

function normalizeWebSessionKey(value) {
  return normalizeSessionKey(value);
}

function loadSessionStore(agentId = AGENT_ID) {
  try {
    const store = JSON.parse(fs.readFileSync(sessionStorePath(agentId), "utf8"));
    return store && typeof store === "object" ? store : {};
  } catch {
    return {};
  }
}

function listWebSessions() {
  const agentIds = [...new Set(CHAT_MODES.map(agentIdForMode))];
  return agentIds
    .flatMap(agentId => Object.entries(loadSessionStore(agentId)).flatMap(([fullKey, entry]) => {
      const prefix = `agent:${agentId}:`;
      const key = fullKey.startsWith(prefix) ? fullKey.slice(prefix.length) : "";
      const mode = modeForSessionKey(key);
      if (!mode || agentIdForMode(mode) !== agentId) return [];

      const messages = readTranscript(entry, agentId);
      const firstUser = messages.find(message => message.role === "user");
      const title = sessionTitle(firstUser?.text);
      const modeTitle = mode.id === "ai" ? `AI · ${title}` : title;
      return [{
        key,
        title: modeTitle,
        mode: mode.id,
        updatedAt: Number(entry?.updatedAt || 0),
        messageCount: messages.length,
        model: normalizeAiModelId(
          entry?.model,
          entry?.modelProvider,
          entry?.agentRuntime,
        ),
      }];
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

function readSessionHistory(key) {
  const mode = modeForSessionKey(key);
  if (!mode) return [];
  const agentId = agentIdForMode(mode);
  const entry = loadSessionStore(agentId)[`agent:${agentId}:${key}`];
  return entry ? readTranscript(entry, agentId) : [];
}

function readTranscript(entry, agentId = AGENT_ID) {
  const sessionId = String(entry?.sessionId || "");
  if (!/^[a-zA-Z0-9-]+$/.test(sessionId)) return [];

  const sessionDir = sessionDirectory(agentId);
  const configuredFile = String(entry?.sessionFile || "");
  const candidate = configuredFile || path.join(sessionDir, `${sessionId}.jsonl`);
  const resolved = path.resolve(candidate);
  if (!resolved.startsWith(path.resolve(sessionDir) + path.sep) || !fs.existsSync(resolved)) return [];

  try {
    return fs.readFileSync(resolved, "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .flatMap(line => {
        try {
          const record = JSON.parse(line);
          const role = record?.message?.role;
          if (role !== "user" && role !== "assistant") return [];
          const text = (record.message.content || [])
            .filter(part => part?.type === "text")
            .map(part => String(part.text || ""))
            .join("\n")
            .trim();
          if (!text) return [];
          return [{
            role,
            text: role === "user" ? stripInboundTimestamp(text) : text,
            timestamp: record.timestamp || null
          }];
        } catch {
          return [];
        }
      });
  } catch {
    return [];
  }
}

function stripInboundTimestamp(text) {
  return String(text).replace(/^\[[^\]\n]{4,100}\]\s*/, "").trim();
}

function prepareChatMessage(originalMessage, sessionKey) {
  const mode = modeForSessionKey(sessionKey);
  if (!mode) return { ok: false, status: 400, error: "Invalid chat mode." };
  return { ok: true, message: originalMessage.trim() };
}

function sessionTitle(text) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) return "New conversation";
  return clean.length > 52 ? `${clean.slice(0, 51).trimEnd()}…` : clean;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Extract the reply text from openclaw agent --json output.
// Falls back to stripping ANSI and returning raw stdout if JSON parsing fails.
function extractAgentReply(raw) {
  const text = String(raw || "").trim();

  // Find the JSON object — stdout may have diagnostic lines before it.
  const jsonStart = text.indexOf("{");
  if (jsonStart !== -1) {
    try {
      const parsed = JSON.parse(text.slice(jsonStart));
      const payloads = parsed?.result?.payloads;
      if (Array.isArray(payloads) && payloads.length > 0) {
        return payloads
          .map(p => String(p.text || "").trim())
          .filter(Boolean)
          .join("\n\n");
      }
    } catch {
      // Not valid JSON — fall through to raw extraction.
    }
  }

  // Fallback: strip ANSI codes and return trimmed text.
  return text.replace(/\x1b\[[0-9;]*m/g, "").trim();
}

function splitCommand(cmd) {
  // Minimal shell-like splitter for simple commands such as: openclaw agent
  const matches = String(cmd).match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
  return matches.map(s => s.replace(/^['"]|['"]$/g, ""));
}

function sseSend(res, data) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function normalizeTtsText(text) {
  return text
    .replace(/(\d+)\s*[-–—]\s*(\d+)/g, "$1 έως $2")
    .replace(/°C/g, " βαθμοί Κελσίου")
    .replace(/°F/g, " βαθμοί Φαρενάιτ")
    .replace(/(\d+)\s*km\/h/g, "$1 χιλιόμετρα την ώρα")
    .replace(/(\d+)\s*mm/g, "$1 χιλιοστά")
    .replace(/(\d+)\s*cm/g, "$1 εκατοστά")
    .replace(/(\d+)\s*kg/g, "$1 κιλά");
}

function textToSsml(text, greekVoice, _englishVoice, rate) {
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="el-GR"><voice name="${greekVoice}"><prosody rate="${rate}">${escapeXml(text)}</prosody></voice></speak>`;
}

function escapeXml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function findResponseOffset(text) {
  const lines = text.split("\n");
  let offset = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === "") {
      offset += line.length + 1;
      continue;
    }

    if (/^[│◇├╰╭╮╯╴╶─]/.test(trimmed)) {
      offset += line.length + 1;
      continue;
    }

    if (/^(Doctor|Config)\s+warnings/i.test(trimmed)) {
      offset += line.length + 1;
      continue;
    }

    break;
  }

  return offset < text.length ? offset : -1;
}

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let val = trimmed.slice(idx + 1).trim();
    val = val.replace(/^['"]|['"]$/g, "");
    if (!(key in process.env)) process.env[key] = val;
  }
}

function readJson(req, maxBytes) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => {
      data += chunk;
      if (Buffer.byteLength(data) > maxBytes) {
        req.destroy();
        reject(new Error("Request too large"));
      }
    });
    req.on("end", () => {
      try { resolve(JSON.parse(data || "{}")); }
      catch { reject(new Error("Invalid JSON")); }
    });
  });
}

function readBuffer(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", chunk => {
      size += chunk.length;
      if (size > maxBytes) {
        req.destroy();
        reject(new Error("Request too large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function parseShareBody(contentType, raw) {
  if (contentType.includes("application/x-www-form-urlencoded")) {
    return Object.fromEntries(new URLSearchParams(raw.toString("utf8")).entries());
  }
  const boundary = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!boundary) return {};
  const marker = `--${boundary[1] || boundary[2]}`;
  const output = {};
  for (const part of raw.toString("latin1").split(marker)) {
    const splitAt = part.indexOf("\r\n\r\n");
    if (splitAt === -1) continue;
    const header = part.slice(0, splitAt);
    let body = part.slice(splitAt + 4).replace(/\r\n--$/, "").replace(/\r\n$/, "");
    const name = header.match(/name="([^"]+)"/i)?.[1];
    if (!name) continue;
    const fileName = header.match(/filename="([^"]*)"/i)?.[1];
    if (fileName !== undefined) {
      output[name] = {
        name: fileName || "shared-file",
        type: header.match(/Content-Type:\s*([^\r\n]+)/i)?.[1] || "application/octet-stream",
        data: Buffer.from(body, "latin1"),
      };
    } else {
      output[name] = Buffer.from(body, "latin1").toString("utf8");
    }
  }
  return output;
}

function serveStatic(req, res, pathname) {
  let file = pathname === "/" ? "/index.html" : pathname;
  file = path.normalize(file).replace(/^(\.\.[/\\])+/, "");
  const full = path.join(PUBLIC, file);
  if (!full.startsWith(PUBLIC) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) {
    return text(res, 404, "Not found");
  }
  const ext = path.extname(full).toLowerCase();
  const type = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon"
  }[ext] || "application/octet-stream";

  const headers = {
    "Content-Type": type,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    "Pragma": "no-cache",
    "Expires": "0",
    "X-Dorothy-Version": APP_VERSION,
  };
  if (file === "/sw.js") headers["Service-Worker-Allowed"] = "/";

  res.writeHead(200, headers);
  fs.createReadStream(full).pipe(res);
}

function json(res, code, obj) {
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    "Pragma": "no-cache",
    "Expires": "0",
    "X-Content-Type-Options": "nosniff",
    "X-Dorothy-Version": APP_VERSION,
  });
  res.end(JSON.stringify(obj));
}

function text(res, code, value) {
  res.writeHead(code, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(value);
}

function openBankingCallbackPage(res, code, title, detail) {
  const escape = value => String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  const success = code >= 200 && code < 300;
  const body = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escape(title)} | Dorothy</title>
  <style>
    :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f3f1eb; color: #20211f; }
    main { width: min(560px, calc(100% - 32px)); padding: 40px; border: 1px solid #d8d4ca; border-radius: 20px; background: #fffdf8; }
    .mark { width: 44px; height: 44px; display: grid; place-items: center; border-radius: 50%; background: ${success ? "#315f4d" : "#8a3e35"}; color: white; font-size: 24px; }
    h1 { margin: 20px 0 10px; font-size: 1.8rem; }
    p { line-height: 1.6; color: #5d5e59; }
    a { color: #315f4d; }
  </style>
</head>
<body>
  <main>
    <div class="mark">${success ? "✓" : "!"}</div>
    <h1>${escape(title)}</h1>
    <p>${escape(detail)}</p>
    <p><a href="${CANONICAL_URL}">Return to Dorothy</a></p>
  </main>
</body>
</html>`;
  res.writeHead(code, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Dorothy-Version": APP_VERSION,
  });
  res.end(body);
}
