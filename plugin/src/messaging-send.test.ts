import { describe, expect, it } from "vitest";
import entry from "./index.js";
import { getToolPluginMetadata } from "openclaw/plugin-sdk/tool-plugin";
import { sendIMessage } from "./imessage-send.js";
import { composeMail, replyMail } from "./mail-send.js";

function getToolMeta(name: string) {
  const tool = getToolPluginMetadata(entry)?.tools.find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`tool not found: ${name}`);
  return tool;
}

describe("send tools approval contract", () => {
  for (const name of ["dorothy_imessage_send", "dorothy_mail_reply", "dorothy_mail_compose"]) {
    it(`${name} declares APPROVAL REQUIRED and a confirmed parameter`, () => {
      const tool = getToolMeta(name);
      expect(tool.description).toContain("APPROVAL REQUIRED");
      const properties = (tool.parameters as { properties?: Record<string, unknown> }).properties ?? {};
      expect(Object.keys(properties)).toContain("confirmed");
    });
  }

  it("mail send tools default to draft mode (send is optional, not required)", () => {
    for (const name of ["dorothy_mail_reply", "dorothy_mail_compose"]) {
      const tool = getToolMeta(name);
      const required = (tool.parameters as { required?: string[] }).required ?? [];
      expect(required).not.toContain("send");
      expect(required).not.toContain("confirmed");
    }
  });
});

describe("send input validation (no Apple Events fired)", () => {
  it("sendIMessage rejects empty recipient and empty text", async () => {
    expect(await sendIMessage({ to: " ", text: "hi" })).toMatchObject({ ok: false, error: "empty_recipient" });
    expect(await sendIMessage({ to: "+306900000000", text: " " })).toMatchObject({ ok: false, error: "empty_text" });
  });

  it("replyMail rejects invalid mail id and empty body", async () => {
    expect(await replyMail({ mailId: 0, body: "x" })).toMatchObject({ ok: false, error: "invalid_mail_id" });
    expect(await replyMail({ mailId: 5, body: " " })).toMatchObject({ ok: false, error: "empty_body" });
  });

  it("composeMail rejects invalid recipient", async () => {
    expect(await composeMail({ to: "not-an-email", subject: "s", body: "b" })).toMatchObject({
      ok: false,
      error: "invalid_recipient",
    });
  });
});
