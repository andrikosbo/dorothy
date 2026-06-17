"use strict";

const OTP_PATTERNS = [
  /\botp\b/i,
  /\bone[- ]time (?:password|passcode|code)\b/i,
  /\b(?:verification|authentication|security) code\b/i,
  /\b2fa\b/i,
  /\bκωδ(?:ικός|ικο) (?:επαλήθευσης|επιβεβαίωσης|μιας χρήσης)\b/i,
  /\bpin(?: code)?\b/i,
];

const SECURITY_PATTERNS = [
  /\bnew (?:device|login|sign[- ]?in)\b/i,
  /\bpassword (?:changed|reset|attempt)\b/i,
  /\bsecurity alert\b/i,
  /\bunauthori[sz]ed\b/i,
  /\bsuspicious activity\b/i,
  /νέα σύνδεση/i,
  /αλλαγή κωδικού/i,
  /ύποπτη δραστηριότητα/i,
  /ασφάλεια λογαριασμού/i,
];

const MARKETING_PATTERNS = [
  /\bnewsletter\b/i,
  /\bunsubscribe\b/i,
  /\bwebinar\b/i,
  /\bsale\b/i,
  /\bdeals?\b/i,
  /\boffer expires\b/i,
  /\bpromo(?:tion)?\b/i,
  /\bearly access\b/i,
  /έκπτωση/i,
  /εκπτώσ/i,
];

const NOISE_PATTERNS = [
  /\bquickstart guide\b/i,
  /\btechnology & innovation news\b/i,
  /\bnew comment for approval\b/i,
  /νέο σχόλιο για έγκριση/i,
  /παρακαλούμε συντονίστε/i,
];

const AUTOMATED_PATTERNS = [
  /\bno-?reply\b/i,
  /\bnoreply\b/i,
  /\bnotifications?@/i,
  /\bupdates?@/i,
  /\bautomatically generated\b/i,
  /\bplease do not reply\b/i,
  /μην απαντ/i,
];

const TRANSACTION_PATTERNS = [
  /\border\b/i,
  /\bpayment\b/i,
  /\breceipt\b/i,
  /\binvoice\b/i,
  /\brefund\b/i,
  /\bdelivered\b/i,
  /\bshipment\b/i,
  /\bsubscription\b/i,
  /παραγγελί/i,
  /πληρωμ/i,
  /απόδειξ/i,
  /τιμολόγ/i,
  /επιστροφ/i,
  /παράδοσ/i,
  /συνδρομ/i,
];

const DEADLINE_PATTERNS = [
  /\boverdue\b/i,
  /\bdue (?:today|tomorrow|on|by)\b/i,
  /\bfinal notice\b/i,
  /\bdeadline\b/i,
  /\bexpires?\b/i,
  /ληξιπρόθεσμ/i,
  /προθεσμί/i,
  /λήγει/i,
  /μέχρι (?:σήμερα|αύριο|την|τις|\d)/i,
];

const WORK_PATTERNS = [
  /\bclient\b/i,
  /\bcustomer\b/i,
  /\bproject\b/i,
  /\bproposal\b/i,
  /\bquote\b/i,
  /\bestimate\b/i,
  /\bhosting\b/i,
  /\bdomain\b/i,
  /\bwebsite\b/i,
  /\bmeeting\b/i,
  /\bcontract\b/i,
  /\bdeliverable\b/i,
  /πελάτ/i,
  /έργο/i,
  /προσφορά/i,
  /ιστοσελίδ/i,
  /φιλοξεν/i,
  /συνάντησ/i,
  /συμβόλαι/i,
];

const REQUEST_PATTERNS = [
  /\bcan you\b/i,
  /\bcould you\b/i,
  /\bplease (?:send|share|confirm|check|call|reply|prepare|fix|update)\b/i,
  /\bi need\b/i,
  /\bwe need\b/i,
  /\blet me know\b/i,
  /\bwhen can\b/i,
  /\bwould you\b/i,
  /μπορείς/i,
  /στείλε/i,
  /στείλτε/i,
  /χρειάζομαι/i,
  /χρειαζόμαστε/i,
  /θέλω να/i,
  /πες μου/i,
  /ενημέρωσέ με/i,
  /επιβεβαίωσ/i,
  /φτιάξ/i,
  /διόρθωσ/i,
  /πάρε με/i,
  /κάλεσ/i,
];

