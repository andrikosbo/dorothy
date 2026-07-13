"use strict";

const CHAT_MODES = Object.freeze([
  Object.freeze({
    id: "dorothy",
    label: "Dorothy",
    badge: "Dorothy mode",
    description: "Your personal assistant for organization, communications, and tasks.",
    sessionPrefix: "web",
    agent: "main",
    title: "New conversation",
    placeholder: "Talk or type to Dorothy…",
    modelSelection: false,
  }),
  Object.freeze({
    id: "ai",
    label: "AI",
    badge: "AI mode",
    description: "Everyday personal AI chat with Gemini or a local model.",
    sessionPrefix: "ai-web",
    agent: "ai",
    title: "New AI chat",
    placeholder: "Ask your personal AI…",
    modelSelection: true,
  }),
]);

const MODE_BY_ID = new Map(CHAT_MODES.map(mode => [mode.id, mode]));

function getChatMode(id) {
  return MODE_BY_ID.get(String(id || "").toLowerCase()) || MODE_BY_ID.get("dorothy");
}

function modeForSessionKey(value) {
  const key = String(value || "").trim();
  return CHAT_MODES.find(mode => {
    const prefixes = [mode.sessionPrefix, ...(mode.legacyPrefixes || [])];
    return prefixes.some(prefix => key.startsWith(`${prefix}-`) || key.startsWith(`${prefix}:`));
  }) || null;
}

function normalizeSessionKey(value) {
  const key = String(value || "").trim();
  if (!/^[a-zA-Z0-9:_-]{4,96}$/.test(key)) return "";
  return modeForSessionKey(key) ? key : "";
}

function publicChatModes() {
  return CHAT_MODES.map(({
    id,
    label,
    badge,
    description,
    title,
    placeholder,
    modelSelection,
  }) => ({
    id,
    label,
    badge,
    description,
    title,
    placeholder,
    modelSelection,
  }));
}

module.exports = {
  CHAT_MODES,
  getChatMode,
  modeForSessionKey,
  normalizeSessionKey,
  publicChatModes,
};
