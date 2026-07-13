import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type ModelRoute = "fast_background" | "heavy_local" | "coding" | "high_risk";
export type RiskLevel = "low" | "medium" | "high";

export type RoutingContext = {
  prompt: string;
  trigger?: string;
  channelId?: string;
  clientFacing?: boolean;
  sensitive?: boolean;
  externalAction?: boolean;
  toolUseDecision?: boolean;
  hasAttachments?: boolean;
  coding?: boolean;
  heavyReasoning?: boolean;
  prioritization?: boolean;
  background?: boolean;
  classification?: boolean;
  notificationTriage?: boolean;
  simpleSummary?: boolean;
};

type ContextFlag = Exclude<keyof RoutingContext, "prompt" | "trigger" | "channelId">;

type RouteConfig = {
  model: string;
  riskLevel: RiskLevel;
  use: "gpt" | "local";
  reason: string;
};

type RuleConfig = {
  patterns: string[];
  contextFlags: ContextFlag[];
};

export type ModelRoutingConfig = {
  version: number;
  enabled: boolean;
  defaultRoute: ModelRoute;
  fallbackModel: string;
  logPath: string;
  routes: Record<ModelRoute, RouteConfig>;
  rules: {
    highRisk: RuleConfig;
    coding: RuleConfig;
    heavyLocal: RuleConfig;
    fastBackground: RuleConfig;
  };
};

export type RoutingDecision = {
  selectedRoute: ModelRoute;
  selectedModel: string;
  routingReason: string;
  riskLevel: RiskLevel;
  useGpt: boolean;
  useLocal: boolean;
  fallbackRequired: boolean;
  fallbackModel: string | null;
  dryRun: true;
  routingEnabled: boolean;
};

export type RoutingLogContext = {
  timestamp?: string;
  runId?: string;
  trigger?: string;
  channelId?: string;
};

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROUTING_CONFIG_PATH = path.resolve(MODULE_DIR, "../../backend/config/model-routing.json");

const ROUTE_ORDER: Array<{
  route: ModelRoute;
  configKey: keyof ModelRoutingConfig["rules"];
  label: string;
}> = [
  { route: "high_risk", configKey: "highRisk", label: "high-risk rule" },
  { route: "coding", configKey: "coding", label: "coding rule" },
  { route: "heavy_local", configKey: "heavyLocal", label: "heavy-local rule" },
  { route: "fast_background", configKey: "fastBackground", label: "fast-background rule" },
];

