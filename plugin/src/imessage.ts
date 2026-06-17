import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const IMESSAGE_LIMIT_MAX = 50;
export const IMESSAGE_CHAT_LIMIT_MAX = 20;
export const IMESSAGE_RECENT_DAYS_MAX = 90;
export const IMESSAGE_EXCERPT_MAX = 1_200;
export const IMESSAGE_TIMEOUT_MS = 15_000;
export const IMESSAGE_ACTION_LOG_PATH = path.join(
  os.homedir(),
  ".openclaw",
  "logs",
  "dorothy-imessage-actions.jsonl",
);

export type IMessageChat = {
  chatId: number;
  name: string;
  identifier: string;
  service: string;
  participants: string[];
  lastMessageAt: string;
  isGroup: boolean;
};

export type IMessageMessage = {
  messageId: number;
  guid: string;
  chatId: number;
  conversation: string;
  sender: string;
  participants: string[];
  service: string;
  sentAt: string;
  fromMe: boolean;
  unread: boolean;
  excerpt: string;
  contentIsUntrusted: true;
};

export type IMessageQuery = {
  limit?: number;
  chatLimit?: number;
  unreadOnly?: boolean;
  recentDays?: number;
  excerptChars?: number;
};

export type IMessageNeedsReply = IMessageMessage & {
  replyReason: string;
};

type RawRecord = Record<string, unknown>;

type IMessageOperation =
  | { operation: "chats"; limit: number }
  | { operation: "history"; chatId: number; limit: number; start: string }
  | { operation: "unreadIds"; chatIds: number[]; limit: number };

export type IMessageExecutor = (
  operation: IMessageOperation,
  timeoutMs: number,
) => Promise<unknown>;

function clampInteger(value: number | undefined, fallback: number, min: number, max: number) {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function cleanText(value: unknown) {
  return String(value ?? "")
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanList(value: unknown) {
  return Array.isArray(value) ? value.map(cleanText).filter(Boolean) : [];
}

function positiveInteger(value: unknown, field: string) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    throw new Error(`iMessage returned an invalid ${field}`);
  }
  return number;
}

export function clipIMessageExcerpt(value: unknown, maxChars = 600) {
  const limit = clampInteger(maxChars, 600, 100, IMESSAGE_EXCERPT_MAX);
  const text = cleanText(value);
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(1, limit - 1)).trimEnd()}…`;
}

export function parseIMessageJsonLines(output: string): RawRecord[] {
  const trimmed = output.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) return parsed.filter(isRecord);
    if (isRecord(parsed)) {
      const nested = parsed.chats ?? parsed.messages ?? parsed.rows;
      if (Array.isArray(nested)) return nested.filter(isRecord);
      return [parsed];
    }
  } catch {
    // imsg --json emits JSONL, so parse each line below.
  }
  return trimmed
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as unknown)
    .filter(isRecord);
}

function isRecord(value: unknown): value is RawRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function normalizeIMessageChat(raw: RawRecord): IMessageChat {
  const chatId = positiveInteger(raw.id ?? raw.chat_id ?? raw.chatId, "chat id");
  const identifier = cleanText(raw.identifier ?? raw.chat_identifier);
  return {
    chatId,
    name: cleanText(raw.name ?? raw.display_name ?? raw.contact_name) || identifier || `Chat ${chatId}`,
    identifier,
    service: cleanText(raw.service ?? raw.service_name) || "iMessage/SMS",
    participants: cleanList(raw.participants),
    lastMessageAt: cleanText(raw.last_message_at),
    isGroup: raw.is_group === true,
  };
}

export function normalizeIMessageMessage(
  raw: RawRecord,
  chat: IMessageChat,
  unreadIds: ReadonlySet<number>,
  excerptChars = 600,
): IMessageMessage {
  const messageId = positiveInteger(raw.id ?? raw.message_id ?? raw.messageId, "message id");
  const chatId = positiveInteger(raw.chat_id ?? chat.chatId, "chat id");
  return {
    messageId,
    guid: cleanText(raw.guid),
    chatId,
    conversation: cleanText(raw.chat_name) || chat.name,
    sender: raw.is_from_me === true ? "Me" : cleanText(raw.sender_name ?? raw.sender) || chat.identifier,
    participants: cleanList(raw.participants).length > 0 ? cleanList(raw.participants) : chat.participants,
    service: chat.service,
    sentAt: cleanText(raw.created_at ?? raw.date),
    fromMe: raw.is_from_me === true,
    unread: raw.is_from_me !== true && unreadIds.has(messageId),
    excerpt: clipIMessageExcerpt(raw.text ?? raw.body ?? raw.content, excerptChars),
    contentIsUntrusted: true,
  };
}

export function normalizeIMessageQuery(query: IMessageQuery = {}) {
  return {
    limit: clampInteger(query.limit, 20, 1, IMESSAGE_LIMIT_MAX),
    chatLimit: clampInteger(query.chatLimit, 12, 1, IMESSAGE_CHAT_LIMIT_MAX),
    unreadOnly: query.unreadOnly === true,
    recentDays: clampInteger(query.recentDays, 7, 1, IMESSAGE_RECENT_DAYS_MAX),
    excerptChars: clampInteger(query.excerptChars, 600, 100, IMESSAGE_EXCERPT_MAX),
  };
}

async function defaultIMessageExecutor(operation: IMessageOperation, timeoutMs: number): Promise<unknown> {
  if (operation.operation === "chats") {
    const { stdout } = await execFileAsync("/opt/homebrew/bin/imsg", [
      "chats",
      "--limit",
      String(operation.limit),
      "--json",
    ], { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 });
    return parseIMessageJsonLines(stdout);
  }

  if (operation.operation === "history") {
    const { stdout } = await execFileAsync("/opt/homebrew/bin/imsg", [
      "history",
      "--chat-id",
      String(operation.chatId),
      "--limit",
      String(operation.limit),
      "--start",
      operation.start,
      "--json",
    ], { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 });
    return parseIMessageJsonLines(stdout);
  }

  if (operation.chatIds.length === 0) return [];
  const ids = operation.chatIds.map((id) => positiveInteger(id, "chat id")).join(",");
  const query = `