const BUSINESS_DOMAINS = [
  "acme.example",
  "initech.example",
  "umbrella.example",
  "globex.example",
];

function combinedText(item) {
  return [
    item && item.sender,
    item && item.conversation,
    item && item.subject,
    item && item.excerpt,
  ].filter(Boolean).join("\n");
}

function matchesAny(patterns, text) {
  return patterns.some(pattern => pattern.test(text));
}

function receivedDate(item, now) {
  const parsed = new Date(item.receivedAt || item.sentAt || now);
  return Number.isNaN(parsed.getTime()) ? new Date(now) : parsed;
}

function stableCommunicationKey(item, channel) {
  if (channel === "mail") {
    return `mail:${item.messageId || `${item.account || ""}:${item.mailId || ""}`}`;
  }
  if (channel === "imessage") {
    return `imessage:${item.guid || item.messageId || ""}`;
  }
  return `${channel}:${item.conversationId || item.messageId || item.subject || combinedText(item).slice(0, 80)}`;
}

function isBusinessAddress(item) {
  return (item.accountAddresses || []).some(address => {
    const lower = String(address).toLowerCase();
    return BUSINESS_DOMAINS.some(domain => lower.endsWith(`@${domain}`));
  });
}

function priorityLabel(score) {
  if (score >= 90) return "critical";
  if (score >= 70) return "high";
  if (score >= 40) return "normal";
  return "low";
}

function asksForReply(text) {
  return /[?;]/.test(text)
    || /\bcan you\b/i.test(text)
    || /\bcould you\b/i.test(text)
    || /\blet me know\b/i.test(text)
    || /μπορείς/i.test(text)
    || /πες μου/i.test(text)
    || /ενημέρωσέ με/i.test(text);
}