function assertString(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Invalid model routing config: ${field} must be a non-empty string`);
  }
}

function validateConfig(value: unknown): ModelRoutingConfig {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid model routing config: expected an object");
  }

  const config = value as ModelRoutingConfig;
  if (config.version !== 1) throw new Error("Invalid model routing config: unsupported version");
  if (typeof config.enabled !== "boolean") throw new Error("Invalid model routing config: enabled must be boolean");
  if (!ROUTE_ORDER.some(({ route }) => route === config.defaultRoute)) {
    throw new Error("Invalid model routing config: unknown defaultRoute");
  }
  assertString(config.fallbackModel, "fallbackModel");
  assertString(config.logPath, "logPath");

  for (const { route, configKey } of ROUTE_ORDER) {
    const routeConfig = config.routes?.[route];
    if (!routeConfig) throw new Error(`Invalid model routing config: missing route ${route}`);
    assertString(routeConfig.model, `routes.${route}.model`);
    assertString(routeConfig.reason, `routes.${route}.reason`);
    if (!["low", "medium", "high"].includes(routeConfig.riskLevel)) {
      throw new Error(`Invalid model routing config: bad risk level for ${route}`);
    }
    if (!["gpt", "local"].includes(routeConfig.use)) {
      throw new Error(`Invalid model routing config: bad use value for ${route}`);
    }

    const rule = config.rules?.[configKey];
    if (!rule || !Array.isArray(rule.patterns) || !Array.isArray(rule.contextFlags)) {
      throw new Error(`Invalid model routing config: missing rule ${configKey}`);
    }
    for (const pattern of rule.patterns) {
      assertString(pattern, `rules.${configKey}.patterns`);
      new RegExp(pattern, "iu");
    }
  }

  return config;
}

export async function loadModelRoutingConfig(
  configPath = DEFAULT_ROUTING_CONFIG_PATH,
): Promise<ModelRoutingConfig> {
  const raw = await fs.readFile(configPath, "utf8");
  return validateConfig(JSON.parse(raw));
}

function matchRule(
  context: RoutingContext,
  rule: RuleConfig,
): { matched: boolean; detail?: string } {
  for (const flag of rule.contextFlags) {
    if (context[flag] === true) return { matched: true, detail: `context flag '${flag}'` };
  }

  const prompt = context.prompt.trim();
  for (const pattern of rule.patterns) {
    if (new RegExp(pattern, "iu").test(prompt)) {
      return { matched: true, detail: `configured prompt pattern '${pattern}'` };
    }
  }

  return { matched: false };
}

export function routeModel(
  context: RoutingContext,
  config: ModelRoutingConfig,
): RoutingDecision {
  const prompt = context.prompt?.trim() || "";
  const normalizedContext: RoutingContext = {
    ...context,
    prompt,
    hasAttachments: context.hasAttachments === true,
  };

  let selectedRoute = config.defaultRoute;
  let matchedReason = "No specific rule matched; using the conservative default route.";

  for (const candidate of ROUTE_ORDER) {
    const match = matchRule(normalizedContext, config.rules[candidate.configKey]);
    if (!match.matched) continue;
    selectedRoute = candidate.route;
    matchedReason = `Matched ${candidate.label} via ${match.detail}.`;
    break;
  }

  const selected = config.routes[selectedRoute];
  const useLocal = selected.use === "local";

  return {
    selectedRoute,
    selectedModel: selected.model,
    routingReason: `${matchedReason} ${selected.reason}`,
    riskLevel: selected.riskLevel,
    useGpt: selected.use === "gpt",
    useLocal,
    fallbackRequired: useLocal,
    fallbackModel: useLocal ? config.fallbackModel : null,
    dryRun: true,
    routingEnabled: config.enabled,
  };
}

export async function routeModelFromConfig(
  context: RoutingContext,
  configPath = DEFAULT_ROUTING_CONFIG_PATH,
): Promise<RoutingDecision> {
  const config = await loadModelRoutingConfig(configPath);
  return routeModel(context, config);
}

function expandHome(filePath: string) {
  if (filePath === "~") return os.homedir();
  if (filePath.startsWith("~/")) return path.join(os.homedir(), filePath.slice(2));
  return filePath;
}

function hashPrompt(prompt: string) {
  return createHash("sha256").update(prompt, "utf8").digest("hex").slice(0, 16);
}

export async function appendRoutingDecisionLog(
  context: RoutingContext,
  decision: RoutingDecision,
  config: ModelRoutingConfig,
  logContext: RoutingLogContext = {},
): Promise<string> {
  const logPath = expandHome(config.logPath);
  const record = {
    timestamp: logContext.timestamp ?? new Date().toISOString(),
    runId: logContext.runId ?? null,
    trigger: logContext.trigger ?? context.trigger ?? null,
    channelId: logContext.channelId ?? context.channelId ?? null,
    promptHash: hashPrompt(context.prompt || ""),
    promptLength: (context.prompt || "").length,
    selectedRoute: decision.selectedRoute,
    selectedModel: decision.selectedModel,
    routingReason: decision.routingReason,
    riskLevel: decision.riskLevel,
    useGpt: decision.useGpt,
    useLocal: decision.useLocal,
    fallbackRequired: decision.fallbackRequired,
    fallbackModel: decision.fallbackModel,
    dryRun: true,
    routingEnabled: decision.routingEnabled,
  };

  await fs.mkdir(path.dirname(logPath), { recursive: true });
  await fs.appendFile(logPath, `${JSON.stringify(record)}\n`, "utf8");
  return logPath;
}
