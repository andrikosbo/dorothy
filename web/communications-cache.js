#!/usr/bin/env node
"use strict";

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const {
  buildCommunicationOverview,
  enrichCommunications,
} = require("./communication-intelligence.js");

// ─── mail JXA (same script as the dorothy-control plugin) ───

const MAIL_JXA = String.raw`
function text(value) {
  if (value === null || value === undefined) return "";
  return String(value);
}
function addressList(recipients) {
  try {
    return recipients().map(function (recipient) {
      var address = text(recipient.address());
      var name = text(recipient.name());
      return name && address ? name + " <" + address + ">" : address || name;
    }).filter(Boolean);
  } catch (_) { return []; }
}
function inboxFor(account) {
  var boxes = account.mailboxes.whose({ name: "INBOX" })();
  if (!boxes.length) boxes = account.mailboxes.whose({ name: "Inbox" })();
  return boxes.length ? boxes[0] : null;
}
function accountMatches(account, filter) {
  if (!filter) return true;
  var needle = filter.toLowerCase().replace(/^@/, "");
  var name = text(account.name()).toLowerCase();
  var addresses = account.emailAddresses().map(function (item) { return text(item).toLowerCase(); });
  return name.includes(needle) || addresses.some(function (address) {
    return address === needle || address.endsWith("@" + needle) || address.includes(needle);
  });
}
function serializeMessage(message, account) {
  var received = message.dateReceived();
  return {
    mailId: message.id(),
    messageId: text(message.messageId()),
    account: text(account.name()),
    accountAddresses: account.emailAddresses().map(text),
    sender: text(message.sender()),
    to: addressList(message.toRecipients),
    cc: addressList(message.ccRecipients),
    subject: text(message.subject()),
    receivedAt: received ? received.toISOString() : "",
    read: Boolean(message.readStatus()),
    flagged: Boolean(message.flaggedStatus()),
    replied: Boolean(message.wasRepliedTo()),
    excerpt: text(message.content()).replace(/\u0000/g, "").replace(/\r\n?/g, "\n").slice(0, 600)
  };
}
function run(argv) {
  var options = JSON.parse(argv[0]);
  var Mail = Application("Mail");
  var accounts = Mail.accounts();
  var matchingAccounts = accounts.filter(function (a) { return a.enabled() && accountMatches(a, options.accountOrDomain || ""); });
  var cutoff = new Date(Date.now() - options.recentDays * 86400000).getTime();
  var perAccountCap = Math.max(1, Math.min(options.limit, 50));
  var candidates = [];
  for (var i = 0; i < matchingAccounts.length; i += 1) {
    var acc = matchingAccounts[i];
    var inbox = inboxFor(acc);
    if (!inbox) continue;
    var msgs = inbox.messages;
    var dates, subjects, senders, reads, flags, replieds, ids;
    try {
      dates = msgs.dateReceived();
      subjects = msgs.subject();
      senders = msgs.sender();
      reads = msgs.readStatus();
      flags = msgs.flaggedStatus();
      replieds = msgs.wasRepliedTo();
      ids = msgs.id();
    } catch (_) { continue; }
    var addr = acc.emailAddresses().map(text);
    var kept = 0;
    for (var j = 0; j < dates.length; j += 1) {
      var received = dates[j];
      if (received && received.getTime() < cutoff) continue;
      if (options.unreadOnly && Boolean(reads[j])) continue;
      candidates.push({
        ref: msgs[j],
        sortKey: received ? received.getTime() : 0,
        mailId: ids[j],
        messageId: text(msgs[j].messageId()),
        account: text(acc.name()),
        accountAddresses: addr,
        sender: text(senders[j]),
        subject: text(subjects[j]),
        receivedAt: received ? received.toISOString() : "",
        read: Boolean(reads[j]),
        flagged: Boolean(flags[j]),
        replied: Boolean(replieds[j])
      });
      kept += 1;
      if (kept >= perAccountCap) break;
    }
  }
  candidates.sort(function (a, b) { return b.sortKey - a.sortKey; });
  var selected = candidates.slice(0, options.limit);
  var rows = selected.map(function (c, idx) {
    var bodyText = "";
    var toRecipients = [];
    var ccRecipients = [];
    if (idx < 15) {
      try { bodyText = text(c.ref.content()).replace(/\u0000/g, "").replace(/\r\n?/g, "\n").slice(0, 600); } catch(_) {}
      try { toRecipients = addressList(c.ref.toRecipients); } catch(_) {}
      try { ccRecipients = addressList(c.ref.ccRecipients); } catch(_) {}
    }
    return {
      mailId: c.mailId, messageId: c.messageId, account: c.account,
      accountAddresses: c.accountAddresses, sender: c.sender,
      to: toRecipients, cc: ccRecipients, subject: c.subject,
      receivedAt: c.receivedAt, read: c.read, flagged: c.flagged,
      replied: c.replied, excerpt: bodyText
    };
  });
  return JSON.stringify({ messages: rows, fetchedAt: new Date().toISOString() });
}
`;

