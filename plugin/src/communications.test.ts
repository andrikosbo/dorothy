import { describe, expect, it } from "vitest";
import { readCommunications, type CommunicationsReaders } from "./communications.js";

const mail = {
  mailId: 1,
  messageId: "mail-1",
  account: "iCloud",
  accountAddresses: ["user@example.com"],
  sender: "Client <client@example.com>",
  to: ["user@example.com"],
  cc: [],
  subject: "Urgent payment",
  receivedAt: "2026-06-07T09:00:00.000Z",
  unread: true,
  flagged: false,
  replied: false,
  excerpt: "Can you confirm payment today?",
  contentIsUntrusted: true as const,
};

const imessage = {
  messageId: 2,
  guid: "message-2",
  chatId: 3,
  conversation: "George",
  sender: "George",
  participants: ["George"],
  service: "iMessage",
  sentAt: "2026-06-07T10:00:00.000Z",
  fromMe: false,
  unread: true,
  excerpt: "Please call me today",
  contentIsUntrusted: true as const,
};

const social = {
  channel: "messenger" as const,
  conversationId: "m1",
  conversation: "Ίδρυμα",
  sender: "Χριστόφας",
  excerpt: "Που εισαι;",
  when: "10 ώρ.",
  ageMinutes: 600,
  unread: true,
  fromMe: false,
  contentIsUntrusted: true as const,
};

function readers(): CommunicationsReaders {
  return {
    mailInbox: async () => ({ query: {}, messages: [mail] }) as never,
    mailNeedsReply: async () => ({
      query: {},
      messages: [{ ...mail, replyReason: "Question" }],
    }) as never,
    imessageRecent: async () => ({ query: {}, chats: [], messages: [imessage] }) as never,
    imessageNeedsReply: async () => ({
      query: {},
      messages: [{ ...imessage, replyReason: "Latest incoming" }],
    }) as never,
    messengerRecent: async () => ({ messages: [social] }),
    messengerNeedsReply: async () => ({ messages: [{ ...social, replyReason: "Question" }] }),
    instagramRecent: async () => ({ messages: [{ ...social, channel: "instagram", conversation: "Τάνια" }] }),
    instagramNeedsReply: async () => ({
      messages: [{ ...social, channel: "instagram", conversation: "Τάνια", replyReason: "Unread" }],
    }),
  };
}

describe("unified communications", () => {
  it("combines today's results across Mail, iMessage, Messenger and Instagram", async () => {
    const result = await readCommunications({ view: "today" }, readers());
    expect(result).toMatchObject({
      readOnly: true,
      view: "today",
      counts: { mail: 1, imessage: 1, messenger: 1, instagram: 1, viber: 0, total: 4 },
    });
  });

  it("combines reply-needed results with reasons intact", async () => {
    const result = await readCommunications({ view: "reply" }, readers());
    expect(result.mail[0]).toMatchObject({ replyReason: "Question" });
    expect(result.imessage[0]).toMatchObject({ replyReason: "Latest incoming" });
    expect(result.messenger[0]).toMatchObject({ replyReason: "Question" });
    expect(result.instagram[0]).toMatchObject({ replyReason: "Unread" });
  });

  it("supports a pending view across channels", async () => {
    const result = await readCommunications({ view: "pending" }, readers());
    expect(result.mail).toHaveLength(1);
    expect(result.imessage).toHaveLength(1);
    expect(result.messenger).toHaveLength(1);
  });

  it("filters urgent items across channels", async () => {
    const result = await readCommunications({ view: "urgent" }, readers());
    // Mail "Urgent payment" and iMessage "call me today" are urgent; the social
    // previews are not, so they drop out of the urgent view.
    expect(result.counts).toEqual({
      mail: 1, imessage: 1, messenger: 0, instagram: 0, viber: 0, total: 2,
    });
  });

  it("surfaces unread social messages in the attention view", async () => {
    const result = await readCommunications({ view: "attention" }, readers());
    expect(result.counts.messenger).toBe(1);
    expect(result.counts.instagram).toBe(1);
  });

  it("reports Viber unavailable when no reader is configured", async () => {
    const result = await readCommunications({ view: "today" }, readers());
    expect(result.channels.viber).toMatchObject({ available: false });
    expect(result.viber).toEqual([]);
  });

  it("keeps other channels when Mail.app is unavailable", async () => {
    const failing = readers();
    failing.mailInbox = async () => {
      throw new Error("osascript timed out");
    };
    const result = await readCommunications({ view: "today" }, failing);
    expect(result.channels).toMatchObject({
      mail: { available: false },
      imessage: { available: true },
      messenger: { available: true },
    });
    expect(result.mail).toEqual([]);
    expect(result.imessage).toHaveLength(1);
    expect(result.messenger).toHaveLength(1);
  });
});
