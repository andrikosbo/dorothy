import { describe, expect, it, vi } from "vitest";
import { readDorothyNews } from "./news.js";

describe("Dorothy news", () => {
  it("queries the local read-only store with bounded parameters", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({
      ok: true,
      mode: "on-demand",
      count: 1,
      items: [{ title: "Relevant item", ai_score: 72 }],
    }), { status: 200 }));

    const result = await readDorothyNews({
      period: "week",
      limit: 99,
      minScore: -5,
    }, fetchMock);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0][0])).toContain("type=week");
    expect(String(fetchMock.mock.calls[0][0])).toContain("limit=30");
    expect(String(fetchMock.mock.calls[0][0])).toContain("minScore=0");
    expect(result).toMatchObject({
      ok: true,
      readOnly: true,
      onDemand: true,
      automaticDelivery: false,
      count: 1,
    });
  });

  it("uses conservative defaults", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({
      ok: true,
      count: 0,
      items: [],
    }), { status: 200 }));

    await readDorothyNews({}, fetchMock);

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("type=today");
    expect(url).toContain("limit=10");
    expect(url).toContain("minScore=60");
  });

  it("fails closed when the local store is unavailable", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response("offline", { status: 503 }));

    await expect(readDorothyNews({}, fetchMock)).resolves.toMatchObject({
      ok: false,
      readOnly: true,
      onDemand: true,
      error: "news_store_unavailable",
      status: 503,
    });
  });
});
