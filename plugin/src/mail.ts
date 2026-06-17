import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const MAIL_LIMIT_MAX = 50;
export const MAIL_RECENT_DAYS_MAX = 90;
export const MAIL_EXCERPT_MAX = 1_200;
// Fetching a message body is the slowest Mail.app Apple Event (~0.5s each), so
// we only fetch bodies for the newest N selected messages. The rest still
// appear with sender/subject/date from the fast bulk reads.
export const MAIL_BODY_FETCH_MAX = 15;
export const MAIL_TIMEOUT_MS = 90_000;
export const MAIL_ACTION_LOG_PATH = path.join(os.homedir(), ".openclaw", "logs", "dorothy-mail-actions.jsonl");

export type MailAccount = {
  name: string;
  enabled: boolean;
  emailAddresses: string[];
  domains: string[];
};

export type MailMessage = {
  mailId: number;
  messageId: string;
  account: string;
  accountAddresses: string[];
  sender: string;
  to: string[];
  cc: string[];
  subject: string;
  receivedAt: string;
  unread: boolean;
  flagged: boolean;
  replied: boolean;
  excerpt: string;
  contentIsUntrusted: true;
};

export type InboxQuery = {
  limit?: number;
  unreadOnly?: boolean;
  accountOrDomain?: string;
  recentDays?: number;
  excerptChars?: number;
};

export type NeedsReplyMessage = MailMessage & {
  replyReason: string;
};

type RawMailAccount = {
  name?: unknown;
  enabled?: unknown;
  emailAddresses?: unknown;
};

type RawMailMessage = {
  mailId?: unknown;
  messageId?: unknown;
  account?: unknown;
  accountAddresses?: unknown;
  sender?: unknown;
  to?: unknown;
  cc?: unknown;
  subject?: unknown;
  receivedAt?: unknown;
  read?: unknown;
  flagged?: unknown;
  replied?: unknown;
  content?: unknown;
};

type MailOperation =
  | { operation: "accounts" }
  | {
    operation: "inbox";
    limit: number;
    unreadOnly: boolean;
    accountOrDomain: string;
    recentDays: number;
    excerptChars: number;
    bodyLimit: number;
  }
  | {
    operation: "message";
    mailId: number;
    accountOrDomain: string;
    excerptChars: number;
  }
  | {
    operation: "markRead";
    mailId: number;
    accountOrDomain: string;
    read: boolean;
  };

export type MailExecutor = (operation: MailOperation, timeoutMs: number) => Promise<unknown>;