function redactOtpExcerpt(excerpt) {
  const text = String(excerpt || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text
    .replace(/\b\d{4,8}\b/g, "••••••")
    .slice(0, 240);
}

function classifyCommunication(item, options = {}) {
  const now = options.now ? new Date(options.now) : new Date();
  const channel = options.channel || item.channel || "mail";
  const text = combinedText(item);
  const receivedAt = receivedDate(item, now);
  const ageMs = Math.max(0, now.getTime() - receivedAt.getTime());
  const tracked = options.trackedSourceIds?.has(stableCommunicationKey(item, channel)) || false;
  const fromMe = item.fromMe === true;
  const replied = item.replied === true;
  const unread = item.unread === true || item.read === false;
  const flagged = item.flagged === true;

  const otp = matchesAny(OTP_PATTERNS, text)
    && (/\b\d{4,8}\b/.test(text) || /\b(?:otp|code|κωδ)/i.test(text));
  const marketing = matchesAny(MARKETING_PATTERNS, text);
  const noise = matchesAny(NOISE_PATTERNS, text);
  const automated = matchesAny(AUTOMATED_PATTERNS, text);
  const security = !otp && matchesAny(SECURITY_PATTERNS, text);
  const transaction = matchesAny(TRANSACTION_PATTERNS, text);
  const deadline = matchesAny(DEADLINE_PATTERNS, text);
  const work = isBusinessAddress(item) || matchesAny(WORK_PATTERNS, text);
  const request = !automated && (matchesAny(REQUEST_PATTERNS, text) || /\?/.test(text));

  let category = "unknown";
  let action = "none";
  let reason = "Δεν βρέθηκε σαφές σήμα.";
  let score = unread ? 30 : 20;
  let expiresAt = null;

  if (otp) {
    category = "otp";
    reason = "Προσωρινός κωδικός επιβεβαίωσης.";
    score = 20;
    expiresAt = new Date(receivedAt.getTime() + 20 * 60 * 1000).toISOString();
  } else if (noise) {
    category = "noise";
    reason = "Αυτοματοποιημένος θόρυβος χωρίς χρήσιμη ενέργεια.";
    score = 2;
  } else if (marketing) {
    category = "marketing";
    reason = "Προωθητικό ή newsletter.";
    score = 5;
  } else if (security) {
    category = "security";
    action = unread || flagged ? "review" : "none";
    reason = action === "review"
      ? "Νέα ειδοποίηση ασφάλειας που χρειάζεται έλεγχο."
      : "Διαβασμένη ειδοποίηση ασφάλειας.";
    score = action === "review" ? 92 : 45;
  } else if (transaction && deadline) {
    category = work ? "work" : "transaction";
    action = "task";
    reason = "Οικονομική ή συνδρομητική προθεσμία.";
    score = 88;
  } else if (transaction) {
    category = "transaction";
    action = unread ? "review" : "none";
    reason = "Συναλλαγή, παραγγελία ή οικονομική ενημέρωση.";
    score = unread ? 58 : 35;
  } else if (work && request) {
    category = "work";
    action = asksForReply(text) ? "reply" : "task";
    reason = "Επαγγελματικό αίτημα με πιθανή επόμενη ενέργεια.";
    score = 82;
  } else if (work) {
    category = "work";
    action = unread && !automated ? "review" : "none";
    reason = "Επαγγελματικό πλαίσιο χωρίς σαφές αίτημα.";
    score = unread ? 62 : 38;
  } else if (request) {
    category = "personal";
    action = asksForReply(text) ? "reply" : "task";
    reason = "Προσωπικό μήνυμα με πιθανό αίτημα.";
    score = 72;
  } else if (automated) {
    category = "notification";
    reason = "Αυτοματοποιημένη ενημέρωση.";
    score = 18;
  } else if (unread) {
    category = "unknown";
    action = "review";
    reason = "Μη αναγνωσμένο ανθρώπινο μήνυμα για γρήγορο έλεγχο.";
    score = 48;
  }

  if (flagged) score = Math.max(score, 85);
  if (fromMe || replied) action = "none";

  const expired = Boolean(expiresAt) && new Date(expiresAt).getTime() <= now.getTime();
  let status = "informational";
  if (tracked) status = "tracked";
  else if (fromMe || replied) status = "completed";
  else if (expired) status = "expired";
  else if (action !== "none") status = "pending";

  return {
    category,
    action,
    status,
    priority: priorityLabel(score),
    priorityScore: score,
    reason,
    automated,
    sensitive: otp,
    expiresAt,
    ageMinutes: Math.floor(ageMs / 60_000),
  };
}

function enrichCommunications(items, options = {}) {
  const channel = options.channel || "mail";
  const previous = new Map((options.previousItems || []).map(item => [
    item.communicationKey || stableCommunicationKey(item, channel),
    item,
  ]));
  const now = options.now ? new Date(options.now) : new Date();

  return (items || []).map(item => {
    const communicationKey = stableCommunicationKey(item, channel);
    const older = previous.get(communicationKey);
    const intelligence = classifyCommunication(item, {
      channel,
      now,
      trackedSourceIds: options.trackedSourceIds,
    });
    return {
      ...item,
      channel,
      communicationKey,
      excerpt: intelligence.sensitive ? redactOtpExcerpt(item.excerpt) : item.excerpt,
      firstSeenAt: older?.firstSeenAt || now.toISOString(),
      lastSeenAt: now.toISOString(),
      intelligence,
    };
  });
}

function buildCommunicationOverview(items, options = {}) {
  const now = options.now ? new Date(options.now) : new Date();
  const all = (items || []).slice();
  const byCategory = {};
  const byStatus = {};

  for (const item of all) {
    const intelligence = item.intelligence || {};
    const category = intelligence.category || "unknown";
    const status = intelligence.status || "informational";
    byCategory[category] = (byCategory[category] || 0) + 1;
    byStatus[status] = (byStatus[status] || 0) + 1;
  }

  const pending = all
    .filter(item => item.intelligence?.status === "pending")
    .sort((left, right) => (
      (right.intelligence?.priorityScore || 0) - (left.intelligence?.priorityScore || 0)
      || new Date(right.receivedAt || right.sentAt || 0) - new Date(left.receivedAt || left.sentAt || 0)
    ));

  return {
    generatedAt: now.toISOString(),
    total: all.length,
    pendingCount: pending.length,
    highPriorityCount: all.filter(item => (item.intelligence?.priorityScore || 0) >= 70).length,
    activeOtpCount: all.filter(item => (
      item.intelligence?.category === "otp" && item.intelligence?.status !== "expired"
    )).length,
    byCategory,
    byStatus,
    pending: pending.slice(0, 20),
  };
}

module.exports = {
  buildCommunicationOverview,
  classifyCommunication,
  enrichCommunications,
  stableCommunicationKey,
};
