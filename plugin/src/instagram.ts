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

// Runs in the browser. Instagram DM rows are not anchors, so we locate the
// conversation list by finding the container whose children are avatar+text
// rows, then read each row's innerText (name, preview, time, optional trailing
// "Unread").
function extractInstagramRows(): RawSocialRow[] {
  let best: Element | null = null;
  let bestScore = 0;
  for (const div of Array.from(document.querySelectorAll("div"))) {
    const kids = div.children;
    if (kids.length < 3 || kids.length > 80) continue;
    let score = 0;
    for (const kid of Array.from(kids)) {
      if (kid.querySelector("img") && ((kid as HTMLElement).innerText || "").trim()) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = div;
    }
  }
  if (!best) return [];
  const rows: RawSocialRow[] = [];
  for (const kid of Array.from(best.children)) {
    if (!kid.querySelector("img")) continue;
    const text = ((kid as HTMLElement).innerText || "").trim();
    if (!text) continue;
    rows.push({ lines: text.split("\n").map((line) => line.trim()).filter(Boolean) });
  }
  return rows;
}

export const INSTAGRAM_CONFIG: SocialChannelConfig = {
  channel: "instagram",
  host: "instagram.com",
  url: "https://www.instagram.com/direct/inbox/",
  extract: extractInstagramRows,
  settleMs: 7_000,
  // Instagram has no inline unread marker line; it appends a trailing "Unread".
  unreadMarker: /^unread message$/i,
  unreadTrailing: /^unread$/i,
  fromMePrefix: /^you(\s|:|$)/i,
  automatedConversation: /^meta ai$/i,
  logPath: path.join(SOCIAL_LOG_DIR, "dorothy-instagram-actions.jsonl"),
};

export function readInstagramRecent(
  query: SocialQuery = {},
  options: { executor?: SocialExecutor; timeoutMs?: number } = {},
) {
  return readSocialRecent(INSTAGRAM_CONFIG, query, options);
}

export function readInstagramNeedsReply(
  query: SocialQuery = {},
  options: { executor?: SocialExecutor; timeoutMs?: number } = {},
) {
  return readSocialNeedsReply(INSTAGRAM_CONFIG, query, options);
}
