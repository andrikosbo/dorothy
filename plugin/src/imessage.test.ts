import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assessIMessageReplyNeed,
  clipIMessageExcerpt,
  IMESSAGE_EXCERPT_MAX,
  IMESSAGE_LIMIT_MAX,
  normalizeIMessageChat,
  normalizeIMessageMessage,
  normalizeIMessageQuery,
  parseIMessageJsonLines,
  readIMessageNeedsReply,
  readIMessageRecent,
} from "./imessage.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function tempLogPath() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "dorothy-imessage-"));
  tempDirs.push(dir);
  return path.join(dir, "imessage.jsonl");
}

const chat = {
  id: 7,
  name: "George",
  identifier: "+301234",
  service: "iMessage",
  participants: ["+301234"],
  last_message_at: "2026-06-07T10:00:00.000Z",
  is_group: false,
};

function message(overrides: Record<string, unknown> = {}) {
  return {
    id: 101,
    guid: "guid-101",
    chat_id: 7,
    chat_name: "George",
    sender: "+301234",
    sender_name: "George",
    is_from_me: false,
    text: "Can you confirm today?",
    created_at: "2026-06-07T10:00:00.000Z",
    participants: ["+301234"],
    ...overrides,
  };
}

describe("iMessage parsing and bounds", () => {
  it("parses imsg JSONL output", () => {
    expect(parseIMessageJsonLines(`${JSON.stringify(chat)}\n${JSON.stringify({ ...chat, id: 8 })}\n`))
      .toHaveLength(2);
  });

  it("normalizes chat and message records with unread state", () => {
    const normalizedChat = normalizeIMessageChat(chat);
    expect(normalizeIMessageMessage(message(), normalizedChat, new Set([101]))).toMatchObject({
      messageId: 101,
      chatId: 7,
      conversation: "George",
      sender: "George",
      unread: true,
      fromMe: false,
      contentIsUntrusted: true,
    });
  });

  it("clips excerpts and clamps all public limits", () => {
    expect(clipIMessageExcerpt("x".repeat(5_000), 9_000)).toHaveLength(IMESSAGE_EXCERPT_MAX);
    expect(normalizeIMessageQuery({
      limit: 999,
      chatLimit: 999,
      recentDays: 999,
      excerptChars: 9999,
    })).toMatchObject({
      limit: IMESSAGE_LIMIT_MAX,
      recentDays: 90,
      excerptChars: IMESSAGE_EXCERPT_MAX,
    });
  });
});

describe("read-only iMessage reads", () => {
  it("reads recent and unread messages through bounded operations", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const result = await readIMessageRecent({
      limit: 2,
      unreadOnly: true,
      recentDays: 1,
    }, {
      logPath: await tempLogPath(),
      executor: async (operation) => {
        calls.push(operation);
        if (operation.operation === "chats") return [chat];
        if (operation.operation === "unreadIds") return [{ id: 101 }];
        return [message(), message({ id: 102, is_from_me: true, text: "Handled" })];
      },
    });
    expect(calls.map((call) => call.operation)).toEqual(["chats", "history", "unreadIds"]);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].unread).toBe(true);
  });

  it("detects reply-needed conversations and ignores a newer outgoing reply", async () => {
    const result = await readIMessageNeedsReply({ limit: 5 }, {
      logPath: await tempLogPath(),
      executor: async (operation) => {
        if (operation.operation === "chats") return [chat];
        if (operation.operation === "unreadIds") return [{ id: 101 }];
        return [
          message({ id: 102, is_from_me: true, text: "Yes", created_at: "2026-06-07T11:00:00.000Z" }),
          message(),
        ];
      },
    });
    expect(result.messages).toHaveLength(0);
  });

  it("preserves a reason for the latest incoming direct request", () => {
    const normalized = normalizeIMessageMessage(
      message(),
      normalizeIMessageChat(chat),
      new Set([101]),
    );
    expect(assessIMessageReplyNeed(normalized)).toEqual({
      likely: true,
      reason: "Latest incoming message contains a question or direct request.",
    });
  });

  it("writes redacted logs without names, handles, or message text", async () => {
    const logPath = await tempLogPath();
    await readIMessageRecent({ limit: 1 }, {
      logPath,
      executor: async (operation) => {
        if (operation.operation === "chats") return [chat];
        if (operation.operation === "unreadIds") return [{ id: 101 }];
        return [message()];
      },
    });
    const raw = await fs.readFile(logPath, "utf8");
    expect(raw).not.toContain("George");
    expect(raw).not.toContain("+301234");
    expect(raw).not.toContain("confirm today");
    expect(JSON.parse(raw.trim())).toMatchObject({
      action: "imessage_recent",
      readOnly: true,
      resultCount: 1,
    });
  });

  it("contains no mutating imsg subcommands or message state writes", async () => {
    const source = await fs.readFile(new URL("./imessage.ts", import.meta.url), "utf8");
    for (const forbidden of [
      /"send"/,
      /"read"/,
      /chat-mark/,
      /delete-message/,
      /message\.edit/,
      /message\.unsend/,
      /UPDATE\s+message/i,
      /DELETE\s+FROM/i,
      /INSERT\s+INTO/i,
    ]) expect(source).not.toMatch(forbidden);
    expect(source).toContain('"-readonly"');
  });
});
