import fs from "node:fs";
import path from "node:path";

const sessionKey = process.argv[2];
if (!sessionKey) {
  console.error("Usage: node scripts/reset-openclaw-telegram-session.mjs <session-key>");
  process.exit(2);
}

const sessionsDir = "/Users/you/.openclaw/agents/main/sessions";
const sessionsPath = path.join(sessionsDir, "sessions.json");
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "");
const backupDir = path.join(
  "/Users/you/Projects/Dorothy/Dorothy/openclaw-session-backups",
  `${sessionKey.replace(/[^a-zA-Z0-9_.-]+/g, "_")}-${stamp}`,
);

const sessions = JSON.parse(fs.readFileSync(sessionsPath, "utf8"));
const entry = sessions[sessionKey];
if (!entry) {
  console.log(JSON.stringify({ ok: true, changed: false, reason: "missing_session_key", sessionKey }));
  process.exit(0);
}

fs.mkdirSync(backupDir, { recursive: true });
fs.copyFileSync(sessionsPath, path.join(backupDir, "sessions.json.before"));

const candidateIds = new Set([entry.sessionId, ...(entry.usageFamilySessionIds || [])].filter(Boolean));
const moved = [];
for (const sessionId of candidateIds) {
  for (const suffix of [".jsonl", ".trajectory.jsonl", ".trajectory-path.json"]) {
    const source = path.join(sessionsDir, `${sessionId}${suffix}`);
    if (!fs.existsSync(source)) continue;
    const target = path.join(backupDir, path.basename(source));
    fs.renameSync(source, target);
    moved.push({ source, target });
  }
}

delete sessions[sessionKey];
fs.writeFileSync(sessionsPath, `${JSON.stringify(sessions, null, 2)}\n`);

console.log(JSON.stringify({ ok: true, changed: true, sessionKey, sessionId: entry.sessionId, moved, backupDir }, null, 2));
