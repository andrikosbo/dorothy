import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const SEND_ACTION_LOG_PATH = path.join(os.homedir(), ".openclaw", "logs", "dorothy-send-actions.jsonl");
export const IMESSAGE_SEND_TEXT_MAX = 4_000;

export type SendIMessageInput = {
  to: string;
  text: string;
};

// JXA: send an iMessage via Messages.app. `to` is a DM handle (+30..., email)
// or a group chat_identifier (chat...) as returned by dorothy_imessage_recent.
const SEND_IMESSAGE_JXA = `
function run(argv) {
  var Messages = Application("Messages");
  var to = String(argv[0]);
  var text = String(argv[1]);

  if (to.indexOf("chat") === 0) {
    var chats = Messages.chats;
    var ids = chats.id();
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i]).indexOf(to) >= 0) {
        Messages.send(text, { to: chats[i] });
        return JSON.stringify({ ok: true, kind: "group", sentTo: String(ids[i]) });
      }
    }
    return JSON.stringify({ ok: false, error: "chat_not_found", to: to });
  }

  var buddy = null;
  try {
    var service = Messages.services.whose({ serviceType: "iMessage" })[0];
    buddy = service.participants.whose({ handle: to })[0];
    buddy.handle();
  } catch (e) {
    buddy = null;
  }
  if (!buddy) {
    try {
      buddy = Messages.participants.whose({ handle: to })[0];
      buddy.handle();
    } catch (e2) {
      buddy = null;
    }
  }
  if (!buddy) return JSON.stringify({ ok: false, error: "recipient_not_found", to: to });

  Messages.send(text, { to: buddy });
  return JSON.stringify({ ok: true, kind: "dm", sentTo: to });
}
`;

export async function appendSendActionLog(record: Record<string, unknown>): Promise<void> {
  await fs.mkdir(path.dirname(SEND_ACTION_LOG_PATH), { recursive: true });
  await fs.appendFile(SEND_ACTION_LOG_PATH, `${JSON.stringify({ at: new Date().toISOString(), ...record })}\n`, "utf8");
}

export async function sendIMessage(input: SendIMessageInput): Promise<Record<string, unknown>> {
  const to = input.to.trim();
  const text = input.text.trim();
  if (!to) return { ok: false, error: "empty_recipient" };
  if (!text) return { ok: false, error: "empty_text" };
  if (text.length > IMESSAGE_SEND_TEXT_MAX) return { ok: false, error: "text_too_long", max: IMESSAGE_SEND_TEXT_MAX };

  try {
    const { stdout } = await execFileAsync(
      "osascript",
      ["-l", "JavaScript", "-e", SEND_IMESSAGE_JXA, "--", to, text],
      { timeout: 20_000, maxBuffer: 1024 * 1024 },
    );
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(stdout.trim()) as Record<string, unknown>;
    } catch {
      parsed = { ok: false, error: "unexpected_response", raw: stdout.trim() };
    }
    await appendSendActionLog({ action: "imessage_send", to, textPreview: text.slice(0, 200), result: parsed.ok });
    return parsed;
  } catch (error) {
    const message = String((error as Error).message || error);
    await appendSendActionLog({ action: "imessage_send", to, textPreview: text.slice(0, 200), result: false, error: message });
    return { ok: false, error: message };
  }
}
