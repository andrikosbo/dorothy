import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// Autonomous notifications TO THE USER (the owner). Delivery is into the Dorothy
// web app (his primary channel): notifications are written to a shared store
// file that the web app reads and surfaces in its notification center + an
// optional OS banner. This is a self-notification channel — it reaches only
// the user, never a third party — so it runs without per-message approval.

export const NOTIFY_LOG_PATH = path.join(os.homedir(), ".openclaw", "logs", "dorothy-notifications.jsonl");
// Shared with the web app (dorothy-web/server.js /api/notifications).
export const NOTIFY_STORE_PATH = path.join(os.homedir(), ".openclaw", "data", "dorothy-web-notifications.json");
export const NOTIFY_TEXT_MAX = 3_500;
export const NOTIFY_STORE_CAP = 100;

// Quiet hours in Europe/Athens local time. Non-urgent notifications are still
// stored (so the bell shows them later) but flagged silent so the web app does
// not pop an OS banner / sound during this window.
const QUIET_START_HOUR = 23; // 23:30
const QUIET_START_MIN = 30;
const QUIET_END_HOUR = 7; // 07:30
const QUIET_END_MIN = 30;

// Default dedup window: identical notifications within this many minutes are
// suppressed so a recurring watcher does not spam the same alert.
const DEFAULT_DEDUP_MINUTES = 180;

export type NotifyInput = {
  text: string;
  title?: string;
  urgent?: boolean;
  dedupKey?: string;
  dedupMinutes?: number;
  macFallback?: boolean;
};

type StoredNotification = {
  id: string;
  at: string;
  title: string;
  text: string;
  urgent: boolean;
  read: boolean;
  silent: boolean;
  dedupKey?: string;
};

function inQuietHours(): boolean {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Athens",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const mins = hour * 60 + minute;
  const start = QUIET_START_HOUR * 60 + QUIET_START_MIN;
  const end = QUIET_END_HOUR * 60 + QUIET_END_MIN;
  return mins >= start || mins < end; // window crosses midnight
}

async function readStore(): Promise<StoredNotification[]> {
  try {
    const raw = await fs.readFile(NOTIFY_STORE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as StoredNotification[];
  } catch {
    /* missing or corrupt -> fresh */
  }
  return [];
}

async function writeStore(items: StoredNotification[]): Promise<void> {
  await fs.mkdir(path.dirname(NOTIFY_STORE_PATH), { recursive: true });
  // Atomic-ish write: temp then rename, so the web app never reads a half file.
  const tmp = `${NOTIFY_STORE_PATH}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(items), "utf8");
  await fs.rename(tmp, NOTIFY_STORE_PATH);
}

async function appendNotifyLog(record: Record<string, unknown>): Promise<void> {
  await fs.mkdir(path.dirname(NOTIFY_LOG_PATH), { recursive: true });
  await fs.appendFile(NOTIFY_LOG_PATH, `${JSON.stringify({ at: new Date().toISOString(), ...record })}\n`, "utf8");
}

async function macNotify(title: string, text: string): Promise<void> {
  const safe = (s: string) => s.replace(/["\\]/g, " ").slice(0, 200);
  const script = `display notification "${safe(text)}" with title "${safe(title)}" sound name "Glass"`;
  try {
    await execFileAsync("osascript", ["-e", script], { timeout: 8_000 });
  } catch {
    /* best effort */
  }
}

export async function notifyOwner(input: NotifyInput): Promise<Record<string, unknown>> {
  const text = (input.text ?? "").trim();
  if (!text) return { ok: false, error: "empty_text" };
  if (text.length > NOTIFY_TEXT_MAX) return { ok: false, error: "text_too_long", max: NOTIFY_TEXT_MAX };

  const urgent = input.urgent === true;
  const title = (input.title ?? "Dorothy").trim() || "Dorothy";
  const dedupKey = (input.dedupKey ?? "").trim();
  const dedupMinutes = Math.max(0, input.dedupMinutes ?? DEFAULT_DEDUP_MINUTES);
  const silent = !urgent && inQuietHours();

  const store = await readStore();

  // Dedup: skip identical notification inside the window.
  if (dedupKey && dedupMinutes > 0) {
    const prior = store.find((n) => n.dedupKey === dedupKey);
    if (prior) {
      const ageMin = (Date.now() - new Date(prior.at).getTime()) / 60_000;
      if (ageMin < dedupMinutes) {
        await appendNotifyLog({ action: "notify", result: "deduped", dedupKey, ageMinutes: Math.round(ageMin), title });
        return { ok: true, suppressed: "deduped", dedupKey, ageMinutes: Math.round(ageMin) };
      }
    }
  }

  const entry: StoredNotification = {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    title,
    text,
    urgent,
    read: false,
    silent,
    ...(dedupKey ? { dedupKey } : {}),
  };

  // Newest first; keep the store bounded.
  const next = [entry, ...store].slice(0, NOTIFY_STORE_CAP);

  let result: Record<string, unknown>;
  try {
    await writeStore(next);
    result = { ok: true, channel: "webapp", id: entry.id };
  } catch (error) {
    result = { ok: false, error: String((error as Error).message || error) };
  }

  // Optional Mac banner (default on for urgent), but stay quiet during quiet hours.
  const wantMac = (input.macFallback ?? urgent) && !silent;
  if (wantMac) await macNotify(title, text);

  await appendNotifyLog({
    action: "notify",
    result: result.ok ? "stored" : "failed",
    urgent,
    silent,
    title,
    mac: wantMac,
    textPreview: text.slice(0, 200),
    error: result.ok ? undefined : result.error,
  });

  return { ...result, urgent, silent, deliveredTo: "Dorothy web app notification center" };
}
