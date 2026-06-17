import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
  readSocialNeedsReply,
  readSocialRecent,
  SOCIAL_LOG_DIR,
  type RawSocialRow,
  type SocialChannelConfig,
  type SocialExecutor,
  type SocialQuery,
} from "./social.js";

const execFileAsync = promisify(execFile);

// Viber Desktop is read through macOS accessibility (System Events), not the
// browser, so it shares the SocialMessage shape but supplies its own executor.
// viber.db is SQLCipher-encrypted, so the on-screen UI is the only read path.
//
// Limitations: Viber uses Qt/QML which exposes message history via AXTextField
// elements but does NOT expose the conversation list. The executor reads the
// currently-displayed conversation's messages. For conversation list browsing
// (names + previews) we would need screenshot+OCR or lower-level Qt bridge.

function buildViberJxa(): string {
  return String.raw`
function text(value) {
  if (value === null || value === undefined) return "";
  return String(value);
}
function run() {
  var se = Application("System Events");
  var viber = se.processes.byName("Viber");
  if (!viber) return JSON.stringify({ available: false, error: "Viber is not running" });
  var win = viber.windows[0];
  if (!win) return JSON.stringify({ available: false, error: "Viber window not found" });
  try {
    var all = win.entireContents();
    var rows = [];
    var seen = {};
    for (var i = 0; i < all.length; i++) {
      try {
        var el = all[i];
        var role = el.role();
        if (role !== "AXTextField") continue;
        var val = "";
        try { var v = el.value(); if (typeof v === "string") val = v; } catch(e){}
        if (!val || val.length < 2) continue;
        // Skip the search field
        var desc = "";
        try { desc = el.description(); } catch(e){}
        if (desc === "Search...") continue;
        // Skip very long messages (likely message history, not conversation name)
        if (val.length > 100) continue;
        var key = val.slice(0, 40);
        if (seen[key]) continue;
        seen[key] = true;
        rows.push({ id: "viber:" + key.replace(/\\s+/g, "-"), lines: [val] });
      } catch(e) {}
    }
    if (rows.length === 0) {
      return JSON.stringify({ available: false, error: "No Viber conversations accessible via AX" });
    }
    return JSON.stringify({ available: true, rows: rows });
  } catch(e) {
    return JSON.stringify({ available: false, error: e.message });
  }
}
`;
}

const viberDesktopExecutor: SocialExecutor = async (_config: SocialChannelConfig, timeoutMs: number): Promise<RawSocialRow[]> => {
  const jxa = buildViberJxa();
  const { stdout } = await execFileAsync("osascript", [
    "-l", "JavaScript", "-e", jxa,
  ], { timeout: timeoutMs, maxBuffer: 1024 * 1024 });
  const result = JSON.parse(stdout.trim());
  if (!result.available) {
    throw new Error(result.error || "Viber unavailable");
  }
  return result.rows || [];
};

export const VIBER_CONFIG: SocialChannelConfig = {
  channel: "viber",
  host: "viber-desktop",
  url: "",
  extract: () => [],
  settleMs: 0,
  unreadMarker: /^unread$/i,
  fromMePrefix: /^(you|εσείς|εσύ)(\s|:|$)/i,
  automatedConversation: /^viber$/i,
  logPath: path.join(SOCIAL_LOG_DIR, "dorothy-viber-actions.jsonl"),
};

export type ViberThreadMessage = {
  text: string;
  fromMe: boolean;
  direction: "incoming" | "outgoing";
  ownershipConfidence: "position";
  position: { x: number; y: number };
};

export function classifyViberMessagePosition(
  messageX: number,
  windowX: number,
  windowWidth: number,
) {
  return messageX > windowX + windowWidth * 0.68;
}

