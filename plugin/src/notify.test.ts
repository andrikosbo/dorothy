import { describe, expect, it } from "vitest";
import { NOTIFY_TEXT_MAX, notifyOwner } from "./notify.js";

describe("dorothy_notify", () => {
  it("rejects empty text", async () => {
    const res = await notifyOwner({ text: "   " });
    expect(res.ok).toBe(false);
    expect(res.error).toBe("empty_text");
  });

  it("rejects over-long text", async () => {
    const res = await notifyOwner({ text: "x".repeat(NOTIFY_TEXT_MAX + 1) });
    expect(res.ok).toBe(false);
    expect(res.error).toBe("text_too_long");
  });

  it("exposes a sane text cap", () => {
    expect(NOTIFY_TEXT_MAX).toBeGreaterThan(500);
    expect(NOTIFY_TEXT_MAX).toBeLessThanOrEqual(4096);
  });
});
