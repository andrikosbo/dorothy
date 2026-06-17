import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  appendRoutingDecisionLog,
  loadModelRoutingConfig,
  routeModel,
  type ModelRoutingConfig,
} from "./model-router.js";

let config: ModelRoutingConfig;
const tempDirs: string[] = [];

beforeAll(async () => {
  config = await loadModelRoutingConfig();
});

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("model router dry run", () => {
  it("routes inbox classification to the fast local model", () => {
    const decision = routeModel({ prompt: "Classify inbox emails as urgent, noise, or reply-needed." }, config);

    expect(decision).toMatchObject({
      selectedRoute: "fast_background",
      selectedModel: "ollama/qwen3.5:9b",
      riskLevel: "low",
      useGpt: false,
      useLocal: true,
      fallbackRequired: true,
      fallbackModel: "openai/gpt-4.1-mini",
      dryRun: true,
      routingEnabled: false,
    });
  });

  it("routes client-facing reply drafts to GPT before other matching rules", () => {
    const decision = routeModel({
      prompt: "Draft a reply to this client email about the payment integration code.",
      clientFacing: true,
    }, config);

    expect(decision.selectedRoute).toBe("high_risk");
    expect(decision.selectedModel).toBe("openai/gpt-4.1-mini");
    expect(decision.riskLevel).toBe("high");
    expect(decision.useGpt).toBe(true);
    expect(decision.fallbackRequired).toBe(false);
  });

  it("routes coding requests to the dedicated coding model", () => {
    const decision = routeModel({
      prompt: "Debug this TypeScript function and add unit tests.",
    }, config);

    expect(decision.selectedRoute).toBe("coding");
    expect(decision.selectedModel).toBe("ollama/qwen2.5-coder:32b");
    expect(decision.useLocal).toBe(true);
  });

  it("routes notification triage to the fast local model", () => {
    const decision = routeModel({
      prompt: "Triage these background notifications and label urgent versus noise.",
      background: true,
      notificationTriage: true,
    }, config);

    expect(decision.selectedRoute).toBe("fast_background");
    expect(decision.selectedModel).toBe("ollama/qwen3.5:9b");
  });

  it("routes inbox digest and prioritization to heavy local reasoning", () => {
    const decision = routeModel({
      prompt: "Create my daily inbox digest and tell me what I should do first.",
    }, config);

    expect(decision.selectedRoute).toBe("heavy_local");
    expect(decision.selectedModel).toBe("ollama/qwen3:14b");
    expect(decision.riskLevel).toBe("medium");
  });

  it("routes ambiguous requests conservatively to GPT", () => {
    const decision = routeModel({ prompt: "Handle this for me." }, config);

    expect(decision.selectedRoute).toBe("high_risk");
    expect(decision.selectedModel).toBe("openai/gpt-4.1-mini");
    expect(decision.routingReason).toContain("conservative default");
  });

  it("routes attachments and tool-use decisions to GPT", () => {
    expect(routeModel({ prompt: "Review this.", hasAttachments: true }, config).selectedRoute).toBe("high_risk");
    expect(routeModel({ prompt: "Choose the next action.", toolUseDecision: true }, config).selectedRoute).toBe("high_risk");
  });

  it("writes redacted JSONL without prompt or response text", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "dorothy-router-"));
    tempDirs.push(tempDir);
    const logConfig = { ...config, logPath: path.join(tempDir, "routing.jsonl") };
    const context = {
      prompt: "Sensitive client text that must never appear in logs.",
      clientFacing: true,
      trigger: "test",
      channelId: "telegram",
    };
    const decision = routeModel(context, logConfig);

    const logPath = await appendRoutingDecisionLog(context, decision, logConfig, {
      timestamp: "2026-06-07T20:00:00.000Z",
      runId: "run-test",
    });
    const raw = await fs.readFile(logPath, "utf8");
    const record = JSON.parse(raw.trim());

    expect(raw).not.toContain(context.prompt);
    expect(raw).not.toContain("response");
    expect(record).toMatchObject({
      runId: "run-test",
      promptLength: context.prompt.length,
      selectedRoute: "high_risk",
      selectedModel: "openai/gpt-4.1-mini",
      dryRun: true,
      routingEnabled: false,
    });
    expect(record.promptHash).toMatch(/^[a-f0-9]{16}$/);
  });
});
