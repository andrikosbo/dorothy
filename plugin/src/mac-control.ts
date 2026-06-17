import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const APP_ROOTS = ["/Applications", path.join(process.env.HOME || "", "Applications")];

async function run(command: string, args: string[], timeout = 10_000) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      timeout,
      maxBuffer: 1024 * 1024,
    });
    return { ok: true, stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (error) {
    const err = error as Error & { stdout?: string; stderr?: string; code?: number | string };
    return {
      ok: false,
      stdout: String(err.stdout || "").trim(),
      stderr: String(err.stderr || err.message || "").trim(),
      code: err.code,
    };
  }
}

async function walkApps(root: string, depth = 2): Promise<string[]> {
  if (depth < 0) return [];
  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const found: string[] = [];
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory() && entry.name.endsWith(".app")) found.push(full);
    else if (entry.isDirectory() && depth > 0) found.push(...await walkApps(full, depth - 1));
  }
  return found;
}

export async function listInstalledApplications() {
  const paths = (await Promise.all(APP_ROOTS.map(root => walkApps(root)))).flat();
  return [...new Set(paths)]
    .map(appPath => ({ name: path.basename(appPath, ".app"), path: appPath }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function resolveApplication(requested: string) {
  const clean = requested.trim().toLowerCase().replace(/\.app$/, "");
  if (!clean) return null;
  const applications = await listInstalledApplications();
  return applications.find(app => app.name.toLowerCase() === clean)
    || applications.find(app => app.name.toLowerCase().includes(clean))
    || null;
}

export async function listRunningApplications() {
  const result = await run("osascript", [
    "-e",
    'tell application "System Events" to get name of every application process whose background only is false',
  ]);
  return {
    ok: result.ok,
    applications: result.ok ? result.stdout.split(", ").filter(Boolean) : [],
    error: result.ok ? undefined : result.stderr,
  };
}

export async function controlApplication(
  application: string,
  action: "open" | "activate" | "hide" | "quit",
  confirmed?: boolean,
) {
  const app = await resolveApplication(application);
  if (!app) return { ok: false, error: "application_not_found", application };
  if (action === "quit" && confirmed !== true) {
    return {
      ok: false,
      confirmation_required: true,
      action: `quit ${app.name}`,
      message: "Ask the user for explicit confirmation, then retry with confirmed=true.",
    };
  }
  if (action === "open" || action === "activate") {
    const result = await run("open", ["-a", app.path]);
    return { ok: result.ok, application: app.name, action, error: result.stderr || undefined };
  }
  const script = action === "hide"
    ? `tell application "System Events" to tell process ${JSON.stringify(app.name)} to set visible to false`
    : `tell application ${JSON.stringify(app.name)} to quit`;
  const result = await run("osascript", ["-e", script], 15_000);
  return { ok: result.ok, application: app.name, action, error: result.stderr || undefined };
}

export async function readPowerSchedule() {
  const [schedule, assertions] = await Promise.all([
    run("pmset", ["-g", "sched"]),
    run("pmset", ["-g", "assertions"]),
  ]);
  return {
    ok: schedule.ok,
    schedule: schedule.stdout || schedule.stderr,
    sleepBlockers: assertions.stdout
      .split("\n")
      .filter(line => /PreventSystemSleep|PreventUserIdleSystemSleep|NoIdleSleepAssertion/.test(line))
      .map(line => line.trim()),
  };
}

export async function controlPower(
  action: "sleep" | "shutdown" | "restart",
  confirmed?: boolean,
) {
  if (confirmed !== true) {
    return {
      ok: false,
      confirmation_required: true,
      action,
      message: "Ask the user for explicit confirmation, then retry with confirmed=true.",
    };
  }
  const result = await run("/usr/bin/sudo", ["-n", "/usr/local/sbin/dorothy-power", action], 20_000);
  return { ok: result.ok, action, error: result.stderr || undefined };
}
