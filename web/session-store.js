"use strict";

const fs = require("fs");
const path = require("path");

function deleteStoredSession({ homeDir, agentId, key }) {
  const base = homeDir || process.env.HOME || "";
  const sessionDir = path.join(base, ".openclaw", "agents", agentId, "sessions");
  const storePath = path.join(sessionDir, "sessions.json");
  let store;
  try {
    store = JSON.parse(fs.readFileSync(storePath, "utf8"));
  } catch {
    return { found: false, transcriptDeleted: false };
  }

  const entryKey = `agent:${agentId}:${key}`;
  const entry = store?.[entryKey];
  if (!entry) return { found: false, transcriptDeleted: false };

  const transcriptPath = resolveTranscriptPath(sessionDir, entry);
  delete store[entryKey];
  fs.mkdirSync(sessionDir, { recursive: true });
  const temporary = `${storePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(store, null, 2), "utf8");
  fs.renameSync(temporary, storePath);

  let transcriptDeleted = false;
  if (transcriptPath && fs.existsSync(transcriptPath)) {
    fs.unlinkSync(transcriptPath);
    transcriptDeleted = true;
  }

  return { found: true, transcriptDeleted };
}

function resolveTranscriptPath(sessionDir, entry) {
  const sessionId = String(entry?.sessionId || "");
  if (!/^[a-zA-Z0-9-]+$/.test(sessionId)) return "";
  const configured = String(entry?.sessionFile || "");
  const candidate = configured || path.join(sessionDir, `${sessionId}.jsonl`);
  const resolved = path.resolve(candidate);
  const root = `${path.resolve(sessionDir)}${path.sep}`;
  return resolved.startsWith(root) && resolved.endsWith(".jsonl") ? resolved : "";
}

module.exports = { deleteStoredSession };
