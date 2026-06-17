(function attachDorothyCommunications(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.DorothyCommunications = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createDorothyCommunications() {
  "use strict";

  const NOISE_PATTERNS = [
    /\bnewsletter\b/i,
    /\bunsubscribe\b/i,
    /\bquickstart guide\b/i,
    /\bfunded\b/i,
    /\bwebinar\b/i,
    /\blive q&a\b/i,
    /\bregister here\b/i,
    /\bearly summer deals\b/i,
    /\btechnology & innovation news\b/i,
    /\bpurchases have returned as credits\b/i,
    /προσφορ/i,
  ];

  const AUTOMATED_PATTERNS = [
    /\bno-?reply\b/i,
    /\bnoreply\b/i,
    /\bnotifications?\b/i,
    /\bnewsletter\b/i,
    /\bmonthly report\b/i,
    /\bweekly report\b/i,
    /\bdaily report\b/i,
    /\bupdates?@/i,
    /\bhello@ollama\.com\b/i,
    /\bhosted cloud\b/i,
    /\bautomatically generated\b/i,
    /\bplease do not reply\b/i,
    /μην απαντ/i,
    /\borders?@/i,
    /\baccount\.netflix\.com\b/i,
    /\bemail\.apple\.com\b/i,
    /\bskroutz\.gr\b/i,
    /\brevolut\.com\b/i,
    /\btemu\.com\b/i,
  ];

  const SECURITY_PATTERNS = [
    /\bnew device\b/i,
    /\bsign(?:ed)? in\b/i,
    /\bpassword\b/i,
    /\bsecurity\b/i,
    /\bunauthori[sz]ed\b/i,
    /\bverification code\b/i,
    /σύνδεσ/i,
    /κωδικό πρόσβασης/i,
    /ασφάλ/i,
  ];

  const TRANSACTION_PATTERNS = [
    /\border\b/i,
    /\bdelivered\b/i,
    /\bpickup\b/i,
    /\bpackage\b/i,
    /\brefund\b/i,
    /\bcredit received\b/i,
    /\binvoice\b/i,
    /παραγγελί/i,
    /τιμολόγ/i,
    /παράδοσ/i,
    /παραλαβ/i,
    /επιστροφ/i,
    /πίστωσ/i,
  ];

  function combinedText(mail) {
    return [
      mail && mail.sender,
      mail && mail.subject,
      mail && mail.excerpt,
    ].filter(Boolean).join("\n");
  }

  function intelligence(mail) {
    return mail && mail.intelligence && typeof mail.intelligence === "object"
      ? mail.intelligence
      : null;
  }

  function senderName(mail) {
    return String((mail && mail.sender) || "Άγνωστος")
      .replace(/\s*<.*?>\s*/, "")
      .replace(/^"(.*)"$/, "$1")
      .trim() || "Άγνωστος";
  }

  function isSameLocalDay(iso, now) {
    if (!iso) return false;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return false;
    const reference = now || new Date();
    return date.getFullYear() === reference.getFullYear()
      && date.getMonth() === reference.getMonth()
      && date.getDate() === reference.getDate();
  }

  function isNoise(mail) {
    const cached = intelligence(mail);
    if (cached) return cached.category === "noise" || cached.category === "marketing";
    const text = combinedText(mail);
    const wordpressModeration = /παρακαλούμε συντονίστε/i.test(text)
      && (/νέο σχόλιο για έγκριση/i.test(text) || /wordpress/i.test(text));
    const obviousCommentSpam = /νέο σχόλιο για έγκριση/i.test(text)
      && /https?:\/\/.*\.(?:ru|su)\b/i.test(text);
    return wordpressModeration
      || obviousCommentSpam
      || NOISE_PATTERNS.some(pattern => pattern.test(text));
  }

  function isAutomated(mail) {
    const cached = intelligence(mail);
    if (cached) return cached.automated === true;
    return AUTOMATED_PATTERNS.some(pattern => pattern.test(combinedText(mail)));
  }

  function isSecurity(mail) {
    const cached = intelligence(mail);
    if (cached) return cached.category === "security";
    return SECURITY_PATTERNS.some(pattern => pattern.test(combinedText(mail)));
  }

  function isTransaction(mail) {
    const cached = intelligence(mail);
    if (cached) return cached.category === "transaction";
    return TRANSACTION_PATTERNS.some(pattern => pattern.test(combinedText(mail)));
  }

  function isReplyCandidate(mail) {
    if (!mail || mail.read || mail.replied || isNoise(mail) || isAutomated(mail)) return false;
    const text = combinedText(mail);
    if (isSecurity(mail) || isTransaction(mail)) return false;
    if (
      /\bwe received your request\b/i.test(text)
      || /\bconfirmation\b/i.test(text)
      || /\bmyschool-info@/i.test(text)
      || /ενημερωτικό σημείωμα/i.test(text)
      || /\bstatus update\b/i.test(text)
    ) return false;
    return true;
  }

  function isAttentionWorthy(mail) {
    if (!mail) return false;
    if (mail.flagged) return true;
    if (mail.read || isNoise(mail)) return false;
    return Boolean(isSecurity(mail) || !isAutomated(mail));
  }

  function isActionable(mail) {
    return isAttentionWorthy(mail) || isReplyCandidate(mail);
  }

  function isPendingCandidate(mail) {
    const cached = intelligence(mail);
    if (cached) return cached.status === "pending";
    return isReplyCandidate(mail);
  }

  function extractOrderId(text) {
    const temu = String(text).match(/\bPO-\d{3}-\d{14,}\b/i);
    if (temu) return temu[0].toUpperCase();
    const generic = String(text).match(/\b\d{6}-\d{6,}\b/);
    return generic ? generic[0] : "";
  }

  function groupKey(mail) {
    const text = combinedText(mail);
    const lower = text.toLowerCase();
    const orderId = extractOrderId(text);

    if (lower.includes("temu")) return `transaction:temu:${orderId || "today"}`;
    if (lower.includes("skroutz") || lower.includes("revolut")) return "transaction:skroutz";
    if (isSecurity(mail) && lower.includes("apple")) return "security:apple";
    if (isSecurity(mail) && lower.includes("netflix")) return "security:netflix";
    if (lower.includes("meta for business") || lower.includes("ga4") || lower.includes("google analytics")) {
      return "updates:business";
    }

    const sender = senderName(mail).toLowerCase();
    const subject = String(mail.subject || "").toLowerCase().replace(/\s+/g, " ").trim();
    return `${sender}:${subject}`;
  }

  function classify(mail) {
    const cached = intelligence(mail);
    if (cached) {
      const category = cached.category === "transaction"
        ? "transactions"
        : cached.category === "security"
          ? "security"
          : "updates";
      return { category, priority: Number(cached.priorityScore) || 0 };
    }
    const text = combinedText(mail).toLowerCase();
    if (isSecurity(mail)) return { category: "security", priority: 100 };
    if (isTransaction(mail)) return { category: "transactions", priority: 80 };
    if (text.includes("myschool") || text.includes("εκδρομ")) {
      return { category: "updates", priority: 74 };
    }
    if (text.includes("meta for business") || text.includes("διαφήμισή σας εγκρίθηκε")) {
      return { category: "updates", priority: 68 };
    }
    if (text.includes("ga4") || text.includes("google analytics")) {
      return { category: "updates", priority: 64 };
    }
    if (!isAutomated(mail)) return { category: "updates", priority: 72 };
    return { category: "updates", priority: 50 };
  }

  function summarizeGroup(group) {
    const items = group.items;
    const text = items.map(combinedText).join("\n");
    const lower = text.toLowerCase();
    const orderId = extractOrderId(text);

    if (group.key.startsWith("security:apple")) {
      const details = [];
      if (/\bsign(?:ed)? in\b/i.test(text)) details.push("σύνδεση στο iCloud μέσω browser");
      if (/app-specific password/i.test(text)) details.push("δημιουργία app-specific password");
      const action = details.length ? details.join(" και ") : "ειδοποίηση ασφαλείας λογαριασμού";
      const check = details.length > 1 ? "Έλεγξέ τα" : "Έλεγξέ το";
      return `**Apple Account** — ${action}. ${check} μόνο αν δεν το έκανες εσύ.`;
    }

    if (group.key.startsWith("security:netflix")) {
      return "**Netflix** — νέα συσκευή χρησιμοποίησε τον λογαριασμό. Αν δεν ήταν δική σου, άλλαξε κωδικό.";
    }

    if (group.key.startsWith("transaction:temu")) {
      const statuses = [];
      if (/\bpickup\b/i.test(text) || /παραλαβ/i.test(text)) statuses.push("διαθέσιμη για παραλαβή");
      if (/\bdelivered\b/i.test(text) || /παράδοσ/i.test(text)) statuses.push("καταγράφηκε παράδοση");
      if (/\brefund\b/i.test(text) || /επιστροφ/i.test(text) || /\bcredit received\b/i.test(text)) {
        const amount = text.match(/\b\d+[,.]\d{2}\s*€/);
        statuses.push(amount ? `επιστροφή ${amount[0].replace(/\s+/g, "")} σε credit` : "ολοκληρώθηκε επιστροφή/πίστωση");
      }
      return `**Temu${orderId ? ` ${shortOrderId(orderId)}` : ""}** — ${joinGreek(statuses) || "νεότερη ενημέρωση παραγγελίας"}.`;
    }

    if (group.key.startsWith("transaction:skroutz")) {
      const statuses = [];
      if (/λάβαμε την παραγγελία|order/i.test(text)) statuses.push("η παραγγελία καταχωρήθηκε");
      if (/revolut/i.test(text)) statuses.push("υπάρχει ενημέρωση πληρωμής Revolut");
      if (/τιμολόγ|invoice/i.test(text)) statuses.push("το τιμολόγιο είναι διαθέσιμο");
      return `**Skroutz${orderId ? ` #${orderId.replace(/^#/, "")}` : ""}** — ${joinGreek(statuses) || "νεότερη ενημέρωση παραγγελίας"}.`;
    }

    if (group.key === "updates:business") {
      const statuses = [];
      if (/meta for business|διαφήμισή σας εγκρίθηκε/i.test(text)) statuses.push("η διαφήμιση Meta εγκρίθηκε");
      if (/ga4|google analytics/i.test(text)) statuses.push("υπάρχουν νέα GA4 insights");
      return `**Business** — ${joinGreek(statuses) || "νέες ενημερώσεις από τα εργαλεία σου"}.`;
    }

    const latest = items[0];
    return `**${senderName(latest)}** — ${truncate(latest.subject || "(χωρίς θέμα)", 120)}`;
  }

  function shortOrderId(orderId) {
    if (orderId.length <= 20) return `#${orderId}`;
    return `#…${orderId.slice(-8)}`;
  }

  function joinGreek(values) {
    const unique = [...new Set(values)];
    if (unique.length < 2) return unique[0] || "";
    return `${unique.slice(0, -1).join(", ")} και ${unique[unique.length - 1]}`;
  }

  function truncate(value, limit) {
    const text = String(value).replace(/\s+/g, " ").trim();
    return text.length <= limit ? text : `${text.slice(0, limit - 1).trimEnd()}…`;
  }

  function summarizeToday(mail, options) {
    const settings = options || {};
    const now = settings.now || new Date();
    const maxGroups = settings.maxGroups || 6;
    const today = (mail || [])
      .filter(item => isSameLocalDay(item.receivedAt, now))
      .sort((a, b) => new Date(b.receivedAt) - new Date(a.receivedAt));
    const relevant = today.filter(isActionable);
    const grouped = new Map();

    relevant.forEach(item => {
      const key = groupKey(item);
      const current = grouped.get(key);
      if (current) {
        current.items.push(item);
        current.priority = Math.max(current.priority, classify(item).priority);
      } else {
        const kind = classify(item);
        grouped.set(key, {
          key,
          category: kind.category,
          priority: kind.priority,
          latestAt: item.receivedAt,
          items: [item],
        });
      }
    });

    const allGroups = [...grouped.values()]
      .map(group => ({ ...group, summary: summarizeGroup(group) }))
      .sort((a, b) => b.priority - a.priority || new Date(b.latestAt) - new Date(a.latestAt));
    const groups = allGroups.slice(0, maxGroups);

    return {
      totalMessages: today.length,
      noiseMessages: today.length - relevant.length,
      collapsedMessages: relevant.length - allGroups.length,
      omittedGroups: Math.max(0, allGroups.length - groups.length),
      groups,
    };
  }

  return {
    isSameLocalDay,
    isNoise,
    isAutomated,
    isReplyCandidate,
    isAttentionWorthy,
    isActionable,
    isPendingCandidate,
    summarizeToday,
  };
});
