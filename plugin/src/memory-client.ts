import fs from "node:fs/promises";
import path from "node:path";
import { parseEnv } from "node:util";

const DOROTHY_ROOT = "/Users/you/Projects/Dorothy/Dorothy";
const AUTOMATION_ENV_PATH = path.join(DOROTHY_ROOT, ".env.automation");
const DEFAULT_BASE_URL = "http://127.0.0.1:8765";

export type MemoryScope = "general" | "preference" | "project" | "decision";

type AutomationConfig = {
  baseUrl: string;
  apiToken?: string;
};

async function readAutomationConfig(): Promise<AutomationConfig> {
  let fileEnv: NodeJS.Dict<string> = {};
  try {
    fileEnv = parseEnv(await fs.readFile(AUTOMATION_ENV_PATH, "utf8"));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") throw error;
  }

  return {
    baseUrl: (
      process.env.MEM0_BASE_URL
      || fileEnv.MEM0_BASE_URL
      || DEFAULT_BASE_URL
    ).replace(/\/+$/, ""),
    apiToken: process.env.MEM0_API_TOKEN || fileEnv.MEM0_API_TOKEN,
  };
}

async function memoryRequest(pathname: string, init: RequestInit = {}) {
  const config = await readAutomationConfig();
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  if (init.body) headers.set("content-type", "application/json");
  if (config.apiToken) headers.set("authorization", `Bearer ${config.apiToken}`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(`${config.baseUrl}${pathname}`, {
      ...init,
      headers,
      signal: controller.signal,
    });
    const text = await response.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      // Preserve a plain-text upstream response for diagnostics.
    }
    if (!response.ok) {
      return {
        ok: false,
        error: "mem0_request_failed",
        status: response.status,
        detail: body,
      };
    }
    return body;
  } catch (error) {
    return {
      ok: false,
      error: "mem0_unavailable",
      detail: (error as Error).message,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function readMemoryHealth() {
  return memoryRequest("/health");
}

export async function searchMemories(query: string, scope: MemoryScope | undefined, limit: number) {
  return memoryRequest("/memories/search", {
    method: "POST",
    body: JSON.stringify({ query, scope, limit }),
  });
}

export async function listMemories(scope: MemoryScope | undefined, limit: number) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (scope) params.set("scope", scope);
  return memoryRequest(`/memories?${params.toString()}`);
}

export async function rememberMemory(text: string, scope: MemoryScope) {
  return memoryRequest("/memories", {
    method: "POST",
    body: JSON.stringify({ text, scope }),
  });
}

export async function forgetMemory(memoryId: string) {
  return memoryRequest(`/memories/${encodeURIComponent(memoryId)}`, {
    method: "DELETE",
  });
}
