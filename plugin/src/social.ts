import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getChannelPage } from "./browser.js";

// Shared read-only engine for browser-backed direct-message channels (Messenger,
// Instagram). Each channel only reads its conversation list — names, the latest
// message preview, unread state, and a relative timestamp. It never opens a
// thread, sends, reacts, or marks anything read.

export const SOCIAL_LIMIT_MAX = 50;
export const SOCIAL_RECENT_DAYS_MAX = 90;
export const SOCIAL_EXCERPT_MAX = 1_200;
export const SOCIAL_TIMEOUT_MS = 30_000;
export const SOCIAL_LOG_DIR = path.join(os.homedir(), ".openclaw", "logs");

export type SocialChannel = "messenger" | "instagram" | "viber";

export type SocialMessage = {
  channel: SocialChannel;
  conversationId: string;
  conversation: string;
  sender: string;
  excerpt: string;
  when: string;
  ageMinutes: number | null;
  unread: boolean;
  fromMe: boolean;
  contentIsUntrusted: true;
};

export type SocialNeedsReply = SocialMessage & { replyReason: string };

export type SocialQuery = {
  limit?: number;
  unreadOnly?: boolean;
  recentDays?: number;
  excerptChars?: number;
};

export type RawSocialRow = { id?: string; lines: string[] };

export type SocialChannelConfig = {
  channel: SocialChannel;
  host: string;
  url: string;
  // Runs in the browser via page.evaluate; must be self-contained.
  extract: () => RawSocialRow[];
  readySelector?: string;
  settleMs: number;
  unreadMarker: RegExp;
  unreadTrailing?: RegExp;
  fromMePrefix: RegExp;
  automatedConversation: RegExp;
  logPath: string;
};

export type SocialExecutor = (config: SocialChannelConfig, timeoutMs: number) => Promise<RawSocialRow[]>;

