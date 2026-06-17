export const NEWS_LIMIT_MAX = 30;
export const NEWS_SCORE_MAX = 100;

export type NewsPeriod = "today" | "overnight" | "week" | "recent" | "saved";

export type ReadNewsInput = {
  period?: NewsPeriod;
  limit?: number;
  minScore?: number;
};

type FetchLike = typeof fetch;

export async function readDorothyNews(
  input: ReadNewsInput = {},
  fetchImpl: FetchLike = fetch,
): Promise<Record<string, unknown>> {
  const period = input.period ?? "today";
  const limit = Math.min(Math.max(Math.floor(input.limit ?? 10), 1), NEWS_LIMIT_MAX);
  const minScore = Math.min(Math.max(Math.floor(input.minScore ?? 60), 0), NEWS_SCORE_MAX);
  const query = new URLSearchParams({
    type: period,
    limit: String(limit),
    minScore: String(minScore),
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);

  try {
    const response = await fetchImpl(`http://127.0.0.1:5678/webhook/dorothy-data?${query}`, {
      signal: controller.signal,
    });
    const body = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (!response.ok || body?.ok !== true) {
      return {
        ok: false,
        readOnly: true,
        onDemand: true,
        error: "news_store_unavailable",
        status: response.status,
      };
    }

    return {
      ...body,
      readOnly: true,
      onDemand: true,
      automaticDelivery: false,
    };
  } catch (error) {
    return {
      ok: false,
      readOnly: true,
      onDemand: true,
      error: "news_store_unavailable",
      detail: (error as Error).message,
    };
  } finally {
    clearTimeout(timer);
  }
}
