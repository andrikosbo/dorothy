"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  LOCK_SCRIPT,
  OPENCLAW_BIN,
  POWER_HELPER,
  runGatewayAction,
  runMacPowerAction,
} = require("../system-control.js");

test("power actions require confirmation and reject unknown actions", async () => {
  const runCommand = async () => {
    throw new Error("must not run");
  };

  assert.equal((await runMacPowerAction({
    action: "shutdown",
    confirmed: false,
    runCommand,
  })).status, 409);
  assert.equal((await runMacPowerAction({
    action: "erase",
    confirmed: true,
    runCommand,
  })).status, 400);
});

test("lock uses the native macOS lock-screen shortcut", async () => {
  const calls = [];
  const result = await runMacPowerAction({
    action: "lock",
    confirmed: true,
    runCommand: async (...args) => {
      calls.push(args);
      return { ok: true, stdout: "", stderr: "" };
    },
  });

  assert.equal(result.status, 200);
  assert.deepEqual(calls[0], [
    "/usr/bin/osascript",
    ["-e", LOCK_SCRIPT],
    10_000,
  ]);
});

test("restart and shutdown use only the privileged power helper", async () => {
  const calls = [];
  await runMacPowerAction({
    action: "restart",
    confirmed: true,
    runCommand: async (...args) => {
      calls.push(args);
      return { ok: true, stdout: "", stderr: "" };
    },
  });

  assert.deepEqual(calls[0], [
    "/usr/bin/sudo",
    ["-n", POWER_HELPER, "restart"],
    20_000,
  ]);
});

test("gateway kill switch disables respawn and start restores the service", async () => {
  const calls = [];
  const runCommand = async (...args) => {
    calls.push(args);
    return { ok: true, stdout: "{}", stderr: "" };
  };

  await runGatewayAction({ action: "stop", confirmed: true, runCommand });
  await runGatewayAction({ action: "start", confirmed: true, runCommand });

  assert.deepEqual(calls, [
    [OPENCLAW_BIN, ["gateway", "stop", "--disable", "--json"], 30_000],
    [OPENCLAW_BIN, ["gateway", "start", "--json"], 30_000],
  ]);
});

test("control center exposes core Mac actions and authenticated endpoints", () => {
  const root = path.join(__dirname, "..");
  const html = fs.readFileSync(path.join(root, "public", "index.html"), "utf8");
  const app = fs.readFileSync(path.join(root, "public", "app.js"), "utf8");
  const server = fs.readFileSync(path.join(root, "server.js"), "utf8");

  for (const action of ["lock", "restart", "shutdown"]) {
    assert.match(html, new RegExp(`data-control-action="${action}"`));
  }
  assert.match(html, /id="gatewayControlBtn"/);
  assert.match(app, /\/api\/control-center\/status/);
  assert.match(app, /\/api\/system\/gateway/);
  assert.match(server, /url\.pathname === "\/api\/control-center\/status"/);
  assert.match(server, /url\.pathname === "\/api\/system\/gateway"/);
});
