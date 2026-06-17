import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const TRACKING_FILE = path.join(os.homedir(), ".dorothy-cache", "task-reminders.json");

export type ReminderList = "Family" | "Work" | "Personal";

export type CreateReminderInput = {
  title: string;
  notes?: string;
  list: ReminderList;
  dueDate?: string;
  sourceId?: string;
};

export type ReminderTrackingEntry = {
  title: string;
  list: ReminderList;
  createdAt: string;
};

type TrackingFile = Record<string, ReminderTrackingEntry>;

async function loadTracking(): Promise<TrackingFile> {
  try {
    const raw = await fs.readFile(TRACKING_FILE, "utf8");
    return JSON.parse(raw) as TrackingFile;
  } catch {
    return {};
  }
}

async function saveTracking(data: TrackingFile): Promise<void> {
  await fs.mkdir(path.dirname(TRACKING_FILE), { recursive: true });
  await fs.writeFile(TRACKING_FILE, JSON.stringify(data, null, 2), "utf8");
}

// JXA script: create a Reminder in a given list, optionally with body + due date.
// Using JXA (not AppleScript string templates) so dates and quotes are passed as
// argv and handled by the JS Date constructor instead of fragile string escaping.
const CREATE_REMINDER_JXA = `
function run(argv) {
  var app = Application("Reminders");
  var listName = argv[0];
  var title = argv[1];
  var body = argv[2];
  var dueIso = argv[3];

  var lists = app.lists.whose({ name: listName });
  if (lists.length === 0) {
    return JSON.stringify({ ok: false, error: "list_not_found", list: listName });
  }
  var list = lists[0];

  var props = { name: title };
  if (body) props.body = body;

  var reminder = app.Reminder(props);
  list.reminders.push(reminder);

  if (dueIso) {
    reminder.dueDate = new Date(dueIso);
  }

  return JSON.stringify({ ok: true, name: reminder.name(), list: listName });
}
`;

async function runJxa(script: string, args: string[], timeoutMs = 10_000): Promise<string> {
  const { stdout } = await execFileAsync("osascript", ["-l", "JavaScript", "-e", script, "--", ...args], {
    timeout: timeoutMs,
  });
  return stdout.trim();
}

export async function createReminder(input: CreateReminderInput): Promise<Record<string, unknown>> {
  const title = input.title.trim();
  if (!title) return { ok: false, error: "empty_title" };

  if (input.sourceId) {
    const tracking = await loadTracking();
    const existing = tracking[input.sourceId];
    if (existing) {
      return { ok: true, skipped: true, reason: "already_tracked", existing };
    }
  }

  const raw = await runJxa(CREATE_REMINDER_JXA, [
    input.list,
    title,
    (input.notes || "").trim(),
    input.dueDate || "",
  ]);

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { ok: false, error: "unexpected_response", raw };
  }

  if (parsed.ok && input.sourceId) {
    const tracking = await loadTracking();
    tracking[input.sourceId] = {
      title,
      list: input.list,
      createdAt: new Date().toISOString(),
    };
    await saveTracking(tracking);
  }

  return parsed;
}