export const MAIL_JXA_SCRIPT = String.raw`
function text(value) {
  if (value === null || value === undefined) return "";
  return String(value);
}
function addressList(recipients) {
  try {
    return recipients().map(function (recipient) {
      var address = text(recipient.address());
      var name = text(recipient.name());
      return name && address ? name + " <" + address + ">" : address || name;
    }).filter(Boolean);
  } catch (_) {
    return [];
  }
}
function accountMatches(account, filter) {
  if (!filter) return true;
  var needle = filter.toLowerCase().replace(/^@/, "");
  var name = text(account.name()).toLowerCase();
  var addresses = account.emailAddresses().map(function (item) { return text(item).toLowerCase(); });
  return name.includes(needle) || addresses.some(function (address) {
    return address === needle || address.endsWith("@" + needle) || address.includes(needle);
  });
}
function inboxFor(account) {
  var boxes = account.mailboxes.whose({ name: "INBOX" })();
  if (!boxes.length) boxes = account.mailboxes.whose({ name: "Inbox" })();
  return boxes.length ? boxes[0] : null;
}
function serializeMessage(message, account, excerptChars) {
  var received = message.dateReceived();
  var content = text(message.content()).replace(/\u0000/g, "").replace(/\r\n?/g, "\n");
  return {
    mailId: message.id(),
    messageId: text(message.messageId()),
    account: text(account.name()),
    accountAddresses: account.emailAddresses().map(text),
    sender: text(message.sender()),
    to: addressList(message.toRecipients),
    cc: addressList(message.ccRecipients),
    subject: text(message.subject()),
    receivedAt: received ? received.toISOString() : "",
    read: Boolean(message.readStatus()),
    flagged: Boolean(message.flaggedStatus()),
    replied: Boolean(message.wasRepliedTo()),
    content: content.slice(0, excerptChars)
  };
}
function run(argv) {
  var options = JSON.parse(argv[0]);
  var Mail = Application("Mail");
  var accounts = Mail.accounts();
  if (options.operation === "accounts") {
    return JSON.stringify(accounts.map(function (account) {
      return {
        name: text(account.name()),
        enabled: Boolean(account.enabled()),
        emailAddresses: account.emailAddresses().map(text)
      };
    }));
  }
  var matchingAccounts = accounts.filter(function (account) {
    return account.enabled() && accountMatches(account, options.accountOrDomain || "");
  });
  if (options.operation === "message") {
    for (var accountIndex = 0; accountIndex < matchingAccounts.length; accountIndex += 1) {
      var account = matchingAccounts[accountIndex];
      var inbox = inboxFor(account);
      if (!inbox) continue;
      var matches = inbox.messages.whose({ id: options.mailId })();
      if (matches.length) {
        return JSON.stringify({ message: serializeMessage(matches[0], account, options.excerptChars) });
      }
    }
    return JSON.stringify({ message: null });
  }
  if (options.operation === "markRead") {
    for (var markIndex = 0; markIndex < matchingAccounts.length; markIndex += 1) {
      var markAccount = matchingAccounts[markIndex];
      var markInbox = inboxFor(markAccount);
      if (!markInbox) continue;
      var markMatches = markInbox.messages.whose({ id: options.mailId })();
      if (markMatches.length) {
        markMatches[0].readStatus = options.read;
        return JSON.stringify({ ok: true, found: true });
      }
    }
    return JSON.stringify({ ok: true, found: false });
  }
  var cutoff = new Date(Date.now() - options.recentDays * 86400000).getTime();
  var perAccountCap = Math.max(1, Math.min(options.limit, 50));
  // Phase 1: read scalar properties for each inbox in one bulk Apple Event per
  // property (fast) and build lightweight candidates. The costly per-message
  // body and recipient reads are deferred to phase 2 so they only run for the
  // final merged top-N, not for every account.
  var candidates = [];
  for (var i = 0; i < matchingAccounts.length; i += 1) {
    var currentAccount = matchingAccounts[i];
    var currentInbox = inboxFor(currentAccount);
    if (!currentInbox) continue;
    var inboxMessages = currentInbox.messages;
    var dates, subjects, senders, reads, flags, replieds, ids, messageIds;
    try {
      dates = inboxMessages.dateReceived();
      subjects = inboxMessages.subject();
      senders = inboxMessages.sender();
      reads = inboxMessages.readStatus();
      flags = inboxMessages.flaggedStatus();
      replieds = inboxMessages.wasRepliedTo();
      ids = inboxMessages.id();
      messageIds = inboxMessages.messageId();
    } catch (_) {
      continue;
    }
    var accountName = text(currentAccount.name());
    var accountAddresses = currentAccount.emailAddresses().map(text);
    var kept = 0;
    for (var j = 0; j < dates.length; j += 1) {
      var received = dates[j];
      if (received && received.getTime() < cutoff) continue;
      if (options.unreadOnly && Boolean(reads[j])) continue;
      candidates.push({
        ref: inboxMessages[j],
        sortKey: received ? received.getTime() : 0,
        mailId: ids[j],
        messageId: text(messageIds[j]),
        account: accountName,
        accountAddresses: accountAddresses,
        sender: text(senders[j]),
        subject: text(subjects[j]),
        receivedAt: received ? received.toISOString() : "",
        read: Boolean(reads[j]),
        flagged: Boolean(flags[j]),
        replied: Boolean(replieds[j])
      });
      kept += 1;
      if (kept >= perAccountCap) break;
    }
  }
  candidates.sort(function (left, right) { return right.sortKey - left.sortKey; });
  var selected = candidates.slice(0, options.limit);
  var bodyLimit = options.bodyLimit > 0 ? options.bodyLimit : selected.length;
  // Phase 2: fetch the costly body/recipients only for the newest bodyLimit
  // selected messages. Remaining messages still return with sender/subject/date.
  var rows = selected.map(function (candidate, index) {
    var bodyText = "";
    var toRecipients = [];
    var ccRecipients = [];
    if (index < bodyLimit) {
      try { bodyText = text(candidate.ref.content()).replace(/\u0000/g, "").replace(/\r\n?/g, "\n").slice(0, options.excerptChars); } catch (_) {}
      try { toRecipients = addressList(candidate.ref.toRecipients); } catch (_) {}
      try { ccRecipients = addressList(candidate.ref.ccRecipients); } catch (_) {}
    }
    return {
      mailId: candidate.mailId,
      messageId: candidate.messageId,
      account: candidate.account,
      accountAddresses: candidate.accountAddresses,
      sender: candidate.sender,
      to: toRecipients,
      cc: ccRecipients,
      subject: candidate.subject,
      receivedAt: candidate.receivedAt,
      read: candidate.read,
      flagged: candidate.flagged,
      replied: candidate.replied,
      content: bodyText
    };
  });
  return JSON.stringify({ messages: rows });
}
`;

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

