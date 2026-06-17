import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  assessReplyNeed,
  normalizeInboxQuery,
  type InboxQuery,
  type MailMessage,
  readMailInbox,
  readMailNeedsReply,
} from "./mail.js";
import {
  isUrgentIMessage,
  type IMessageMessage,
  type IMessageQuery,
  readIMessageNeedsReply,
  readIMessageRecent,
} from "./imessage.js";
import {
  assessSocialReplyNeed,
  isUrgentSocial,
  type SocialChannelConfig,
  type SocialMessage,
  type SocialNeedsReply,
  type SocialQuery,
  readSocialNeedsReply,
  readSocialRecent,
} from "./social.js";
import { MESSENGER_CONFIG } from "./messenger.js";
import { INSTAGRAM_CONFIG } from "./instagram.js";
import { VIBER_CONFIG } from "./viber.js";

export type CommunicationsView = "today" | "attention" | "pending" | "reply" | "urgent";

export type CommunicationsQuery = {
  view?: CommunicationsView;
  limit?: number;
  unreadOnly?: boolean;
  recentDays?: number;
};

type SocialRecentReader = (query: SocialQuery) => Promise<{ messages: SocialMessage[] }>;
type SocialNeedsReplyReader = (query: SocialQuery) => Promise<{ messages: SocialNeedsReply[] }>;

export type CommunicationsReaders = {
  mailInbox: typeof readMailInbox;
  mailNeedsReply: typeof readMailNeedsReply;
  imessageRecent: typeof readIMessageRecent;
  imessageNeedsReply: typeof readIMessageNeedsReply;
  messengerRecent?: SocialRecentReader;
  messengerNeedsReply?: SocialNeedsReplyReader;
  instagramRecent?: SocialRecentReader;
  instagramNeedsReply?: SocialNeedsReplyReader;
  viberRecent?: SocialRecentReader;
  viberNeedsReply?: SocialNeedsReplyReader;
};

const SOCIAL_TIMEOUT = 30_000;

const CACHE_FILE = path.join(os.homedir(), ".dorothy-cache", "communications.json");
const CACHE_MAX_AGE_MS = 5 * 60 * 1000;

type BackgroundCommunicationsCache = {
  fetchedAt?: string;
  coverage?: Record<string, unknown>;
  intelligence?: {
    generatedAt?: string;
    total?: number;
    pendingCount?: number;
    highPriorityCount?: number;
    activeOtpCount?: number;
    byCategory?: Record<string, number>;
    byStatus?: Record<string, number>;
    pending?: MailMessage[];
  };
  mail?: MailMessage[];
};

function normalizeCachedMail(message: MailMessage & { read?: boolean }): MailMessage {
  return {
    ...message,
    unread: typeof message.unread === "boolean" ? message.unread : message.read === false,
    contentIsUntrusted: true,
  };
}

function tryReadCommunicationsCache(): BackgroundCommunicationsCache | null {
  try {
    const stat = fs.statSync(CACHE_FILE);
    if (Date.now() - stat.mtimeMs > CACHE_MAX_AGE_MS) return null;
    const data = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
    if (!data.mail || !Array.isArray(data.mail)) return null;
    return {
      ...data,
      mail: data.mail.map(normalizeCachedMail),
    } as BackgroundCommunicationsCache;
  } catch {
    return null;
  }
}

function cachedMailInbox(query?: InboxQuery, _options?: unknown) {
  const cache = tryReadCommunicationsCache();
  if (cache?.mail) {
    const q = normalizeInboxQuery(query);
    const filtered = cache.mail
      .filter((m) => !q.unreadOnly || m.unread)
      .slice(0, q.limit);
    return Promise.resolve({ query: q, messages: filtered });
  }
  return readMailInbox(query, { timeoutMs: 60_000 });
}

