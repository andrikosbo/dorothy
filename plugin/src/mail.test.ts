import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assessReplyNeed,
  clipMailExcerpt,
  listMailAccounts,
  MAIL_EXCERPT_MAX,
  MAIL_JXA_SCRIPT,
  MAIL_LIMIT_MAX,
  MAIL_RECENT_DAYS_MAX,
  normalizeInboxQuery,
  normalizeMailMessage,
  readMailInbox,
  readMailMessage,
  readMailNeedsReply,
} from "./mail.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

function rawMessage(overrides: Record<string, unknown> = {}) {
  return {
    mailId: 101,
    messageId: "header-id@example.com",
    account: "Google",
    accountAddresses: ["you@example.com"],
    sender: "Client <client@example.com>",
    to: ["the user <you@example.com>"],
    cc: [],
    subject: "Re: Website project",
    receivedAt: "2026-06-07T10:00:00.000Z",
    read: false,
    flagged: false,
    replied: false,
    content: "Can you confirm the deadline?",
    ...overrides,
  };
}

async function tempLogPath() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "dorothy-mail-"));
  tempDirs.push(dir);
  return path.join(dir, "mail.jsonl");
}

describe("Mail.app normalization and limits", () => {
  it("normalizes fields and marks content as untrusted", () => {
    expect(normalizeMailMessage(rawMessage())).toMatchObject({
      mailId: 101,
      account: "Google",
      unread: true,
      flagged: false,
      replied: false,
      excerpt: "Can you confirm the deadline?",
      contentIsUntrusted: true,
    });
  });

  it("clips long excerpts at the strict maximum", () => {
    const clipped = clipMailExcerpt("x".repeat(5_000), 5_000);
    expect(clipped.length).toBe(MAIL_EXCERPT_MAX);
    expect(clipped.endsWith("…")).toBe(true);
  });

  it("clamps query limits, recent days, and excerpt size", () => {
    expect(normalizeInboxQuery({
      limit: 999,
      recentDays: 999,
      excerptChars: 99999,
    })).toMatchObject({
      limit: MAIL_LIMIT_MAX,
      recentDays: MAIL_RECENT_DAYS_MAX,
      excerptChars: MAIL_EXCERPT_MAX,
    });
  });
});