SELECT m.ROWID AS id
FROM message AS m
JOIN chat_message_join AS cmj ON cmj.message_id = m.ROWID
WHERE m.is_from_me = 0
  AND COALESCE(m.is_read, 0) = 0
  AND cmj.chat_id IN (${ids})
ORDER BY m.ROWID DESC
LIMIT ${positiveInteger(operation.limit, "unread limit")};
`;
  const dbPath = path.join(os.homedir(), "Library", "Messages", "chat.db");
  const { stdout } = await execFileAsync("/usr/bin/sqlite3", [
    "-readonly",
    "-json",
    dbPath,
    query,
  ], { timeout: timeoutMs, maxBuffer: 1024 * 1024 });
  return parseIMessageJsonLines(stdout);
}

async function appendIMessageActionLog(
  action: string,
  details: Record<string, unknown>,
  logPath = IMESSAGE_ACTION_LOG_PATH,
) {
  await fs.mkdir(path.dirname(logPath), { recursive: true });
  await fs.appendFile(logPath, `${JSON.stringify({
    timestamp: new Date().toISOString(),
    action,
    readOnly: true,
    ...details,
  })}\n`, "utf8");
}

function rows(value: unknown, key?: "chats" | "messages" | "rows"): RawRecord[] {
  if (Array.isArray(value)) return value.filter(isRecord);
  if (key && isRecord(value) && Array.isArray(value[key])) return value[key].filter(isRecord);
  return [];
}

export async function readIMessageRecent(query: IMessageQuery = {}, options: {
  executor?: IMessageExecutor;
  timeoutMs?: number;
  logPath?: string;
} = {}) {
  const normalized = normalizeIMessageQuery(query);
  const executor = options.executor ?? defaultIMessageExecutor;
  const timeoutMs = options.timeoutMs ?? IMESSAGE_TIMEOUT_MS;
  const chatRows = rows(
    await executor({ operation: "chats", limit: normalized.chatLimit }, timeoutMs),
    "chats",
  );
  const chats = chatRows.map(normalizeIMessageChat);
  const start = new Date(Date.now() - normalized.recentDays * 86_400_000).toISOString();
  const perChatLimit = Math.min(IMESSAGE_LIMIT_MAX, Math.max(5, normalized.limit));
  const [histories, unreadRows] = await Promise.all([
    Promise.all(chats.map(async (chat) => ({
      chat,
      messages: rows(await executor({
        operation: "history",
        chatId: chat.chatId,
        limit: perChatLimit,
        start,
      }, timeoutMs), "messages"),
    }))),
    executor({
      operation: "unreadIds",
      chatIds: chats.map((chat) => chat.chatId),
      limit: IMESSAGE_LIMIT_MAX * 4,
    }, timeoutMs),
  ]);
  const unreadIds = new Set(rows(unreadRows, "rows").map((row) => Number(row.id)).filter(Number.isInteger));
  const messages = histories
    .flatMap(({ chat, messages: rawMessages }) => rawMessages.map((message) => (
      normalizeIMessageMessage(message, chat, unreadIds, normalized.excerptChars)
    )))
    .filter((message) => message.excerpt)
    .filter((message) => !normalized.unreadOnly || message.unread)
    .sort((left, right) => right.sentAt.localeCompare(left.sentAt))
    .slice(0, normalized.limit);

  await appendIMessageActionLog("imessage_recent", {
    filters: {
      limit: normalized.limit,
      chatLimit: normalized.chatLimit,
      unreadOnly: normalized.unreadOnly,
      recentDays: normalized.recentDays,
    },
    chatCount: chats.length,
    resultCount: messages.length,
  }, options.logPath);
  return { query: normalized, chats, messages };
}

const LOW_VALUE_PATTERNS = [
  /^(liked|loved|laughed at|emphasized|questioned|disliked)\b/i,
  /\bverification code\b/i,
  /\bone[- ]time (?:code|password)\b/i,
  /\bdelivery update\b/i,
  /\bappointment reminder\b/i,
  /κωδικ(?:ός|ό|οί|ού)\s*(?:μιας\s*χρήσης|επιβεβαίωσης|πρόσβασης|ασφαλείας)/i,
  /^\s*\d{4,10}\s*$/,
];

const LOW_VALUE_SENDER_PATTERNS = [
  /\b(eurobank|alpha\s*bank|piraeus|nbg|ethniki\s*trapeza|viva\s*wallet|revolut)\b/i,
  /\b(idika|efka|aade|gov\.gr|deh|cosmote|vodafone|wind|nova)\b/i,
];

export function assessIMessageReplyNeed(
  message: IMessageMessage,
  latestInConversation = true,
): { likely: boolean; reason: string } {
  if (message.fromMe) return { likely: false, reason: "The message was sent by the user." };
  if (!latestInConversation) return { likely: false, reason: "A newer message exists in this conversation." };
  if (LOW_VALUE_PATTERNS.some((pattern) => pattern.test(message.excerpt))) {
    return { likely: false, reason: "Excluded reaction, verification, delivery, or reminder noise." };
  }
  if (LOW_VALUE_SENDER_PATTERNS.some((pattern) => pattern.test(message.sender))) {
    return { likely: false, reason: "Excluded automated sender (bank, government, telecom)." };
  }
  const directRequest = /[?？]\s*$|\b(can you|could you|please|let me know|call me|reply|confirm|μπορείς|μπορείτε|θα μπορούσες|πες μου|πάρε με|απάντησ|επιβεβαίωσ)/i.test(message.excerpt);
  if (directRequest) {
    return { likely: true, reason: "Latest incoming message contains a question or direct request." };
  }
  if (message.unread) {
    return { likely: true, reason: "Latest incoming message is unread and has no later outgoing reply." };
  }
  return { likely: true, reason: "Latest message in the conversation is incoming and has no later outgoing reply." };
}

export async function readIMessageNeedsReply(query: IMessageQuery = {}, options: {
  executor?: IMessageExecutor;
  timeoutMs?: number;
  logPath?: string;
} = {}) {
  const requestedLimit = clampInteger(query.limit, 20, 1, IMESSAGE_LIMIT_MAX);
  const recent = await readIMessageRecent({
    ...query,
    limit: IMESSAGE_LIMIT_MAX,
  }, options);
  const latestByChat = new Set<number>();
  const messages: IMessageNeedsReply[] = [];
  for (const message of recent.messages) {
    const latest = !latestByChat.has(message.chatId);
    latestByChat.add(message.chatId);
    const assessment = assessIMessageReplyNeed(message, latest);
    if (!assessment.likely) continue;
    messages.push({ ...message, replyReason: assessment.reason });
    if (messages.length >= requestedLimit) break;
  }
  await appendIMessageActionLog("imessage_needs_reply", {
    requestedLimit,
    scannedCount: recent.messages.length,
    resultCount: messages.length,
  }, options.logPath);
  return { query: { ...recent.query, limit: requestedLimit }, messages };
}

export function isUrgentIMessage(message: IMessageMessage) {
  return /\b(urgent|asap|emergency|today|deadline|payment|invoice|overdue|call me)\b|επείγον|άμεσα|σήμερα|προθεσμία|πληρωμή|τιμολόγιο|πάρε με/i
    .test(message.excerpt);
}
