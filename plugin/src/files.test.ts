import { describe, expect, it } from "vitest";
import path from "node:path";
import { DOROTHY_INDEX_ROOT, searchDorothyFiles } from "./files.js";

describe("Dorothy file tools", () => {
  it("rejects an empty search", async () => {
    await expect(searchDorothyFiles({ query: "  " })).resolves.toEqual({
      ok: false,
      error: "empty_query",
    });
  });

  it("uses the dedicated index root", () => {
    expect(path.basename(DOROTHY_INDEX_ROOT)).toBe("Dorothy_Index");
  });
});
