import fs from "node:fs";
import path from "node:path";

const sessionsDir = "/Users/you/.openclaw/agents/main/sessions";
const sessionsPath = path.join(sessionsDir, "sessions.json");
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "");
const backupDir = path.join(
  "/Users/you/Projects/Dorothy/Dorothy/openclaw-session-backups",
  `all-openclaw-sessions-${stamp}`,
);

fs.mkdirSync(backupDir, { recursive: true });

const before = fs.existsSync(sessionsPath)
  ? JSON.parse(fs.readFileSync(sessionsPath, "utf8"))
  : {};

if (fs.existsSync(sessionsPath)) {
  fs.copyFileSync(sessionsPath, path.join(backupDir, "sessions.json.before"));
}

const moved = [];
for (const name of fs.readdirSync(sessionsDir)) {
  if (name === "sessions.json") continue;
  const source = path.join(sessionsDir, name);
  if (!fs.statSync(source).isFile()) continue;
  const target = path.join(backupDir, name);
  fs.renameSync(source, target);
  moved.push({ source, target });
}

fs.writeFileSync(sessionsPath, "{}\n");

console.log(JSON.stringify({
  ok: true,
  clearedSessionKeys: Object.keys(before).length,
  movedFiles: moved.length,
  backupDir,
}, null, 2));