describe("Mail.app filters and read-only operations", () => {
  it("passes bounded filters to the executor and caps returned rows", async () => {
    const calls: unknown[] = [];
    const logPath = await tempLogPath();
    const executor = async (operation: unknown) => {
      calls.push(operation);
      return { messages: Array.from({ length: 10 }, (_, index) => rawMessage({ mailId: index + 1 })) };
    };
    const result = await readMailInbox({
      limit: 2,
      unreadOnly: true,
      accountOrDomain: "@example.com",
      recentDays: 3,
      excerptChars: 200,
    }, { executor, logPath });

    expect(calls[0]).toMatchObject({
      operation: "inbox",
      limit: 2,
      unreadOnly: true,
      accountOrDomain: "example.com",
      recentDays: 3,
      excerptChars: 200,
    });
    expect(result.messages).toHaveLength(2);
  });

  it("lists account addresses and derived domains", async () => {
    const logPath = await tempLogPath();
    const accounts = await listMailAccounts({
      executor: async () => [{
        name: "iCloud",
        enabled: true,
        emailAddresses: ["info@acme.example", "info@globex.example"],
      }],
      logPath,
    });
    expect(accounts[0]).toEqual({
      name: "iCloud",
      enabled: true,
      emailAddresses: ["info@acme.example", "info@globex.example"],
      domains: ["acme.example", "globex.example"],
    });
  });

  it("reads one message by numeric Mail.app id", async () => {
    const logPath = await tempLogPath();
    const message = await readMailMessage(101, { accountOrDomain: "example.com" }, {
      executor: async (operation) => {
        expect(operation).toMatchObject({
          operation: "message",
          mailId: 101,
          accountOrDomain: "example.com",
        });
        return { message: rawMessage() };
      },
      logPath,
    });
    expect(message?.mailId).toBe(101);
  });

  it("contains no Mail mutation commands beyond the sanctioned markRead operation", () => {
    const forbidden = [
      /\bMail\.send\b/i,
      /\bdelete\s*\(/i,
      /\bmove\s*\(/i,
      /\barchive\s*\(/i,
      /\bflaggedStatus\s*=/i,
      /\bmake\s+new\s+outgoing/i,
    ];
    for (const pattern of forbidden) expect(MAIL_JXA_SCRIPT).not.toMatch(pattern);
    // readStatus assignment is allowed only inside the markRead operation branch.
    const assignments = MAIL_JXA_SCRIPT.match(/\breadStatus\s*=(?!=)/g) || [];
    expect(assignments.length).toBeLessThanOrEqual(1);
    expect(MAIL_JXA_SCRIPT).toContain('options.operation === "markRead"');
  });

  it("applies unread and recent-date filters inside Mail.app", () => {
    // Filtering happens in JS over bulk-read property arrays rather than a slow
    // Mail.app whose() predicate that scans the whole mailbox over Apple Events.
    expect(MAIL_JXA_SCRIPT).toContain("options.unreadOnly && Boolean(reads[j])");
    expect(MAIL_JXA_SCRIPT).toContain("received.getTime() < cutoff");
    expect(MAIL_JXA_SCRIPT).toContain("inboxMessages.dateReceived()");
  });

  it("defers message body reads to a bounded set of selected messages", () => {
    expect(MAIL_JXA_SCRIPT).toContain("var bodyLimit");
    expect(MAIL_JXA_SCRIPT).toContain("if (index < bodyLimit)");
  });
});

describe("reply-needed filtering", () => {
  it("excludes no-reply and newsletter messages", () => {
    const noReply = normalizeMailMessage(rawMessage({
      sender: "Service <no-reply@example.com>",
      subject: "Weekly newsletter",
      content: "Unsubscribe here",
    }));
    expect(assessReplyNeed(noReply)).toMatchObject({
      likely: false,
      reason: "Excluded automated or no-reply sender.",
    });
  });

  it("keeps a human client question and preserves the reason", () => {
    const assessment = assessReplyNeed(normalizeMailMessage(rawMessage()));
    expect(assessment.likely).toBe(true);
    expect(assessment.reason).toContain("active thread");
    expect(assessment.reason).toContain("question");
  });

  it("returns only likely reply-needed messages", async () => {
    const logPath = await tempLogPath();
    const result = await readMailNeedsReply({ limit: 5 }, {
      executor: async () => ({
        messages: [
          rawMessage(),
          rawMessage({
            mailId: 102,
            sender: "News <newsletter@example.com>",
            subject: "Weekly digest",
            content: "Top stories. Unsubscribe.",
          }),
          rawMessage({
            mailId: 103,
            subject: "Already handled",
            replied: true,
            content: "Can you answer?",
          }),
        ],
      }),
      logPath,
    });
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].mailId).toBe(101);
    expect(result.messages[0].replyReason).toContain("Likely needs reply");
  });

  it("writes action logs without sender, subject, recipients, or body", async () => {
    const logPath = await tempLogPath();
    await readMailInbox({ limit: 1 }, {
      executor: async () => ({ messages: [rawMessage()] }),
      logPath,
    });
    const raw = await fs.readFile(logPath, "utf8");
    expect(raw).not.toContain("Client");
    expect(raw).not.toContain("Website project");
    expect(raw).not.toContain("confirm the deadline");
    expect(raw).not.toContain("you@example.com");
    expect(JSON.parse(raw.trim())).toMatchObject({
      action: "mail_inbox",
      readOnly: true,
      resultCount: 1,
      mailIds: [101],
    });
  });
});
