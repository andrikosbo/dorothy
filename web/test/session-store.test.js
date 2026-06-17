"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");

const { deleteStoredSession } = require("../session-store.js");

test("deletes one stored session and its bounded transcript", () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "dorothy-session-"));
  const sessionDir = path.join(homeDir, ".openclaw", "agents", "main", "sessions");
  fs.mkdirSync(sessionDir, { recursive: true });
  const transcript = path.join(sessionDir, "session-one.jsonl");
  fs.writeFileSync(transcript, '{"message":{"role":"user"}}\n', "utf8");
  fs.writeFileSync(path.join(sessionDir, "sessions.json"), JSON.stringify({
    "agent:main:web-one": {
      sessionId: "session-one",
      sessionFile: transcript,
    },
    "agent:main:web-two": {
      sessionId: "session-two",
    },
  }), "utf8");

  const result = deleteStoredSession({
    homeDir,
    agentId: "main",
    key: "web-one",
  });
  const store = JSON.parse(fs.readFileSync(path.join(sessionDir, "sessions.json"), "utf8"));

  assert.deepEqual(result, { found: true, transcriptDeleted: true });
  assert.equal(fs.existsSync(transcript), false);
  assert.equal(store["agent:main:web-one"], undefined);
  assert.ok(store["agent:main:web-two"]);
  fs.rmSync(homeDir, { recursive: true, force: true });
});

test("never deletes a transcript path outside the agent session directory", () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "dorothy-session-"));
  const sessionDir = path.join(homeDir, ".openclaw", "agents", "main", "sessions");
  fs.mkdirSync(sessionDir, { recursive: true });
  const outside = path.join(homeDir, "outside.jsonl");
  fs.writeFileSync(outside, "keep", "utf8");
  fs.writeFileSync(path.join(sessionDir, "sessions.json"), JSON.stringify({
    "agent:main:web-unsafe": {
      sessionId: "session-unsafe",
      sessionFile: outside,
    },
  }), "utf8");

  const result = deleteStoredSession({
    homeDir,
    agentId: "main",
    key: "web-unsafe",
  });

  assert.deepEqual(result, { found: true, transcriptDeleted: false });
  assert.equal(fs.readFileSync(outside, "utf8"), "keep");
  fs.rmSync(homeDir, { recursive: true, force: true });
});