function cachedMailNeedsReply(query?: InboxQuery, _options?: unknown) {
  const cache = tryReadCommunicationsCache();
  if (cache?.mail) {
    const q = normalizeInboxQuery(query);
    const requestedLimit = q.limit;
    const limited = cache.mail.slice(0, Math.min(50, Math.max(requestedLimit, requestedLimit * 3)));
    const messages = limited
      .filter((m) => assessReplyNeed(m).likely)
      .slice(0, requestedLimit)
      .map((m) => ({ ...m, replyReason: assessReplyNeed(m).reason }));
    return Promise.resolve({ query: q, messages });
  }
  return readMailNeedsReply(query, { timeoutMs: 60_000 });
}

const defaultReaders: CommunicationsReaders = {
  mailInbox: cachedMailInbox,
  mailNeedsReply: cachedMailNeedsReply,
  imessageRecent: readIMessageRecent,
  imessageNeedsReply: readIMessageNeedsReply,
  messengerRecent: (query) => readSocialRecent(MESSENGER_CONFIG, query, { timeoutMs: SOCIAL_TIMEOUT }),
  messengerNeedsReply: (query) => readSocialNeedsReply(MESSENGER_CONFIG, query, { timeoutMs: SOCIAL_TIMEOUT }),
  instagramRecent: (query) => readSocialRecent(INSTAGRAM_CONFIG, query, { timeoutMs: SOCIAL_TIMEOUT }),
  instagramNeedsReply: (query) => readSocialNeedsReply(INSTAGRAM_CONFIG, query, { timeoutMs: SOCIAL_TIMEOUT }),
  viberRecent: (query) => readSocialRecent(VIBER_CONFIG, query, { timeoutMs: SOCIAL_TIMEOUT }),
  viberNeedsReply: (query) => readSocialNeedsReply(VIBER_CONFIG, query, { timeoutMs: SOCIAL_TIMEOUT }),
};

function channelError(reason: unknown) {
  const message = reason instanceof Error ? reason.message : String(reason);
  if (/timed? ?out|SIGTERM|osascript/i.test(message)) {
    return "A local communication channel timed out. Check macOS privacy permissions.";
  }
  if (/login|net::|navigation|Target closed|browser/i.test(message)) {
    return "A browser channel could not be read. Its session may need re-login.";
  }
  return "The local communication channel could not be read.";
}

function clampLimit(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) return 20;
  return Math.max(1, Math.min(50, Math.floor(value)));
}

export function isUrgentMail(message: MailMessage) {
  return message.flagged || /\b(urgent|asap|emergency|today|deadline|payment|invoice|overdue|final notice)\b|επείγον|άμεσα|σήμερα|προθεσμία|πληρωμή|τιμολόγιο/i
    .test(`${message.subject}\n${message.excerpt}`);
}

type ChannelOutcome<T> = {
  available: boolean;
  messages: T[];
  error?: string;
};

async function runChannel<T>(reader: (() => Promise<T[]>) | undefined): Promise<ChannelOutcome<T>> {
  if (!reader) return { available: false, messages: [], error: "Channel not configured." };
  try {
    return { available: true, messages: await reader() };
  } catch (reason) {
    return { available: false, messages: [], error: channelError(reason) };
  }
}

function socialChannelReader(
  view: CommunicationsView,
  config: SocialChannelConfig,
  common: SocialQuery,
  recentReader: SocialRecentReader | undefined,
  needsReplyReader: SocialNeedsReplyReader | undefined,
): (() => Promise<SocialMessage[]>) | undefined {
  if (view === "reply") {
    if (!needsReplyReader) return undefined;
    return async () => (await needsReplyReader(common)).messages;
  }
  if (view === "pending") {
    if (!needsReplyReader) return undefined;
    return async () => (await needsReplyReader(common)).messages;
  }
  if (!recentReader) return undefined;
  const query = view === "today" ? { ...common, recentDays: 1 } : common;
  return async () => {
    const messages = (await recentReader(query)).messages;
    if (view === "urgent") return messages.filter(isUrgentSocial);
    if (view === "attention") {
      return messages.filter((message) => (
        message.unread || isUrgentSocial(message) || assessSocialReplyNeed(config, message).likely
      ));
    }
    return messages;
  };
}

