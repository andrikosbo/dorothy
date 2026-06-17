"use strict";

const OPENCLAW_BIN = process.env.OPENCLAW_BIN || "/opt/homebrew/bin/openclaw";
const POWER_HELPER = "/usr/local/sbin/dorothy-power";
const LOCK_SCRIPT = 'tell application "System Events" to key code 12 using {control down, command down}';

async function runMacPowerAction({ action, confirmed, runCommand }) {
  if (!["lock", "sleep", "shutdown", "restart"].includes(action)) {
    return { status: 400, payload: { ok: false, error: "Invalid power action" } };
  }
  if (confirmed !== true) {
    return {
      status: 409,
      payload: { ok: false, confirmationRequired: true, action },
    };
  }

  const result = action === "lock"
    ? await runCommand("/usr/bin/osascript", ["-e", LOCK_SCRIPT], 10_000)
    : await runCommand("/usr/bin/sudo", ["-n", POWER_HELPER, action], 20_000);

  return {
    status: result.ok ? 200 : 500,
    payload: {
      ok: result.ok,
      action,
      error: result.stderr || undefined,
    },
  };
}

async function runGatewayAction({ action, confirmed, runCommand }) {
  if (!["start", "stop"].includes(action)) {
    return { status: 400, payload: { ok: false, error: "Invalid gateway action" } };
  }
  if (confirmed !== true) {
    return {
      status: 409,
      payload: { ok: false, confirmationRequired: true, action },
    };
  }

  const args = action === "stop"
    ? ["gateway", "stop", "--disable", "--json"]
    : ["gateway", "start", "--json"];
  const result = await runCommand(OPENCLAW_BIN, args, 30_000);

  return {
    status: result.ok ? 200 : 500,
    payload: {
      ok: result.ok,
      action,
      error: result.stderr || undefined,
    },
  };
}

module.exports = {
  LOCK_SCRIPT,
  OPENCLAW_BIN,
  POWER_HELPER,
  runGatewayAction,
  runMacPowerAction,
};