const MARK_READ_JXA = String.raw`
function text(value) {
  if (value === null || value === undefined) return "";
  return String(value);
}
function inboxFor(account) {
  var boxes = account.mailboxes.whose({ name: "INBOX" })();
  if (!boxes.length) boxes = account.mailboxes.whose({ name: "Inbox" })();
  return boxes.length ? boxes[0] : null;
}
function accountMatches(account, filter) {
  if (!filter) return true;
  var needle = filter.toLowerCase().replace(/^@/, "");
  var name = text(account.name()).toLowerCase();
  var addresses = account.emailAddresses().map(function (item) { return text(item).toLowerCase(); });
  return name === needle || name.includes(needle) || addresses.some(function (address) {
    return address === needle || address.endsWith("@" + needle) || address.includes(needle);
  });
}
function run(argv) {
  var options = JSON.parse(argv[0]);
  var Mail = Application("Mail");
  var accounts = Mail.accounts().filter(function (account) {
    return account.enabled() && accountMatches(account, options.account || "");
  });
  for (var i = 0; i < accounts.length; i += 1) {
    var inbox = inboxFor(accounts[i]);
    if (!inbox) continue;
    var matches = inbox.messages.whose({ id: options.mailId })();
    if (!matches.length) continue;
    matches[0].readStatus = options.read;
    return JSON.stringify({ ok: true, found: true, read: Boolean(matches[0].readStatus()) });
  }
  return JSON.stringify({ ok: true, found: false, read: options.read });
}
`;

const CACHE_FILE = path.join(
  process.env.HOME || "/tmp",
  ".dorothy-cache",
  "communications.json"
);
const ACTION_LOG_FILE = path.join(
  process.env.HOME || "/tmp",
  ".openclaw",
  "logs",
  "dorothy-web-mail-actions.jsonl"
);
const TASK_TRACKING_FILE = path.join(
  process.env.HOME || "/tmp",
  ".dorothy-cache",
  "communication-tasks.json"
);
const CACHE_TTL_MS = Math.max(
  60_000,
  Number(process.env.DOROTHY_COMMUNICATIONS_INTERVAL_MS || 3 * 60 * 1000)
);
const MAIL_LIMIT = Math.max(20, Math.min(100, Number(process.env.DOROTHY_COMMUNICATIONS_MAIL_LIMIT || 50)));
const MAIL_RECENT_DAYS = Math.max(1, Math.min(90, Number(process.env.DOROTHY_COMMUNICATIONS_RECENT_DAYS || 14)));

let memoryCache = null;
let lastFetch = 0;
let fetchPromise = null;

function persistCache() {
  if (!memoryCache) return;
  try {
    const dir = path.dirname(CACHE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(memoryCache, null, 2), "utf8");
  } catch (error) {
    console.error("dorothy: cache persist error:", error.message);
  }
}

function trackedSourceIds() {
  try {
    const data = JSON.parse(fs.readFileSync(TASK_TRACKING_FILE, "utf8"));
    return new Set(Object.keys(data || {}));
  } catch (_) {
    return new Set();
  }
}