export async function readCommunications(
  query: CommunicationsQuery = {},
  readers: CommunicationsReaders = defaultReaders,
) {
  const view = query.view ?? "today";
  const limit = clampLimit(query.limit);
  const recentDays = view === "today" ? 1 : Math.max(1, Math.min(90, Math.floor(query.recentDays ?? 7)));
  const common: InboxQuery & IMessageQuery & SocialQuery = {
    limit,
    unreadOnly: query.unreadOnly,
    recentDays,
  };

  // Mail and iMessage keep their richer per-message shapes and existing view
  // semantics; the three social channels share the SocialMessage shape.
  const mailReader = view === "reply"
    ? async () => (await readers.mailNeedsReply(common)).messages
    : async () => {
      let mail = (await readers.mailInbox(common)).messages;
      if (view === "urgent") mail = mail.filter(isUrgentMail);
      else if (view === "pending") {
        mail = mail.filter((message) => {
          const intelligence = (message as MailMessage & {
            intelligence?: { status?: string };
          }).intelligence;
          return intelligence ? intelligence.status === "pending" : assessReplyNeed(message).likely;
        });
      }
      else if (view === "attention") {
        mail = mail.filter((message) => (
          message.unread || message.flagged || isUrgentMail(message) || assessReplyNeed(message).likely
        ));
      }
      return mail;
    };

  const imessageReader = view === "reply" || view === "pending"
    ? async () => (await readers.imessageNeedsReply(common)).messages
    : async () => {
      let imessage = (await readers.imessageRecent(common)).messages;
      if (view === "urgent") imessage = imessage.filter(isUrgentIMessage);
      else if (view === "attention") {
        const latestByChat = new Set<number>();
        imessage = imessage.filter((message) => {
          const latest = !latestByChat.has(message.chatId);
          latestByChat.add(message.chatId);
          return message.unread || isUrgentIMessage(message) || (latest && !message.fromMe);
        });
      }
      return imessage;
    };

  const [mail, imessage, messenger, instagram, viber] = await Promise.all([
    runChannel<MailMessage>(mailReader),
    runChannel<IMessageMessage>(imessageReader),
    runChannel<SocialMessage>(socialChannelReader(view, MESSENGER_CONFIG, common, readers.messengerRecent, readers.messengerNeedsReply)),
    runChannel<SocialMessage>(socialChannelReader(view, INSTAGRAM_CONFIG, common, readers.instagramRecent, readers.instagramNeedsReply)),
    runChannel<SocialMessage>(
      socialChannelReader(view, VIBER_CONFIG, common, readers.viberRecent, readers.viberNeedsReply),
    ),
  ]);

  const channel = (outcome: ChannelOutcome<unknown>) => (
    outcome.available
      ? { available: true as const }
      : { available: false as const, error: outcome.error ?? "Unavailable." }
  );

  const counts = {
    mail: mail.messages.length,
    imessage: imessage.messages.length,
    messenger: messenger.messages.length,
    instagram: instagram.messages.length,
    viber: viber.messages.length,
    total: mail.messages.length + imessage.messages.length + messenger.messages.length
      + instagram.messages.length + viber.messages.length,
  };
  const backgroundCache = tryReadCommunicationsCache();

  return {
    readOnly: true,
    view,
    channels: {
      mail: channel(mail),
      imessage: channel(imessage),
      messenger: channel(messenger),
      instagram: channel(instagram),
      viber: channel(viber),
    },
    mail: mail.messages,
    imessage: imessage.messages,
    messenger: messenger.messages,
    instagram: instagram.messages,
    viber: viber.messages,
    counts,
    background: backgroundCache
      ? {
        available: true,
        fetchedAt: backgroundCache.fetchedAt ?? null,
        coverage: backgroundCache.coverage ?? null,
        intelligence: backgroundCache.intelligence ?? null,
      }
      : {
        available: false,
      },
  };
}
