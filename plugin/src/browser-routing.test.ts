import { describe, expect, it } from "vitest";
import { browserUrlsMatch, normalizeComparableUrl } from "./browser-routing.js";

describe("browser URL routing", () => {
  it("matches the same URL while ignoring fragments and trailing slashes", () => {
    expect(browserUrlsMatch(
      "https://example.com/account/#settings",
      "https://EXAMPLE.com/account",
    )).toBe(true);
  });

  it("does not reuse an unrelated HTTPS tab", () => {
    expect(browserUrlsMatch(
      "https://example.com/",
      "https://www.facebook.com/",
    )).toBe(false);
  });

  it("keeps query strings significant", () => {
    expect(browserUrlsMatch(
      "https://example.com/search?q=dorothy",
      "https://example.com/search?q=other",
    )).toBe(false);
  });

  it("rejects invalid URLs", () => {
    expect(normalizeComparableUrl("not a url")).toBeNull();
  });
});
