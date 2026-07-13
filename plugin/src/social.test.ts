import { describe, expect, it } from "vitest";
import { INSTAGRAM_CONFIG, readInstagramRecent } from "./instagram.js";
import { MESSENGER_CONFIG, readMessengerNeedsReply, readMessengerRecent } from "./messenger.js";
import {
  assessSocialReplyNeed,
  parseRelativeAgeMinutes,
  parseSocialRow,
  type RawSocialRow,
  type SocialExecutor,
} from "./social.js";

function mockExecutor(rows: RawSocialRow[]): SocialExecutor {
  return async () => rows;
}

describe("relative age parsing", () => {
  it("understands Greek and English units", () => {
    expect(parseRelativeAgeMinutes("τώρα")).toBe(0);
    expect(parseRelativeAgeMinutes("10 ώρ.")).toBe(600);
    expect(parseRelativeAgeMinutes("1 ημ.")).toBe(1440);
    expect(parseRelativeAgeMinutes("4m")).toBe(4);
    expect(parseRelativeAgeMinutes("2h")).toBe(120);
    expect(parseRelativeAgeMinutes("1d")).toBe(1440);
    expect(parseRelativeAgeMinutes("garbage")).toBeNull();
  });
});

describe("messenger row parsing", () => {
  it("extracts name, sender, unread, and time from a Messenger row", () => {
    const message = parseSocialRow(MESSENGER_CONFIG, {
      id: "123",
      lines: ["Ίδρυμα", "Μη αναγνωσμένο μήνυμα:", "Χριστόφας: Που σημαίνει ρωσομπλιετ", "·", "10 ώρ."],
    }, 600);
    expect(message).toMatchObject({
      channel: "messenger",
      conversationId: "123",
      conversation: "Ίδρυμα",
      sender: "Χριστόφας",
      excerpt: "Που σημαίνει ρωσομπλιετ",
      unread: true,
      fromMe: false,
      when: "10 ώρ.",
    });
  });

  it("marks your own latest message as fromMe", () => {
    const message = parseSocialRow(MESSENGER_CONFIG, {
      id: "9",
      lines: ["MacBots Pro", "Εσείς: ok thanks", "·", "3 ώρ."],
    }, 600);
    expect(message.fromMe).toBe(true);
    expect(message.sender).toBe("Me");
  });
});

describe("instagram row parsing", () => {
  it("treats a trailing Unread token as unread state", () => {
    const message = parseSocialRow(INSTAGRAM_CONFIG, {
      lines: ["Τάνια Λαφτσή", "Τάνια sent an attachment.", "·", "4m", "Unread"],
    }, 600);
    expect(message).toMatchObject({
      channel: "instagram",
      conversation: "Τάνια Λαφτσή",
      unread: true,
      when: "4m",
      ageMinutes: 4,
    });
  });

  it("detects a sent-by-me preview", () => {
    const message = parseSocialRow(INSTAGRAM_CONFIG, {
      lines: ["george_blacksad", "You sent an attachment.", "·", "2h"],
    }, 600);
    expect(message.fromMe).toBe(true);
    expect(message.unread).toBe(false);
  });
});

describe("social reply-need assessment", () => {
  const base = parseSocialRow(MESSENGER_CONFIG, {
    id: "1",
    lines: ["Μαρία", "Μαρία: Που εισαι;", "·", "12 ώρ."],
  }, 600);

  it("flags an incoming question", () => {
    expect(assessSocialReplyNeed(MESSENGER_CONFIG, base).likely).toBe(true);
  });

  it("excludes my own message", () => {
    expect(assessSocialReplyNeed(MESSENGER_CONFIG, { ...base, fromMe: true }).likely).toBe(false);
  });

  it("excludes reaction-only updates", () => {
    const reaction = parseSocialRow(MESSENGER_CONFIG, {
      id: "2",
      lines: ["Ρύποι", "Natallia: Αγάπησα", "·", "1 ημ."],
    }, 600);
    expect(assessSocialReplyNeed(MESSENGER_CONFIG, reaction).likely).toBe(false);
  });

  it("excludes automated business conversations", () => {
    const meta = parseSocialRow(MESSENGER_CONFIG, {
      id: "3",
      lines: ["Meta Business Support", "Απαιτείται ενέργεια", "·", "2 ώρ."],
    }, 600);
    expect(assessSocialReplyNeed(MESSENGER_CONFIG, meta).likely).toBe(false);
  });
});

describe("social read pipeline", () => {
  const rows: RawSocialRow[] = [
    { id: "1", lines: ["Ίδρυμα", "Μη αναγνωσμένο μήνυμα:", "Χριστόφας: Που εισαι;", "·", "10 ώρ."] },
    { id: "2", lines: ["Ρύποι", "Natallia: Αγάπησα", "·", "1 ημ."] },
    { id: "3", lines: ["Old Thread", "someone: hello", "·", "3 εβδ."] },
  ];

  it("returns recent messages and honours unreadOnly", async () => {
    const all = await readMessengerRecent({ limit: 10, recentDays: 90 }, { executor: mockExecutor(rows), timeoutMs: 1 });
    expect(all.messages).toHaveLength(3);
    const unread = await readMessengerRecent({ limit: 10, unreadOnly: true }, { executor: mockExecutor(rows), timeoutMs: 1 });
    expect(unread.messages.map((m) => m.conversation)).toEqual(["Ίδρυμα"]);
  });

  it("drops messages older than recentDays", async () => {
    const recent = await readMessengerRecent({ limit: 10, recentDays: 7 }, { executor: mockExecutor(rows), timeoutMs: 1 });
    expect(recent.messages.map((m) => m.conversation)).not.toContain("Old Thread");
  });

  it("collects only reply-needed conversations", async () => {
    const needs = await readMessengerNeedsReply({ limit: 10 }, { executor: mockExecutor(rows), timeoutMs: 1 });
    expect(needs.messages.map((m) => m.conversation)).toEqual(["Ίδρυμα"]);
    expect(needs.messages[0].replyReason).toMatch(/question|unread/i);
  });

  it("works through the Instagram adapter too", async () => {
    const igRows: RawSocialRow[] = [
      { lines: ["Τάνια Λαφτσή", "Τάνια: είσαι εκεί;", "·", "4m", "Unread"] },
    ];
    const result = await readInstagramRecent({ limit: 5 }, { executor: mockExecutor(igRows), timeoutMs: 1 });
    expect(result.messages[0]).toMatchObject({ channel: "instagram", unread: true });
  });
});
