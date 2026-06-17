import os from "node:os";
import path from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright";

// Dorothy drives a dedicated, persistent Chromium profile (logged-in Meta
// sessions live here). The profile can only be opened by one process at a time,
// so every browser-backed channel adapter must share this single context rather
// than launching its own.
export const BROWSER_PROFILE_DIR = path.join(os.homedir(), ".dorothy-browser-profile");
const INBOX_DIR = "/Users/you/Dorothy-inbox";

let browserContextPromise: Promise<BrowserContext> | undefined;

// the user shares this Mac with Dorothy and sometimes has her browser profile
// open himself (e.g. via "Chrome for Testing"). Launching off-screen keeps
// Dorothy's window out of his way without going fully headless (which some
// sites like Messenger treat as a bot and sign out of).
async function launchContext(): Promise<BrowserContext> {
  const context = await chromium.launchPersistentContext(BROWSER_PROFILE_DIR, {
    headless: false,
    acceptDownloads: true,
    downloadsPath: path.join(INBOX_DIR, "browser-downloads"),
    viewport: { width: 1280, height: 900 },
    args: ["--window-position=-32000,-32000", "--window-size=1280,900"],
  });
  context.on("close", () => {
    if (browserContextPromise) browserContextPromise = undefined;
  });
  return context;
}

export async function getBrowserContext(): Promise<BrowserContext> {
  if (!browserContextPromise) {
    browserContextPromise = launchContext();
  }
  try {
    const context = await browserContextPromise;
    // Touching pages() throws if the underlying browser process is gone
    // (e.g. the user closed the window that happened to hold this profile).
    // Relaunch fresh rather than surfacing a "lost session" error.
    context.pages();
    return context;
  } catch {
    browserContextPromise = launchContext();
    return browserContextPromise;
  }
}

// Open (or reuse) a background tab dedicated to a channel read. Channel adapters
// use their own tab so a read never disturbs whichever tab the user's browser
// tools are pointed at. The tab is reused across reads by matching its URL host.
export async function getChannelPage(urlHostMatch: string): Promise<Page> {
  const context = await getBrowserContext();
  const existing = context.pages().find((page) => {
    try {
      return new URL(page.url()).host.includes(urlHostMatch);
    } catch {
      return false;
    }
  });
  if (existing) return existing;
  return context.newPage();
}
