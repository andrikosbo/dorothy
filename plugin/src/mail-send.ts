import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { appendSendActionLog } from "./imessage-send.js";

const execFileAsync = promisify(execFile);

export const MAIL_SEND_BODY_MAX = 20_000;

export type ReplyMailInput = {
  mailId: number;
  body: string;
  replyAll?: boolean;
  send?: boolean;
};

export type ComposeMailInput = {
  to: string;
  subject: string;
  body: string;
  cc?: string;
  send?: boolean;
};

// The send/draft JXA lives here, NOT in MAIL_JXA_SCRIPT (mail.ts), so the read
// script keeps its no-mutation invariant that mail.test.ts enforces.
const REPLY_MAIL_JXA = `
function run(argv) {
  var Mail = Application("Mail");
  var mailId = Number(argv[0]);
  var body = String(argv[1]);
  var replyAll = argv[2] === "true";
  var send = argv[3] === "true";

  var matches = Mail.inbox.messages.whose({ id: mailId });
  if (matches.length === 0) return JSON.stringify({ ok: false, error: "message_not_found", mailId: mailId });
  var original = matches[0];
  var subject = String(original.subject() || "");
  var sender = String(original.sender() || "");

  var reply = Mail.reply(original, { openingWindow: !send, replyToAll: replyAll });
  reply.content = body;
  if (send) {
    Mail.send(reply);
  }

  return JSON.stringify({
    ok: true,
    mode: send ? "sent" : "draft_opened",
    inReplyTo: { mailId: mailId, subject: subject, sender: sender },
  });
}
`;

const COMPOSE_MAIL_JXA = `
function run(argv) {
  var Mail = Application("Mail");
  var to = String(argv[0]);
  var subject = String(argv[1]);
  var body = String(argv[2]);
  var cc = String(argv[3] || "");
  var send = argv[4] === "true";

  var message = Mail.OutgoingMessage({ subject: subject, content: body, visible: !send });
  Mail.outgoingMessages.push(message);
  message.toRecipients.push(Mail.Recipient({ address: to }));
  if (cc) message.ccRecipients.push(Mail.Recipient({ address: cc }));
  if (send) {
    Mail.send(message);
  }

  return JSON.stringify({ ok: true, mode: send ? "sent" : "draft_opened", to: to, subject: subject });
}
`;

async function runMailJxa(script: string, args: string[]): Promise<Record<string, unknown>> {
  const { stdout } = await execFileAsync("osascript", ["-l", "JavaScript", "-e", script, "--", ...args], {
    timeout: 45_000,
    maxBuffer: 1024 * 1024,
  });
  try {
    return JSON.parse(stdout.trim()) as Record<string, unknown>;
  } catch {
    return { ok: false, error: "unexpected_response", raw: stdout.trim() };
  }
}

export async function replyMail(input: ReplyMailInput): Promise<Record<string, unknown>> {
  const body = input.body.trim();
  if (!Number.isInteger(input.mailId) || input.mailId < 1) return { ok: false, error: "invalid_mail_id" };
  if (!body) return { ok: false, error: "empty_body" };
  if (body.length > MAIL_SEND_BODY_MAX) return { ok: false, error: "body_too_long", max: MAIL_SEND_BODY_MAX };

  try {
    const result = await runMailJxa(REPLY_MAIL_JXA, [
      String(input.mailId),
      body,
      String(input.replyAll === true),
      String(input.send === true),
    ]);
    await appendSendActionLog({
      action: "mail_reply",
      mailId: input.mailId,
      mode: input.send === true ? "sent" : "draft",
      bodyPreview: body.slice(0, 200),
      result: result.ok,
    });
    return result;
  } catch (error) {
    const message = String((error as Error).message || error);
    await appendSendActionLog({ action: "mail_reply", mailId: input.mailId, result: false, error: message });
    return { ok: false, error: message };
  }
}

export async function composeMail(input: ComposeMailInput): Promise<Record<string, unknown>> {
  const to = input.to.trim();
  const subject = input.subject.trim();
  const body = input.body.trim();
  if (!to || !to.includes("@")) return { ok: false, error: "invalid_recipient" };
  if (!subject) return { ok: false, error: "empty_subject" };
  if (!body) return { ok: false, error: "empty_body" };
  if (body.length > MAIL_SEND_BODY_MAX) return { ok: false, error: "body_too_long", max: MAIL_SEND_BODY_MAX };

  try {
    const result = await runMailJxa(COMPOSE_MAIL_JXA, [
      to,
      subject,
      body,
      (input.cc || "").trim(),
      String(input.send === true),
    ]);
    await appendSendActionLog({
      action: "mail_compose",
      to,
      subject,
      mode: input.send === true ? "sent" : "draft",
      result: result.ok,
    });
    return result;
  } catch (error) {
    const message = String((error as Error).message || error);
    await appendSendActionLog({ action: "mail_compose", to, subject, result: false, error: message });
    return { ok: false, error: message };
  }
}