function clampInteger(value: number | undefined, fallback: number, min: number, max: number) {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function cleanText(value: unknown) {
  return String(value ?? "")
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .trim();
}

export function clipSocialExcerpt(value: unknown, maxChars = 600) {
  const limit = clampInteger(maxChars, 600, 100, SOCIAL_EXCERPT_MAX);
  const text = cleanText(value);
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(1, limit - 1)).trimEnd()}…`;
}

export function normalizeSocialQuery(query: SocialQuery = {}) {
  return {
    limit: clampInteger(query.limit, 20, 1, SOCIAL_LIMIT_MAX),
    unreadOnly: query.unreadOnly === true,
    recentDays: clampInteger(query.recentDays, 7, 1, SOCIAL_RECENT_DAYS_MAX),
    excerptChars: clampInteger(query.excerptChars, 600, 100, SOCIAL_EXCERPT_MAX),
  };
}

// Parse a relative "time ago" label (e.g. "10 ώρ.", "2h", "1d", "now") into an
// approximate age in minutes. Returns null when the label can't be understood
// (callers treat null as "keep" rather than dropping a message).
export function parseRelativeAgeMinutes(when: string): number | null {
  const s = cleanText(when).toLowerCase();
  if (!s) return null;
  if (/^(now|τώρα|μόλις)/.test(s)) return 0;
  const match = s.match(/(\d+)\s*([a-zα-ωά-ώ]+)/);
  if (!match) return null;
  const n = Number(match[1]);
  const unit = match[2];
  if (unit.startsWith("λ") || unit === "m" || unit.startsWith("min")) return n;
  if (unit.startsWith("ώ") || unit.startsWith("ωρ") || unit === "h") return n * 60;
  if (unit.startsWith("ημ") || unit === "d") return n * 1440;
  if (unit.startsWith("εβ") || unit === "w") return n * 10080;
  if (unit.startsWith("μήν") || unit.startsWith("μη") || unit === "mo") return n * 43200;
  if (unit.startsWith("χρ") || unit === "y") return n * 525600;
  return null;
}

export function parseSocialRow(config: SocialChannelConfig, raw: RawSocialRow, excerptChars: number): SocialMessage {
  const allLines = (raw.lines || []).map(cleanText).filter(Boolean);
  let unread = false;
  const kept: string[] = [];
  for (const line of allLines) {
    if (config.unreadMarker.test(line)) { unread = true; continue; }
    kept.push(line);
  }
  if (config.unreadTrailing && kept.length > 0 && config.unreadTrailing.test(kept[kept.length - 1])) {
    unread = true;
    kept.pop();
  }
  const conversation = kept[0] || "(unknown conversation)";
  const sepIdx = kept.lastIndexOf("·");
  let when = "";
  let bodyLines: string[];
  if (sepIdx >= 1) {
    when = kept.slice(sepIdx + 1).join(" ");
    bodyLines = kept.slice(1, sepIdx);
  } else {
    bodyLines = kept.slice(1);
  }
  let preview = bodyLines.join(" ").trim();
  const fromMe = config.fromMePrefix.test(preview);
  let sender = conversation;
  const senderMatch = preview.match(/^([^:]{1,40}):\s+([\s\S]*)$/);
  if (senderMatch) {
    sender = senderMatch[1].trim();
    preview = senderMatch[2].trim();
  }
  if (fromMe) sender = "Me";
  return {
    channel: config.channel,
    conversationId: raw.id || `${config.channel}:${conversation}`,
    conversation,
    sender,
    excerpt: clipSocialExcerpt(preview, excerptChars),
    when,
    ageMinutes: parseRelativeAgeMinutes(when),
    unread,
    fromMe,
    contentIsUntrusted: true,
  };
}

async function defaultSocialExecutor(config: SocialChannelConfig, timeoutMs: number): Promise<RawSocialRow[]> {
  const page = await getChannelPage(config.host);
  await page.goto(config.url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
  if (config.readySelector) {
    await page.waitForSelector(config.readySelector, { timeout: Math.min(timeoutMs, 20_000) }).catch(() => {});
  }
  await page.waitForTimeout(config.settleMs);
  const rows = await page.evaluate(config.extract);
  return Array.isArray(rows) ? rows : [];
}

async function appendSocialActionLog(
  logPath: string,
  action: string,
  details: Record<string, unknown>,
) {
  await fs.mkdir(path.dirname(logPath), { recursive: true });
  await fs.appendFile(logPath, `${JSON.stringify({
    timestamp: new Date().toISOString(),
    action,
    readOnly: true,
    ...details,
  })}\n`, "utf8");
}

export async function readSocialRecent(
  config: SocialChannelConfig,
  query: SocialQuery = {},
  options: { executor?: SocialExecutor; timeoutMs?: number } = {},
) {
  const normalized = normalizeSocialQuery(query);
  const executor = options.executor ?? defaultSocialExecutor;
  const raw = await executor(config, options.timeoutMs ?? SOCIAL_TIMEOUT_MS);
  const maxAge = normalized.recentDays * 1440;
  const messages = raw
    .map((row) => parseSocialRow(config, row, normalized.excerptChars))
    .filter((message) => message.excerpt || message.unread)
    .filter((message) => message.ageMinutes === null || message.ageMinutes <= maxAge)
    .filter((message) => !normalized.unreadOnly || message.unread)
    .slice(0, normalized.limit);
  await appendSocialActionLog(config.logPath, `${config.channel}_recent`, {
    filters: { limit: normalized.limit, unreadOnly: normalized.unreadOnly, recentDays: normalized.recentDays },
    resultCount: messages.length,
  });
  return { query: normalized, messages };
}

const REACTION_PATTERNS = [
  /^(αγάπησα|σου αρέσει|του άρεσε|της άρεσε|αντέδρασε|γέλασε)/i,
  /^(liked|loved|reacted|laughed at|emphasized)\b/i,
];

export function assessSocialReplyNeed(
  config: SocialChannelConfig,
  message: SocialMessage,
): { likely: boolean; reason: string } {
  if (message.fromMe) return { likely: false, reason: "The latest message was sent by the user." };
  if (config.automatedConversation.test(message.conversation)) {
    return { likely: false, reason: "Excluded automated business/notification conversation." };
  }
  if (REACTION_PATTERNS.some((pattern) => pattern.test(message.excerpt))) {
    return { likely: false, reason: "Excluded reaction-only update." };
  }
  // Greek text does not respect ASCII \b word boundaries, so we avoid \b here.
  // Greek uses ";" as its question mark.
  const directRequest = /[?？;]\s*$|(can you|could you|please|let me know|call me|reply|confirm|μπορείς|μπορείτε|θα μπορούσες|πες μου|πάρε με|απάντησ|επιβεβαίωσ|που εισαι|πού είσαι)/i
    .test(message.excerpt);
  if (directRequest) {
    return { likely: true, reason: "Latest incoming message contains a question or direct request." };
  }
  if (message.unread) {
    return { likely: true, reason: "Latest incoming message is unread with no later reply from the user." };
  }
  return { likely: false, reason: "No strong reply-needed signal (read, no question)." };
}

export function isUrgentSocial(message: SocialMessage) {
  return /\b(urgent|asap|emergency|today|deadline|payment|invoice|overdue|call me)\b|επείγον|άμεσα|σήμερα|προθεσμία|πληρωμή|τιμολόγιο|πάρε με/i
    .test(message.excerpt);
}

export async function readSocialNeedsReply(
  config: SocialChannelConfig,
  query: SocialQuery = {},
  options: { executor?: SocialExecutor; timeoutMs?: number } = {},
) {
  const requestedLimit = clampInteger(query.limit, 20, 1, SOCIAL_LIMIT_MAX);
  const recent = await readSocialRecent(config, { ...query, limit: SOCIAL_LIMIT_MAX }, options);
  const messages: SocialNeedsReply[] = [];
  for (const message of recent.messages) {
    const assessment = assessSocialReplyNeed(config, message);
    if (!assessment.likely) continue;
    messages.push({ ...message, replyReason: assessment.reason });
    if (messages.length >= requestedLimit) break;
  }
  await appendSocialActionLog(config.logPath, `${config.channel}_needs_reply`, {
    requestedLimit,
    scannedCount: recent.messages.length,
    resultCount: messages.length,
  });
  return { query: { ...recent.query, limit: requestedLimit }, messages };
}