const VIBER_CONTACT_MESSAGES_JXA = String.raw`
function run(argv) {
  var contact = String(argv[0] || "").trim();
  var limit = Math.max(1, Math.min(Number(argv[1] || 80), 200));
  var se = Application("System Events");
  var processes = se.applicationProcesses.whose({ name: "Viber" });
  if (processes.length === 0) {
    Application("Viber").activate();
    delay(2);
    processes = se.applicationProcesses.whose({ name: "Viber" });
  }
  if (processes.length === 0) return JSON.stringify({ ok: false, state: "viber_not_running" });
  var process = processes[0];
  process.frontmost = true;
  var windows = process.windows();
  if (windows.length === 0) return JSON.stringify({ ok: false, state: "window_not_found" });
  var window = windows[0];
  var all = window.entireContents();
  var search = null;
  for (var i = 0; i < all.length; i++) {
    try {
      if (String(all[i].role()) === "AXTextField" && String(all[i].description() || "") === "Search...") {
        search = all[i];
        break;
      }
    } catch (error) {}
  }
  if (!search) return JSON.stringify({ ok: false, state: "search_not_found" });

  search.actions.byName("AXPress").perform();
  se.keystroke("a", { using: "command down" });
  se.keystroke(contact);
  delay(1);
  se.keyCode(125);
  se.keyCode(36);
  delay(2);

  all = window.entireContents();
  var windowPosition = window.position();
  var windowSize = window.size();
  var threshold = Number(windowPosition[0]) + Number(windowSize[0]) * 0.68;
  var paneStart = Number(windowPosition[0]) + Number(windowSize[0]) * 0.35;
  var rows = [];
  for (var j = 0; j < all.length; j++) {
    try {
      var element = all[j];
      if (String(element.role()) !== "AXTextField") continue;
      if (String(element.description() || "") === "Search...") continue;
      var value = element.value();
      if (typeof value !== "string" || !value.trim()) continue;
      var position = element.position();
      var size = element.size();
      var x = Number(position[0]);
      var y = Number(position[1]);
      if (x < paneStart || Number(size[0]) <= 0) continue;
      rows.push({
        text: value.trim(),
        fromMe: x > threshold,
        direction: x > threshold ? "outgoing" : "incoming",
        ownershipConfidence: "position",
        position: { x: x, y: y }
      });
    } catch (error) {}
  }
  rows.sort(function (a, b) { return a.position.y - b.position.y; });
  rows = rows.slice(-limit);
  return JSON.stringify({
    ok: rows.length > 0,
    state: rows.length > 0 ? "ready" : "thread_not_loaded",
    contact: contact,
    count: rows.length,
    messages: rows
  });
}
`;

export async function readViberContactMessages(contact: string, limit = 80) {
  const cleanContact = contact.trim();
  if (!cleanContact) return { ok: false, state: "contact_required" };
  try {
    const { stdout } = await execFileAsync("osascript", [
      "-l", "JavaScript", "-e", VIBER_CONTACT_MESSAGES_JXA, "--", cleanContact, String(limit),
    ], { timeout: 20_000, maxBuffer: 1024 * 1024 });
    return JSON.parse(stdout.trim()) as {
      ok: boolean;
      state: string;
      contact?: string;
      count?: number;
      messages?: ViberThreadMessage[];
    };
  } catch (error) {
    return { ok: false, state: "accessibility_error", error: String((error as Error).message || error) };
  }
}

export function readViberRecent(
  query: SocialQuery = {},
  options: { executor?: SocialExecutor; timeoutMs?: number } = {},
) {
  return readSocialRecent(VIBER_CONFIG, query, {
    executor: options.executor ?? viberDesktopExecutor,
    timeoutMs: options.timeoutMs,
  });
}

export function readViberNeedsReply(
  query: SocialQuery = {},
  options: { executor?: SocialExecutor; timeoutMs?: number } = {},
) {
  return readSocialNeedsReply(VIBER_CONFIG, query, {
    executor: options.executor ?? viberDesktopExecutor,
    timeoutMs: options.timeoutMs,
  });
}