function cleanStringList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map(cleanText).filter(Boolean);
}

function domainOf(address: string) {
  const match = address.toLowerCase().match(/@([^>\s]+)>?$/);
  return match?.[1] || "";
}

export function normalizeMailAccount(raw: RawMailAccount): MailAccount {
  const emailAddresses = cleanStringList(raw.emailAddresses);
  return {
    name: cleanText(raw.name),
    enabled: raw.enabled === true,
    emailAddresses,
    domains: [...new Set(emailAddresses.map(domainOf).filter(Boolean))].sort(),
  };
}

export function clipMailExcerpt(value: unknown, maxChars = 600) {
  const limit = clampInteger(maxChars, 600, 100, MAIL_EXCERPT_MAX);
  const text = cleanText(value)
    .replace(/\[image\]/gi, "")
    .replace(/\n\s*unsubscribe\b[\s\S]*$/i, "")
    .trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(1, limit - 1)).trimEnd()}…`;
}

export function normalizeMailMessage(raw: RawMailMessage, excerptChars = 600): MailMessage {
  const mailId = Number(raw.mailId);
  if (!Number.isInteger(mailId) || mailId < 1) throw new Error("Mail.app returned an invalid message id");
  return {
    mailId,
    messageId: cleanText(raw.messageId),
    account: cleanText(raw.account),
    accountAddresses: cleanStringList(raw.accountAddresses),
    sender: cleanText(raw.sender),
    to: cleanStringList(raw.to),
    cc: cleanStringList(raw.cc),
    subject: cleanText(raw.subject) || "(no subject)",
    receivedAt: cleanText(raw.receivedAt),
    unread: raw.read !== true,
    flagged: raw.flagged === true,
    replied: raw.replied === true,
    excerpt: clipMailExcerpt(raw.content, excerptChars),
    contentIsUntrusted: true,
  };
}

export function normalizeInboxQuery(query: InboxQuery = {}) {
  const limit = clampInteger(query.limit, 20, 1, MAIL_LIMIT_MAX);
  return {
    limit,
    unreadOnly: query.unreadOnly === true,
    accountOrDomain: cleanText(query.accountOrDomain).toLowerCase().replace(/^@/, ""),
    recentDays: clampInteger(query.recentDays, 7, 1, MAIL_RECENT_DAYS_MAX),
    excerptChars: clampInteger(query.excerptChars, 600, 100, MAIL_EXCERPT_MAX),
    bodyLimit: Math.min(limit, MAIL_BODY_FETCH_MAX),
  };
}

function executeMailJxa(operation: MailOperation, timeoutMs: number): Promise<unknown> {
  return execFileAsync("osascript", [
    "-l",
    "JavaScript",
    "-e",
    MAIL_JXA_SCRIPT,
    JSON.stringify(operation),
  ], {
    timeout: timeoutMs,
    maxBuffer: 4 * 1024 * 1024,
  }).then(({ stdout }) => JSON.parse(stdout.trim() || "{}"));
}

// A single osascript call lets the JXA script iterate every enabled account in
// one Apple Event session. Spawning one osascript per account in parallel makes
// them contend for Mail.app's single-threaded Apple Event queue and blow the
// timeout, so we never fan out here.
function defaultMailExecutor(operation: MailOperation, timeoutMs: number): Promise<unknown> {
  return executeMailJxa(operation, timeoutMs);
}

async function appendMailActionLog(
  action: string,
  details: Record<string, unknown>,
  logPath = MAIL_ACTION_LOG_PATH,
) {
  const record = {
    timestamp: new Date().toISOString(),
    action,
    readOnly: true,
    ...details,
  };
  await fs.mkdir(path.dirname(logPath), { recursive: true });
  await fs.appendFile(logPath, `${JSON.stringify(record)}\n`, "utf8");
}

export async function listMailAccounts(options: {
  executor?: MailExecutor;
  timeoutMs?: number;
  logPath?: string;
} = {}) {
  const executor = options.executor ?? defaultMailExecutor;
  const raw = await executor({ operation: "accounts" }, options.timeoutMs ?? MAIL_TIMEOUT_MS) as RawMailAccount[];
  const accounts = raw.map(normalizeMailAccount);
  await appendMailActionLog("mail_accounts", {
    accountCount: accounts.length,
    enabledCount: accounts.filter((account) => account.enabled).length,
  }, options.logPath);
  return accounts;
}

export async function readMailInbox(query: InboxQuery = {}, options: {
  executor?: MailExecutor;
  timeoutMs?: number;
  logPath?: string;
} = {}) {
  const normalized = normalizeInboxQuery(query);
  const executor = options.executor ?? defaultMailExecutor;
  const raw = await executor({ operation: "inbox", ...normalized }, options.timeoutMs ?? MAIL_TIMEOUT_MS) as {
    messages?: RawMailMessage[];
  };
  const messages = (raw.messages || [])
    .map((message) => normalizeMailMessage(message, normalized.excerptChars))
    .slice(0, normalized.limit);
  await appendMailActionLog("mail_inbox", {
    filters: {
      limit: normalized.limit,
      unreadOnly: normalized.unreadOnly,
      accountOrDomain: normalized.accountOrDomain || null,
      recentDays: normalized.recentDays,
    },
    resultCount: messages.length,
    mailIds: messages.map((message) => message.mailId),
  }, options.logPath);
  return { query: normalized, messages };
}

const AUTOMATED_SENDER_PATTERNS = [
  /\bno-?reply\b/i,
  /\bdo-?not-?reply\b/i,
  /\bnoreply\b/i,
  /\bmailer-daemon\b/i,
  /\bnotifications?\b/i,
  /\bnewsletter\b/i,
  /\bmarketing\b/i,
  /\bupdates?@/i,
  /\balerts?@/i,
];

const NOISE_PATTERNS = [
  /\bunsubscribe\b/i,
  /\bnewsletter\b/i,
  /\bweekly digest\b/i,
  /\bdaily digest\b/i,
  /\bsale\b/i,
  /\bdiscount\b/i,
  /\bpromo(?:tion)?\b/i,
  /\bspecial offer\b/i,
  /\border (?:confirmation|shipped|shipping|delivered)\b/i,
  /\byour invoice has been automatically generated\b/i,
  /\bpassword reset\b/i,
  /\bverification code\b/i,
];

export function assessReplyNeed(message: MailMessage): {
  likely: boolean;
  reason: string;
} {
  if (message.replied) return { likely: false, reason: "Mail.app marks this message as already replied to." };
  const senderAndSubject = `${message.sender}\n${message.subject}`;
  const searchable = `${senderAndSubject}\n${message.excerpt}`;
  if (AUTOMATED_SENDER_PATTERNS.some((pattern) => pattern.test(senderAndSubject))) {
    return { likely: false, reason: "Excluded automated or no-reply sender." };
  }
  if (NOISE_PATTERNS.some((pattern) => pattern.test(searchable))) {
    return { likely: false, reason: "Excluded newsletter, marketing, receipt, or automated notification content." };
  }

  const reasons: string[] = [];
  if (message.flagged) reasons.push("flagged");
  if (message.unread) reasons.push("unread");
  if (/^\s*re:/i.test(message.subject)) reasons.push("active thread");
  if (/[?？]\s*(?:$|\n)/m.test(message.excerpt) || /\b(can you|could you|please confirm|let me know|θα μπορούσες|μπορείτε|παρακαλώ|ενημέρωσέ|απάντησ)/i.test(searchable)) {
    reasons.push("contains a question or direct request");
  }
  if (/\b(client|project|proposal|quote|contract|meeting|deadline|payment|invoice|website|menu|support)\b/i.test(searchable)) {
    reasons.push("business or client context");
  }

  const likely = reasons.includes("contains a question or direct request")
    || reasons.includes("active thread")
    || message.flagged
    || (message.unread && reasons.includes("business or client context"));

  return likely
    ? { likely: true, reason: `Likely needs reply: ${reasons.join(", ")}.` }
    : { likely: false, reason: "No strong reply-needed signal after excluding automated mail." };
}

export async function readMailNeedsReply(query: InboxQuery = {}, options: {
  executor?: MailExecutor;
  timeoutMs?: number;
  logPath?: string;
} = {}) {
  const requestedLimit = clampInteger(query.limit, 20, 1, MAIL_LIMIT_MAX);
  const inbox = await readMailInbox({
    ...query,
    limit: Math.min(MAIL_LIMIT_MAX, Math.max(requestedLimit, requestedLimit * 3)),
  }, options);
  const messages: NeedsReplyMessage[] = [];
  for (const message of inbox.messages) {
    const assessment = assessReplyNeed(message);
    if (!assessment.likely) continue;
    messages.push({ ...message, replyReason: assessment.reason });
    if (messages.length >= requestedLimit) break;
  }
  await appendMailActionLog("mail_needs_reply", {
    requestedLimit,
    scannedCount: inbox.messages.length,
    resultCount: messages.length,
    mailIds: messages.map((message) => message.mailId),
  }, options.logPath);
  return { query: { ...inbox.query, limit: requestedLimit }, messages };
}

const FINANCIAL_DEADLINE_PATTERNS = [
  /λήξ(?:η|εως|ει)\s*(?:της\s*)?(?:προθεσμίας|σύμβασης|συνδρομής|ασφάλ\w*|συνταγ\w*)/i,
  /προθεσμία\s*(?:εξόφλησης|πληρωμής)/i,
  /εξόφληση\s*(?:παραστατικού|τιμολογίου|λογαριασμού)/i,
  /λήξη\s*(?:πληρωμής|ασφαλιστηρίου|ασφάλισης)/i,
  /ανανέωση\s*(?:συνδρομής|ασφαλιστηρίου|ασφάλισης|συμβολαίου)/i,
  /\b(?:payment|invoice|subscription|policy)\s*(?:is\s*)?due\b/i,
  /\b(?:due date|renewal date|expir(?:y|es|ation))\b/i,
];

export type FinancialDeadlineMessage = MailMessage & {
  deadlineReason: string;
};

export function assessFinancialDeadline(message: MailMessage): {
  likely: boolean;
  reason: string;
} {
  const searchable = `${message.subject}\n${message.excerpt}`;
  const matched = FINANCIAL_DEADLINE_PATTERNS.some((pattern) => pattern.test(searchable));
  return matched
    ? { likely: true, reason: "Mentions a payment, subscription, insurance, or prescription deadline/renewal." }
    : { likely: false, reason: "No financial deadline or renewal language found." };
}

export async function readMailFinancialDeadlines(query: InboxQuery = {}, options: {
  executor?: MailExecutor;
  timeoutMs?: number;
  logPath?: string;
} = {}) {
  const requestedLimit = clampInteger(query.limit, 20, 1, MAIL_LIMIT_MAX);
  const inbox = await readMailInbox({
    ...query,
    limit: Math.min(MAIL_LIMIT_MAX, Math.max(requestedLimit, requestedLimit * 3)),
  }, options);
  const messages: FinancialDeadlineMessage[] = [];
  for (const message of inbox.messages) {
    const assessment = assessFinancialDeadline(message);
    if (!assessment.likely) continue;
    messages.push({ ...message, deadlineReason: assessment.reason });
    if (messages.length >= requestedLimit) break;
  }
  await appendMailActionLog("mail_financial_deadlines", {
    requestedLimit,
    scannedCount: inbox.messages.length,
    resultCount: messages.length,
    mailIds: messages.map((message) => message.mailId),
  }, options.logPath);
  return { query: { ...inbox.query, limit: requestedLimit }, messages };
}

export async function readMailMessage(mailId: number, query: {
  accountOrDomain?: string;
  excerptChars?: number;
} = {}, options: {
  executor?: MailExecutor;
  timeoutMs?: number;
  logPath?: string;
} = {}) {
  if (!Number.isInteger(mailId) || mailId < 1) throw new Error("mailId must be a positive integer");
  const accountOrDomain = cleanText(query.accountOrDomain).toLowerCase().replace(/^@/, "");
  const excerptChars = clampInteger(query.excerptChars, MAIL_EXCERPT_MAX, 100, MAIL_EXCERPT_MAX);
  const executor = options.executor ?? defaultMailExecutor;
  const raw = await executor({
    operation: "message",
    mailId,
    accountOrDomain,
    excerptChars,
  }, options.timeoutMs ?? MAIL_TIMEOUT_MS) as { message?: RawMailMessage | null };
  const message = raw.message ? normalizeMailMessage(raw.message, excerptChars) : null;
  await appendMailActionLog("mail_message", {
    mailId,
    accountOrDomain: accountOrDomain || null,
    found: Boolean(message),
  }, options.logPath);
  return message;
}

export async function markMailRead(mailId: number, query: {
  accountOrDomain?: string;
  read?: boolean;
} = {}, options: {
  executor?: MailExecutor;
  timeoutMs?: number;
  logPath?: string;
} = {}) {
  if (!Number.isInteger(mailId) || mailId < 1) throw new Error("mailId must be a positive integer");
  const accountOrDomain = cleanText(query.accountOrDomain).toLowerCase().replace(/^@/, "");
  const read = query.read !== false;
  const executor = options.executor ?? defaultMailExecutor;
  const raw = await executor({
    operation: "markRead",
    mailId,
    accountOrDomain,
    read,
  }, options.timeoutMs ?? MAIL_TIMEOUT_MS) as { ok?: boolean; found?: boolean };
  const found = raw.found === true;
  await fs.mkdir(path.dirname(MAIL_ACTION_LOG_PATH), { recursive: true });
  await fs.appendFile(MAIL_ACTION_LOG_PATH, `${JSON.stringify({
    timestamp: new Date().toISOString(),
    action: "mail_mark_read",
    readOnly: false,
    mailId,
    accountOrDomain: accountOrDomain || null,
    read,
    found,
  })}\n`, "utf8");
  return { ok: true, found, mailId, read };
}
