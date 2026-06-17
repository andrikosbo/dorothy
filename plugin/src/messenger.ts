import path from "node:path";
import {
  readSocialNeedsReply,
  readSocialRecent,
  SOCIAL_LOG_DIR,
  type RawSocialRow,
  type SocialChannelConfig,
  type SocialExecutor,
  type SocialQuery,
} from "./social.js";

// Runs in the browser. Reads the Messenger conversation list (left rail). Each
// row is an <a href="/t/<id>"> whose innerText is the conversation name, an
// optional "unread message" marker, the latest preview, and a relative time.
function extractMessengerRows(): RawSocialRow[] {
  const seen = new Set<string>();
  const rows: RawSocialRow[] = [];
  for (const anchor of Array.from(document.querySelectorAll('a[href^="/t/"]'))) {
    const href = anchor.getAttribute("href") || "";
    const idMatch = href.match(/\/t\/(\d+)/);
    const id = idMatch ? idMatch[1] : "";
    const text = ((anchor as HTMLElement).innerText || "").trim();
    if (!id || seen.has(id) || !text) continue;
    seen.add(id);
    rows.push({ id, lines: text.split("\n").map((line) => line.trim()).filter(Boolean) });
  }
  return rows;
}

export const MESSENGER_CONFIG: SocialChannelConfig = {
  channel: "messenger",
  host: "messenger.com",
  url: "https://www.messenger.com/",
  extract: extractMessengerRows,
  readySelector: 'a[href^="/t/"]',
  settleMs: 2_500,
  unreadMarker: /^(μη αναγνωσμένο μήνυμα|unread message)/i,
  fromMePrefix: /^(εσείς|εσύ|you)(\s|:|$)/i,
  automatedConversation: /\bmeta business\b|\bmeta\b[^\n]*\bsupport\b/i,
  logPath: path.join(SOCIAL_LOG_DIR, "dorothy-messenger-actions.jsonl"),
};

export function readMessengerRecent(
  query: SocialQuery = {},
  options: { executor?: SocialExecutor; timeoutMs?: number } = {},
) {
  return readSocialRecent(MESSENGER_CONFIG, query, options);
}

export function readMessengerNeedsReply(
  query: SocialQuery = {},
  options: { executor?: SocialExecutor; timeoutMs?: number } = {},
) {
  return readSocialNeedsReply(MESSENGER_CONFIG, query, options);
}
