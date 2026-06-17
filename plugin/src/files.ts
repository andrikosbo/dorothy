import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const FILE_SEARCH_LIMIT_MAX = 50;
export const DOROTHY_INDEX_ROOT = path.join(os.homedir(), "Dorothy_Index");

export type FileSearchInput = {
  query: string;
  limit?: number;
};

function isInsideIndex(candidate: string): boolean {
  const root = path.resolve(DOROTHY_INDEX_ROOT);
  const resolved = path.resolve(candidate);
  return resolved === root || resolved.startsWith(`${root}${path.sep}`);
}

function cleanLines(stdout: string, limit: number): string[] {
  const unique = new Set<string>();
  for (const line of stdout.split("\n")) {
    const value = line.trim();
    if (!value || !isInsideIndex(value)) continue;
    unique.add(value);
    if (unique.size >= limit) break;
  }
  return [...unique];
}

async function describePaths(paths: string[]) {
  return Promise.all(paths.map(async (filePath) => {
    try {
      const stat = await fs.stat(filePath);
      return {
        name: path.basename(filePath),
        path: filePath,
        kind: stat.isDirectory() ? "directory" : "file",
        size: stat.isFile() ? stat.size : null,
        modified: stat.mtime.toISOString(),
      };
    } catch {
      return null;
    }
  })).then((rows) => rows.filter((row) => row !== null));
}

export async function searchDorothyFiles(input: FileSearchInput): Promise<Record<string, unknown>> {
  const query = input.query.trim();
  if (!query) return { ok: false, error: "empty_query" };
  const limit = Math.max(1, Math.min(FILE_SEARCH_LIMIT_MAX, Math.floor(input.limit ?? 20)));

  try {
    await fs.access(DOROTHY_INDEX_ROOT);
  } catch {
    return { ok: false, error: "index_not_found", root: DOROTHY_INDEX_ROOT };
  }

  let method = "spotlight";
  let paths: string[] = [];
  try {
    const spotlight = await execFileAsync(
      "/usr/bin/mdfind",
      ["-onlyin", DOROTHY_INDEX_ROOT, query],
      { timeout: 10_000, maxBuffer: 2 * 1024 * 1024 },
    );
    paths = cleanLines(spotlight.stdout, limit);
  } catch {
    paths = [];
  }

  if (paths.length === 0) {
    method = "find";
    try {
      const fallback = await execFileAsync(
        "/usr/bin/find",
        ["-L", DOROTHY_INDEX_ROOT, "-type", "f", "-iname", `*${query}*`],
        { timeout: 15_000, maxBuffer: 2 * 1024 * 1024 },
      );
      paths = cleanLines(fallback.stdout, limit);
    } catch (error) {
      const err = error as Error & { stdout?: string };
      paths = cleanLines(String(err.stdout || ""), limit);
    }
  }

  const results = await describePaths(paths);
  return { ok: true, readOnly: true, root: DOROTHY_INDEX_ROOT, method, count: results.length, results };
}

export async function openDorothyFile(filePath: string, reveal = false): Promise<Record<string, unknown>> {
  const candidate = path.resolve(filePath.trim());
  if (!isInsideIndex(candidate)) {
    return { ok: false, error: "path_outside_dorothy_index", root: DOROTHY_INDEX_ROOT };
  }

  try {
    await fs.access(candidate);
  } catch {
    return { ok: false, error: "path_not_found", path: candidate };
  }

  try {
    await execFileAsync("/usr/bin/open", reveal ? ["-R", candidate] : [candidate], { timeout: 10_000 });
    return { ok: true, path: candidate, action: reveal ? "revealed" : "opened" };
  } catch (error) {
    return { ok: false, error: String((error as Error).message || error), path: candidate };
  }
}
