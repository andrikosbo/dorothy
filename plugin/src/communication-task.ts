import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createCalendarEvent } from "./calendar.js";
import { createAppleNote } from "./notes.js";
import { createReminder, type ReminderList } from "./reminders.js";

const TRACKING_FILE = path.join(os.homedir(), ".dorothy-cache", "communication-tasks.json");

export type CommunicationChannel = "mail" | "imessage" | "messenger" | "instagram" | "viber" | "other";
export type FollowUpType = "reminder" | "calendar" | "none";

export type CaptureCommunicationTaskInput = {
  title: string;
  action: string;
  contact: string;
  channel: CommunicationChannel;
  messages: string[];
  context?: string;
  deadline?: string;
  sourceId: string;
  sourceUrl?: string;
  list: ReminderList;
  followUpType?: FollowUpType;
  followUpAt?: string;
  followUpEnd?: string;
  calendar?: string;
};

type Dependencies = {
  createNote: typeof createAppleNote;
  createReminderItem: typeof createReminder;
  createEvent: typeof createCalendarEvent;
  readTracking: () => Promise<Record<string, unknown>>;
  writeTracking: (data: Record<string, unknown>) => Promise<void>;
};

async function readTracking() {
  try {
    return JSON.parse(await fs.readFile(TRACKING_FILE, "utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function writeTracking(data: Record<string, unknown>) {
  await fs.mkdir(path.dirname(TRACKING_FILE), { recursive: true });
  await fs.writeFile(TRACKING_FILE, JSON.stringify(data, null, 2), "utf8");
}

const defaultDependencies: Dependencies = {
  createNote: createAppleNote,
  createReminderItem: createReminder,
  createEvent: createCalendarEvent,
  readTracking,
  writeTracking,
};

function clean(value: unknown) {
  return String(value ?? "").replace(/\u0000/g, "").trim();
}

export function buildCommunicationNoteBody(input: CaptureCommunicationTaskInput) {
  const messages = input.messages.map(clean).filter(Boolean);
  const lines = [
    "ΕΝΕΡΓΕΙΑ",
    clean(input.action),
    "",
    "ΕΠΑΦΗ",
    `${clean(input.contact)} · ${input.channel}`,
  ];
  if (input.deadline) lines.push("", "ΠΡΟΘΕΣΜΙΑ", clean(input.deadline));
  if (input.context) lines.push("", "ΠΛΑΙΣΙΟ", clean(input.context));
  lines.push("", "ΠΡΑΓΜΑΤΙΚΑ ΜΗΝΥΜΑΤΑ");
  for (const message of messages) lines.push(`• ${message}`);
  if (input.sourceUrl) lines.push("", "ΠΗΓΗ", clean(input.sourceUrl));
  lines.push("", "ΚΑΤΑΓΡΑΦΗ", new Date().toLocaleString("el-GR", { timeZone: "Europe/Athens" }));
  return lines.join("\n");
}

function notesDeepLink(noteId: unknown) {
  const id = clean(noteId);
  return id ? `notes://showNote?identifier=${encodeURIComponent(id)}` : "";
}

export async function captureCommunicationTask(
  input: CaptureCommunicationTaskInput,
  dependencies: Dependencies = defaultDependencies,
): Promise<Record<string, unknown>> {
  const title = clean(input.title);
  const action = clean(input.action);
  const contact = clean(input.contact);
  const sourceId = clean(input.sourceId);
  const messages = input.messages.map(clean).filter(Boolean);
  if (!title || !action || !contact || !sourceId) return { ok: false, error: "missing_required_field" };
  if (messages.length === 0) return { ok: false, error: "messages_required" };

  const tracking = await dependencies.readTracking();
  if (tracking[sourceId]) {
    return { ok: true, skipped: true, reason: "already_tracked", existing: tracking[sourceId] };
  }

  const noteTitle = `Εκκρεμότητα · ${contact} · ${title}`;
  const note = await dependencies.createNote({
    title: noteTitle,
    body: buildCommunicationNoteBody({ ...input, messages }),
    folder: "Dorothy Tasks",
  });
  if (!note.ok) return { ok: false, stage: "note", note };

  const deepLink = notesDeepLink(note.id);
  const shortReference = [
    `Ενέργεια: ${action}`,
    `Λεπτομέρειες: Apple Notes > Dorothy Tasks > ${noteTitle}`,
    deepLink,
  ].filter(Boolean).join("\n");

  const followUpType = input.followUpType ?? (input.followUpAt ? "reminder" : "none");
  let followUp: Record<string, unknown> = { ok: true, skipped: true, reason: "not_requested" };
  if (followUpType === "reminder") {
    followUp = await dependencies.createReminderItem({
      title,
      notes: shortReference,
      list: input.list,
      dueDate: input.followUpAt,
      sourceId: `communication:${sourceId}`,
    });
  } else if (followUpType === "calendar") {
    if (!input.followUpAt) return { ok: false, stage: "calendar", error: "follow_up_at_required", note };
    followUp = await dependencies.createEvent({
      title,
      startDate: input.followUpAt,
      endDate: input.followUpEnd,
      calendar: input.calendar,
      notes: shortReference,
      url: deepLink,
    });
  }

  if (!followUp.ok) return { ok: false, stage: "follow_up", note, followUp };

  tracking[sourceId] = {
    title,
    action,
    contact,
    channel: input.channel,
    noteTitle,
    noteId: note.id || null,
    followUpType,
    followUpAt: input.followUpAt || null,
    createdAt: new Date().toISOString(),
  };
  await dependencies.writeTracking(tracking);
  return { ok: true, note, followUpType, followUp };
}
