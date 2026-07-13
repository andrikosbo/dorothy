import { describe, expect, it, vi } from "vitest";
import { buildCommunicationNoteBody, captureCommunicationTask } from "./communication-task.js";

const base = {
  title: "Στείλε τα στοιχεία hosting",
  action: "Να στείλω URL, username και ημερομηνία λήξης.",
  contact: "Μπάμπης",
  channel: "messenger" as const,
  messages: ["Στείλε μου τα στοιχεία του hosting.", "Το χρειάζομαι μέχρι αύριο."],
  deadline: "Αύριο",
  sourceId: "messenger:702:hosting",
  list: "Work" as const,
  followUpType: "reminder" as const,
  followUpAt: "2026-06-12T09:00:00+03:00",
};

describe("communication task capture", () => {
  it("keeps real message content in the Apple Note body", () => {
    const body = buildCommunicationNoteBody(base);
    expect(body).toContain("ΕΝΕΡΓΕΙΑ");
    expect(body).toContain("• Στείλε μου τα στοιχεία του hosting.");
    expect(body).toContain("ΠΡΟΘΕΣΜΙΑ");
  });

  it("creates the note first and a short linked reminder", async () => {
    const tracking: Record<string, unknown> = {};
    const createNote = vi.fn(async () => ({ ok: true, id: "x-coredata://note/1", name: "note" }));
    const createReminderItem = vi.fn(async () => ({ ok: true, name: base.title, list: "Work" }));
    const result = await captureCommunicationTask(base, {
      createNote,
      createReminderItem,
      createEvent: vi.fn(async () => ({ ok: true })),
      readTracking: async () => tracking,
      writeTracking: async (data) => { Object.assign(tracking, data); },
    });
    expect(result.ok).toBe(true);
    expect(createNote).toHaveBeenCalledOnce();
    expect(createReminderItem).toHaveBeenCalledWith(expect.objectContaining({
      notes: expect.stringContaining("Apple Notes > Dorothy Tasks"),
      sourceId: `communication:${base.sourceId}`,
    }));
  });

  it("deduplicates the complete note and follow-up bundle", async () => {
    const createNote = vi.fn(async () => ({ ok: true }));
    const result = await captureCommunicationTask(base, {
      createNote,
      createReminderItem: vi.fn(async () => ({ ok: true })),
      createEvent: vi.fn(async () => ({ ok: true })),
      readTracking: async () => ({ [base.sourceId]: { title: base.title } }),
      writeTracking: async () => {},
    });
    expect(result).toMatchObject({ ok: true, skipped: true, reason: "already_tracked" });
    expect(createNote).not.toHaveBeenCalled();
  });
});