function fetchMailInbox(limit = 20, recentDays = 7) {
  return new Promise((resolve, reject) => {
    const input = JSON.stringify({
      operation: "inbox",
      limit,
      recentDays,
      unreadOnly: false,
      accountOrDomain: "",
      excerptChars: 600,
      bodyLimit: 15,
    });

    const child = spawn("osascript", [
      "-l", "JavaScript", "-e", MAIL_JXA, input,
    ], { timeout: 120000, maxBuffer: 4 * 1024 * 1024 });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });

    child.on("error", reject);

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `osascript exited ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout.trim()));
      } catch (e) {
        reject(new Error("Failed to parse mail JXA output: " + e.message));
      }
    });
  });
}

async function refreshCache() {
  // Dedup: if a refresh is already in flight, return its result
  if (fetchPromise) return fetchPromise;

  fetchPromise = (async () => {
    try {
      const result = await fetchMailInbox(MAIL_LIMIT, MAIL_RECENT_DAYS);
      const mail = enrichCommunications(result.messages || [], {
        channel: "mail",
        previousItems: memoryCache?.mail || [],
        trackedSourceIds: trackedSourceIds(),
      });
      const overview = buildCommunicationOverview(mail);
      const cache = {
        schemaVersion: 2,
        fetchedAt: new Date().toISOString(),
        coverage: {
          mail: {
            available: true,
            limit: MAIL_LIMIT,
            recentDays: MAIL_RECENT_DAYS,
          },
          imessage: {
            available: false,
            reason: "background_full_disk_access_required",
          },
          messenger: {
            available: false,
            reason: "on_demand_browser_channel",
          },
          instagram: {
            available: false,
            reason: "on_demand_browser_channel",
          },
          viber: {
            available: false,
            reason: "on_demand_accessibility_channel",
          },
        },
        mail,
        mailCount: mail.length,
        intelligence: overview,
      };
      memoryCache = cache;
      lastFetch = Date.now();

      persistCache();

      console.log(
        "dorothy: communications cache refreshed —",
        cache.mailCount,
        "messages,",
        overview.pendingCount,
        "pending"
      );
      return cache;
    } catch (e) {
      console.error("dorothy: cache refresh failed:", e.message);
      return null;
    }
  })();

  fetchPromise.finally(() => { fetchPromise = null; });
  return fetchPromise;
}

function loadPersistedCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const data = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
      memoryCache = data;
      lastFetch = new Date(data.fetchedAt || 0).getTime() || Date.now();
      console.log("dorothy: loaded persisted cache from disk");
      return true;
    }
  } catch (e) {
    console.error("dorothy: failed to load persisted cache:", e.message);
  }
  return false;
}

function startCacheWorker(intervalMs = CACHE_TTL_MS) {
  loadPersistedCache();

  // Initial fetch — await it before accepting requests
  refreshCache().then(() => {
    console.log("dorothy: initial cache refresh complete");
  }).catch((e) => {
    console.error("dorothy: initial cache refresh failed:", e.message);
  });

  // Periodic refresh
  setInterval(() => {
    refreshCache();
  }, intervalMs);

  console.log("dorothy: communications cache worker started (every " + (intervalMs / 1000) + "s)");
}

function getCachedCommunications() {
  const fresh = memoryCache && (Date.now() - lastFetch) < CACHE_TTL_MS * 2;
  if (fresh) {
    return {
      cached: true,
      ageSeconds: Math.round((Date.now() - lastFetch) / 1000),
      ...memoryCache,
    };
  }

  // Fall back to disk if memory is stale/empty but disk has data
  if (!memoryCache || !memoryCache.mail?.length) {
    try {
      if (fs.existsSync(CACHE_FILE)) {
        const disk = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
        if (disk.mail?.length) {
          memoryCache = disk;
          lastFetch = Date.now();
          return {
            cached: true,
            ageSeconds: 0,
            ...disk,
          };
        }
      }
    } catch (_) {}
  }

  // Stale or no cache
  return {
    cached: false,
    fetchedAt: memoryCache?.fetchedAt || null,
    mail: memoryCache?.mail || [],
    mailCount: memoryCache?.mailCount || 0,
    coverage: memoryCache?.coverage || null,
    intelligence: memoryCache?.intelligence || buildCommunicationOverview(memoryCache?.mail || []),
    ageSeconds: lastFetch ? Math.round((Date.now() - lastFetch) / 1000) : null,
  };
}

async function forceRefresh() {
  const result = await refreshCache();
  return result;
}

function executeMarkRead(mailId, account, read) {
  return new Promise((resolve, reject) => {
    const input = JSON.stringify({ mailId, account, read });
    const child = spawn("osascript", [
      "-l", "JavaScript", "-e", MARK_READ_JXA, input,
    ], { timeout: 30000, maxBuffer: 1024 * 1024 });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", code => {
      if (code !== 0) return reject(new Error(stderr || `osascript exited ${code}`));
      try {
        resolve(JSON.parse(stdout.trim()));
      } catch (error) {
        reject(new Error(`Failed to parse mark-read output: ${error.message}`));
      }
    });
  });
}

async function markRead(mailId, options = {}) {
  const numericId = Number(mailId);
  if (!Number.isInteger(numericId) || numericId < 1) throw new Error("Invalid mail id");
  const account = String(options.account || "").trim().slice(0, 200);
  const read = options.read !== false;
  const result = await executeMarkRead(numericId, account, read);
  if (!result.found) return { ok: false, found: false, mailId: numericId, read };

  const cached = memoryCache?.mail?.find(item =>
    Number(item.mailId) === numericId && (!account || item.account === account)
  );
  if (cached) cached.read = read;
  persistCache();

  try {
    fs.mkdirSync(path.dirname(ACTION_LOG_FILE), { recursive: true });
    fs.appendFileSync(ACTION_LOG_FILE, `${JSON.stringify({
      timestamp: new Date().toISOString(),
      action: "mail_mark_read",
      mailId: numericId,
      account: account || null,
      read,
    })}\n`, "utf8");
  } catch (error) {
    console.error("dorothy: mail action log error:", error.message);
  }

  return { ok: true, found: true, mailId: numericId, account, read };
}

module.exports = {
  startCacheWorker,
  getCachedCommunications,
  forceRefresh,
  markRead,
  refreshCache,
};
