const BUILD_VERSION = "3.3.0";

const els = {
  loginPanel:        document.getElementById("loginPanel"),
  chatPanel:         document.getElementById("chatPanel"),
  workspacePanel:    document.getElementById("workspacePanel"),
  financePanel:      document.getElementById("financePanel"),
  financeContent:    document.getElementById("financeContent"),
  financeStatus:     document.getElementById("financeStatus"),
  financeYear:       document.getElementById("financeYear"),
  refreshFinanceBtn: document.getElementById("refreshFinanceBtn"),
  financeSyncMeta:   document.getElementById("financeSyncMeta"),
  syncBanksBtn:      document.getElementById("syncBanksBtn"),
  bankSyncMeta:      document.getElementById("bankSyncMeta"),
  bankCashBalance:   document.getElementById("bankCashBalance"),
  bankAccountsMeta:  document.getElementById("bankAccountsMeta"),
  bankInflows:       document.getElementById("bankInflows"),
  bankOutflows:      document.getElementById("bankOutflows"),
  bankNetFlow:       document.getElementById("bankNetFlow"),
  bankTransactionsMeta:document.getElementById("bankTransactionsMeta"),
  bankAccountsList:  document.getElementById("bankAccountsList"),
  bankCategoriesList:document.getElementById("bankCategoriesList"),
  bankTransactionsList:document.getElementById("bankTransactionsList"),
  portfolioTotalValue:document.getElementById("portfolioTotalValue"),
  portfolioDayChange: document.getElementById("portfolioDayChange"),
  portfolioMarketStatus:document.getElementById("portfolioMarketStatus"),
  portfolioMeta:      document.getElementById("portfolioMeta"),
  portfolioPositions: document.getElementById("portfolioPositions"),
  sidebarChatNav:    document.getElementById("sidebarChatNav"),
  sidebarFinanceNav: document.getElementById("sidebarFinanceNav"),
  tokenInput:        document.getElementById("tokenInput"),
  saveTokenBtn:      document.getElementById("saveTokenBtn"),
  loginError:        document.getElementById("loginError"),
  connectionStatus:  document.getElementById("connectionStatus"),
  connectionLabel:   document.getElementById("connectionLabel"),
  messages:          document.getElementById("messages"),
  chatForm:          document.getElementById("chatForm"),
  messageInput:      document.getElementById("messageInput"),
  voiceBtn:          document.getElementById("voiceBtn"),
  newChatBtn:        document.getElementById("newChatBtn"),
  sidebarNewChatBtn: document.getElementById("sidebarNewChatBtn"),
  menuBtn:           document.getElementById("menuBtn"),
  closeSidebarBtn:   document.getElementById("closeSidebarBtn"),
  sidebar:           document.getElementById("sidebar"),
  sidebarScrim:      document.getElementById("sidebarScrim"),
  sessionList:       document.getElementById("sessionList"),
  conversationTitle:document.getElementById("conversationTitle"),
  conversationMode: document.getElementById("conversationMode"),
  modeDialog:        document.getElementById("modeDialog"),
  modeForm:          document.getElementById("modeForm"),
  modeOptions:       document.getElementById("modeOptions"),
  aiModelField:      document.getElementById("aiModelField"),
  aiModelSelect:     document.getElementById("aiModelSelect"),
  closeModeDialogBtn:document.getElementById("closeModeDialogBtn"),
  cancelModeBtn:     document.getElementById("cancelModeBtn"),
  settingsBtn:       document.getElementById("settingsBtn"),
  controlCenterBtn:  document.getElementById("controlCenterBtn"),
  controlCenter:     document.getElementById("controlCenter"),
  controlCenterSummary:document.getElementById("controlCenterSummary"),
  controlCenterState:document.getElementById("controlCenterState"),
  gatewayControlBtn: document.getElementById("gatewayControlBtn"),
  controlConfirm:    document.getElementById("controlConfirm"),
  controlConfirmTitle:document.getElementById("controlConfirmTitle"),
  controlConfirmText:document.getElementById("controlConfirmText"),
  cancelControlBtn:  document.getElementById("cancelControlBtn"),
  confirmControlBtn: document.getElementById("confirmControlBtn"),
  controlCenterStatus:document.getElementById("controlCenterStatus"),
  closeSettingsBtn:  document.getElementById("closeSettingsBtn"),
  cancelSettingsBtn: document.getElementById("cancelSettingsBtn"),
  settingsDialog:    document.getElementById("settingsDialog"),
  settingsTokenInput:document.getElementById("settingsTokenInput"),
  ttsToggle:         document.getElementById("ttsToggle"),
  ttsEngineSelect:   document.getElementById("ttsEngineSelect"),
  greekVoiceSelect:  document.getElementById("greekVoiceSelect"),
  englishVoiceSelect:document.getElementById("englishVoiceSelect"),
  speechRate:        document.getElementById("speechRate"),
  speechRateLabel:   document.getElementById("speechRateLabel"),
  pushToTalkToggle:  document.getElementById("pushToTalkToggle"),
  saveSettingsBtn:   document.getElementById("saveSettingsBtn"),

  quickActionsToggle:document.getElementById("quickActionsToggle"),
  browserTtsSettings:document.getElementById("browserTtsSettings"),
  aboutEngine:       document.getElementById("aboutEngine"),
  aboutSession:      document.getElementById("aboutSession"),
  macSchedule:       document.getElementById("macSchedule"),
  refreshMacBtn:     document.getElementById("refreshMacBtn"),
  refreshSystemBtn:  document.getElementById("refreshSystemBtn"),
  systemReadiness:   document.getElementById("systemReadiness"),
  systemReadinessSummary:document.getElementById("systemReadinessSummary"),
  bootAutomationStatus:document.getElementById("bootAutomationStatus"),
  applicationInput:  document.getElementById("applicationInput"),
  runningApplications:document.getElementById("runningApplications"),
  macActionStatus:   document.getElementById("macActionStatus"),
  elorusApiKey:      document.getElementById("elorusApiKey"),
  elorusOrganizationId:document.getElementById("elorusOrganizationId"),
  elorusApiKeyHint:  document.getElementById("elorusApiKeyHint"),
  elorusStatus:      document.getElementById("elorusStatus"),
  saveElorusBtn:     document.getElementById("saveElorusBtn"),
  geminiApiKey:      document.getElementById("geminiApiKey"),
  geminiApiKeyHint:  document.getElementById("geminiApiKeyHint"),
  geminiStatus:      document.getElementById("geminiStatus"),
  saveGeminiBtn:     document.getElementById("saveGeminiBtn"),
  quickActionsEl:    document.querySelector(".quick-actions"),
  sendBtn:           document.querySelector("#chatForm .send"),
  metricRevenue:     document.getElementById("metricRevenue"),
  metricRevenueMeta: document.getElementById("metricRevenueMeta"),
  metricDirectCosts: document.getElementById("metricDirectCosts"),
  metricCostsMeta:   document.getElementById("metricCostsMeta"),
  metricGrossProfit: document.getElementById("metricGrossProfit"),
  metricGrossMargin: document.getElementById("metricGrossMargin"),
  metricOperatingResult:document.getElementById("metricOperatingResult"),
  metricOperatingMargin:document.getElementById("metricOperatingMargin"),
  metricTaxOutflows: document.getElementById("metricTaxOutflows"),
  financeChart:      document.getElementById("financeChart"),
  financeCategories: document.getElementById("financeCategories"),
  renewalsList:      document.getElementById("renewalsList"),
  renewalsCount:     document.getElementById("renewalsCount"),
  qualityItems:      document.getElementById("qualityItems"),
  qualityItemsBar:   document.getElementById("qualityItemsBar"),
  qualityCosts:      document.getElementById("qualityCosts"),
  qualityCostsBar:   document.getElementById("qualityCostsBar"),
  qualityNote:       document.getElementById("qualityNote"),
};

const FALLBACK_CHAT_MODES = [
  {
    id: "dorothy",
    label: "Dorothy",
    badge: "Dorothy mode",
    description: "Your personal assistant for organization, communications, and actions.",
    title: "New conversation",
    placeholder: "Talk or type to Dorothy…",
    modelSelection: false,
  },
  {
    id: "ai",
    label: "AI",
    badge: "AI mode",
    description: "Everyday personal AI chat with Gemini or a local model.",
    title: "New AI chat",
    placeholder: "Ask your personal AI…",
    modelSelection: true,
  },
];

const state = {
  token:        localStorage.getItem("dorothy_token") || "",
  tts:          localStorage.getItem("dorothy_tts") === "1",
  ttsEngine:    localStorage.getItem("dorothy_tts_engine") || "edge-tts",
  sessionKey:   localStorage.getItem("dorothy_session") || newSessionKey(),
  greekVoice:   localStorage.getItem("dorothy_greek_voice") || "",
  englishVoice: localStorage.getItem("dorothy_english_voice") || "",
  speechRate:   parseFloat(localStorage.getItem("dorothy_speech_rate") || "1"),
  pushToTalk:   localStorage.getItem("dorothy_push_to_talk") === "1",

  showQuickActions: localStorage.getItem("dorothy_show_quick_actions") !== "0",
  busy:         false,
  speaking:     false,
  systemReady:  null,
  systemStatus: null,
  sessions:     [],
  sessionTitle: "New conversation",
  mode:          modeFromSessionKey(localStorage.getItem("dorothy_session")),
  model:         "",
  chatModes:     FALLBACK_CHAT_MODES,
  aiModels:      [],
  elorusLoaded:  false,
  geminiLoaded:  false,
  view:          "chat",
  financeLoaded: false,
  financeData:   null,
  bankData:      null,
  portfolioData: null,
  gatewayOnline: null,
  pendingControl: null,
};

// One-time migration (2026-06): move Dorothy to the natural neural voice
// (edge-tts / el-GR-AthinaNeural, single voice for Greek + English, free)
// instead of robotic system voices, and enable read-aloud by default.
if (!localStorage.getItem("dorothy_voice_v2")) {
  const prevEngine = localStorage.getItem("dorothy_tts_engine");
  if (!prevEngine || prevEngine === "browser" || prevEngine === "server") {
    state.ttsEngine = "edge-tts";
    localStorage.setItem("dorothy_tts_engine", "edge-tts");
  }
  if (localStorage.getItem("dorothy_tts") === null) {
    state.tts = true;
    localStorage.setItem("dorothy_tts", "1");
  }
  localStorage.setItem("dorothy_voice_v2", "1");
}

function setSpeaking(on) {
  state.speaking = on;
  els.voiceBtn.classList.toggle("speaking", on);
  window.dispatchEvent(new CustomEvent("dorothy:speaking", { detail: { on } }));
}

let recording = false;
let recognition = null;
let voiceTranscript = "";
const isIOS = /(iPad|iPhone|iPod)/.test(navigator.userAgent) ||
              (navigator.maxTouchPoints > 1 && /MacIntel/.test(navigator.platform));
localStorage.setItem("dorothy_session", state.sessionKey);

let _audioCtx = null;

function ensureAudioCtx() {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (_audioCtx.state === "suspended") _audioCtx.resume();
}

init();
void ensureLatestBuild();

async function ensureLatestBuild() {
  try {
    const response = await fetch(`/api/health?build=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) return;
    const health = await response.json();
    if (!health.version || health.version === BUILD_VERSION) return;

    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("dorothy-"))
          .map((key) => caches.delete(key))
      );
    }

    const next = new URL(window.location.href);
    next.searchParams.set("dorothy-build", health.version);
    window.location.replace(next);
  } catch {
    // Stay usable when the Mac or Tailscale connection is temporarily offline.
  }
}

// ─── session ────────────────────────────────────────────────────────────────

function newSessionKey() {
  return "web-" + Math.random().toString(36).slice(2, 10);
}

function modeFromSessionKey(key) {
  const value = String(key || "");
  if (value.startsWith("ai-web")) return "ai";
  return "dorothy";
}

function getMode(id = state.mode) {
  return state.chatModes.find(mode => mode.id === id)
    || FALLBACK_CHAT_MODES.find(mode => mode.id === id)
    || FALLBACK_CHAT_MODES[0];
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function selectedAiModel() {
  return els.aiModelSelect.value || state.aiModels[0]?.id || "google/gemini-2.5-flash";
}

async function createSession(mode = "dorothy", model = "") {
  if (state.busy) return;
  try {
    const res = await apiFetch("/api/sessions/new", {
      method: "POST",
      body: JSON.stringify({ mode, model }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not create session");
    const session = data.session;
    state.sessions = [session, ...state.sessions.filter(item => item.key !== session.key)];
    await openSession(session.key, session);
  } catch {
    const prefixes = { dorothy: "web", ai: "ai-web", x: "x-web" };
    const selectedMode = getMode(mode);
    const key = `${prefixes[mode] || "web"}-${Math.random().toString(36).slice(2, 10)}`;
    const session = {
      key,
      title: selectedMode.title,
      mode,
      model,
      updatedAt: Date.now(),
      pending: true,
    };
    state.sessions = [session, ...state.sessions];
    await openSession(key, session);
  }
}

async function resetSession() {
  return openModeDialog();
}

async function loadChatModes() {
  try {
    const res = await apiFetch("/api/chat-modes");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Modes unavailable");
    if (Array.isArray(data.modes) && data.modes.length) state.chatModes = data.modes;
    if (Array.isArray(data.aiModels)) state.aiModels = data.aiModels;
  } catch {
    state.chatModes = FALLBACK_CHAT_MODES;
    state.aiModels = [
      { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash", provider: "Google API" },
      { id: "ollama/qwen3.5:9b", name: "qwen3.5:9b" },
      { id: "ollama/qwen3:14b", name: "qwen3:14b" },
    ];
  }
  renderModeOptions();
}

function renderModeOptions() {
  els.modeOptions.innerHTML = "";
  state.chatModes.forEach((mode, index) => {
    const label = document.createElement("label");
    label.className = `mode-option mode-${mode.id}`;
    label.innerHTML = `
      <input type="radio" name="chatMode" value="${mode.id}" ${index === 0 ? "checked" : ""}>
      <span class="mode-option-mark" aria-hidden="true">${mode.id === "dorothy" ? "D" : mode.label}</span>
      <span class="mode-option-copy">
        <strong>${escapeHtml(mode.label)}</strong>
        <small>${escapeHtml(mode.description)}</small>
      </span>
      <span class="mode-option-check" aria-hidden="true"></span>
    `;
    label.querySelector("input").addEventListener("change", updateModeDialogState);
    els.modeOptions.appendChild(label);
  });

  els.aiModelSelect.innerHTML = "";
  state.aiModels.forEach(model => {
    const option = document.createElement("option");
    option.value = model.id;
    option.textContent = model.provider
      ? `${model.name || model.id} · ${model.provider}`
      : model.name || model.id.replace(/^ollama\//, "");
    els.aiModelSelect.appendChild(option);
  });
  updateModeDialogState();
}

function updateModeDialogState() {
  const selected = els.modeForm.querySelector('input[name="chatMode"]:checked')?.value || "dorothy";
  els.aiModelField.classList.toggle("hidden", selected !== "ai");
}

function openModeDialog() {
  if (state.busy) return;
  closeSidebar();
  renderModeOptions();
  els.modeDialog.showModal();
}

function closeModeDialog() {
  if (els.modeDialog.open) els.modeDialog.close();
}

// ─── settings tabs ────────────────────────────────────────────────────────────

function setupSettingsTabs() {
  document.querySelectorAll(".settings-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".settings-tab").forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".settings-panel").forEach(p => p.classList.remove("active"));
      tab.classList.add("active");
      els.settingsDialog.classList.toggle(
        "integration-tab-active",
        tab.dataset.tab === "elorus" || tab.dataset.tab === "gemini",
      );
      const panel = document.getElementById("panel-" + tab.dataset.tab);
      if (panel) panel.classList.add("active");
      if (tab.dataset.tab === "mac") loadMacStatus();
      if (tab.dataset.tab === "elorus") loadElorusSettings();
      if (tab.dataset.tab === "gemini") loadGeminiSettings();
    });
  });
}

// ─── init ───────────────────────────────────────────────────────────────────

function init() {
  els.ttsToggle.checked = state.tts;
  els.ttsEngineSelect.value = state.ttsEngine;
  els.pushToTalkToggle.checked = state.pushToTalk;
  if (els.quickActionsToggle) els.quickActionsToggle.checked = state.showQuickActions;

  if (state.token) validateAndEnter(state.token);
  else showLogin();

  els.saveTokenBtn.addEventListener("click", async () => {
    const token = els.tokenInput.value.trim();
    if (!token) return;
    await validateAndEnter(token);
  });
  els.tokenInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") els.saveTokenBtn.click();
  });

  els.chatForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = els.messageInput.value.trimEnd();
    if (!text.trim() || state.busy) return;
    els.messageInput.value = "";
    autoGrow();
    await sendMessage(text);
  });

  els.messageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      els.chatForm.dispatchEvent(new Event("submit", { cancelable: true }));
    }
  });

  els.messageInput.addEventListener("input", autoGrow);

  document.querySelectorAll("[data-prompt]").forEach(btn =>
    btn.addEventListener("click", () => {
      if (!state.busy) sendMessage(btn.dataset.prompt);
    })
  );

  document.querySelectorAll("[data-comms]").forEach(btn =>
    btn.addEventListener("click", () => {
      if (!state.busy) showCommunications(btn.dataset.comms);
    })
  );

  els.newChatBtn.addEventListener("click", resetSession);
  els.sidebarNewChatBtn.addEventListener("click", resetSession);
  els.closeModeDialogBtn.addEventListener("click", closeModeDialog);
  els.cancelModeBtn.addEventListener("click", closeModeDialog);
  els.modeDialog.addEventListener("click", (event) => {
    if (event.target === els.modeDialog) closeModeDialog();
  });
  els.modeForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const mode = els.modeForm.querySelector('input[name="chatMode"]:checked')?.value || "dorothy";
    const model = mode === "ai" ? selectedAiModel() : "";
    closeModeDialog();
    await createSession(mode, model);
  });
  els.sidebarChatNav.addEventListener("click", () => showView("chat"));
  els.sidebarFinanceNav.addEventListener("click", () => showView("finance"));
  els.refreshFinanceBtn.addEventListener("click", syncAndLoadFinance);
  els.syncBanksBtn.addEventListener("click", syncAndLoadBanking);
  els.financeYear.addEventListener("change", () => loadFinance(true));
  els.menuBtn.addEventListener("click", openSidebar);
  els.closeSidebarBtn.addEventListener("click", closeSidebar);
  els.sidebarScrim.addEventListener("click", closeSidebar);
  window.addEventListener("resize", () => {
    if (window.innerWidth > 800) closeSidebar();
  }, { passive: true });

  // ── voice setup ───────────────────────────────────────────────────────

  setupVoiceButton();
  loadVoices();
  els.speechRate.value = state.speechRate;
  els.speechRateLabel.textContent = state.speechRate.toFixed(1) + "×";
  els.speechRate.addEventListener("input", () => {
    els.speechRateLabel.textContent = els.speechRate.value + "×";
  });
  els.ttsEngineSelect.value = state.ttsEngine;
  toggleTtsEngineUI(state.ttsEngine);
  els.ttsEngineSelect.addEventListener("change", (e) => {
    toggleTtsEngineUI(e.target.value);
  });

  // ── settings tabs ─────────────────────────────────────────────────────

  setupSettingsTabs();

  // ── settings dialog ───────────────────────────────────────────────────

  els.settingsBtn.addEventListener("click", () => {
    els.settingsTokenInput.value = state.token;
    els.ttsToggle.checked = state.tts;
    els.ttsEngineSelect.value = state.ttsEngine;
    toggleTtsEngineUI(state.ttsEngine);
    els.pushToTalkToggle.checked = state.pushToTalk;
    els.speechRate.value = state.speechRate;
    els.speechRateLabel.textContent = state.speechRate.toFixed(1) + "×";
    els.quickActionsToggle.checked = state.showQuickActions;
    els.aboutEngine.textContent = state.ttsEngine;
    els.aboutSession.textContent = state.sessionKey;
    // Reset to first tab
    document.querySelectorAll(".settings-tab").forEach((t, i) => {
      t.classList.toggle("active", i === 0);
    });
    document.querySelectorAll(".settings-panel").forEach((p, i) => {
      p.classList.toggle("active", i === 0);
    });
    els.settingsDialog.classList.remove("integration-tab-active");
    els.settingsDialog.showModal();
  });

  els.closeSettingsBtn.addEventListener("click", () => {
    els.settingsDialog.close();
  });
  els.cancelSettingsBtn.addEventListener("click", () => {
    els.settingsDialog.close();
  });

  els.refreshMacBtn.addEventListener("click", loadMacStatus);
  els.refreshSystemBtn.addEventListener("click", checkSystemStatus);
  els.saveElorusBtn.addEventListener("click", saveElorusSettings);
  els.saveGeminiBtn.addEventListener("click", saveGeminiSettings);
  document.querySelectorAll("[data-app-action]").forEach(button => {
    button.addEventListener("click", () => controlMacApplication(button.dataset.appAction));
  });
  document.querySelectorAll("[data-power-action]").forEach(button => {
    button.addEventListener("click", () => controlMacPower(button.dataset.powerAction));
  });
  els.controlCenterBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleControlCenter();
  });
  els.controlCenter.addEventListener("click", event => event.stopPropagation());
  document.querySelectorAll("[data-control-kind][data-control-action]").forEach(button => {
    button.addEventListener("click", () => {
      requestControlAction(button.dataset.controlKind, button.dataset.controlAction);
    });
  });
  els.cancelControlBtn.addEventListener("click", cancelControlAction);
  els.confirmControlBtn.addEventListener("click", executeControlAction);
  document.addEventListener("click", closeControlCenter);
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeControlCenter();
  });

  els.saveSettingsBtn.addEventListener("click", () => {
    state.token = els.settingsTokenInput.value.trim();
    state.tts   = els.ttsToggle.checked;
    state.ttsEngine = els.ttsEngineSelect.value;
    state.greekVoice = els.greekVoiceSelect.value;
    state.englishVoice = els.englishVoiceSelect.value;
    state.speechRate = parseFloat(els.speechRate.value) || 1;
    state.pushToTalk = els.pushToTalkToggle.checked;
    state.showQuickActions = els.quickActionsToggle.checked;

    localStorage.setItem("dorothy_token",         state.token);
    localStorage.setItem("dorothy_tts",           state.tts ? "1" : "0");
    localStorage.setItem("dorothy_tts_engine",    state.ttsEngine);
    localStorage.setItem("dorothy_greek_voice",   state.greekVoice);
    localStorage.setItem("dorothy_english_voice", state.englishVoice);
    localStorage.setItem("dorothy_speech_rate",   String(state.speechRate));
    localStorage.setItem("dorothy_push_to_talk",  state.pushToTalk ? "1" : "0");
    localStorage.setItem("dorothy_show_quick_actions", state.showQuickActions ? "1" : "0");

    els.quickActionsEl.classList.toggle("hidden", state.mode !== "dorothy" || !state.showQuickActions);
    setupVoiceButton();
  });

  // ── quick actions visibility ──────────────────────────────────────────

  els.quickActionsEl.classList.toggle("hidden", state.mode !== "dorothy" || !state.showQuickActions);

  window.setInterval(() => {
    if (!document.hidden && state.token) checkSystemStatus({ quiet: true });
  }, 60_000);

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && state.token) checkSystemStatus({ quiet: true });
  });
}

async function loadElorusSettings() {
  els.elorusStatus.className = "integration-status";
  els.elorusStatus.textContent = "Checking secure storage…";
  try {
    const res = await apiFetch("/api/integrations/elorus");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load Elorus settings.");
    state.elorusLoaded = true;
    els.elorusApiKey.value = "";
    els.elorusApiKey.placeholder = data.apiKeyConfigured
      ? "Saved — leave blank to keep it"
      : "Paste the API key";
    els.elorusApiKeyHint.textContent = data.apiKeyConfigured
      ? "ELORUS_API_KEY is stored in the macOS Keychain."
      : "No ELORUS_API_KEY stored.";
    els.elorusOrganizationId.value = data.organizationId || "";
    els.elorusStatus.textContent = data.apiKeyConfigured && data.organizationId
      ? "The connection is configured."
      : "Fill in and save both fields.";
  } catch (error) {
    els.elorusStatus.className = "integration-status error";
    els.elorusStatus.textContent = error.message;
  }
}

async function saveElorusSettings() {
  const apiKey = els.elorusApiKey.value.trim();
  const organizationId = els.elorusOrganizationId.value.trim();
  els.saveElorusBtn.disabled = true;
  els.saveElorusBtn.textContent = "Saving…";
  els.elorusStatus.className = "integration-status";
  els.elorusStatus.textContent = "";

  try {
    const res = await apiFetch("/api/integrations/elorus", {
      method: "POST",
      body: JSON.stringify({ apiKey, organizationId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Saving failed.");
    els.elorusApiKey.value = "";
    els.elorusOrganizationId.value = data.organizationId || organizationId;
    els.elorusApiKey.placeholder = "Saved — leave blank to keep it";
    els.elorusApiKeyHint.textContent = "ELORUS_API_KEY is stored in the macOS Keychain.";
    els.elorusStatus.className = "integration-status success";
    els.elorusStatus.textContent = "Elorus credentials saved securely.";
  } catch (error) {
    els.elorusStatus.className = "integration-status error";
    els.elorusStatus.textContent = error.message;
  } finally {
    els.saveElorusBtn.disabled = false;
    els.saveElorusBtn.textContent = "Save to Keychain";
  }
}

async function loadGeminiSettings() {
  els.geminiStatus.className = "integration-status";
  els.geminiStatus.textContent = "Checking Gemini…";
  try {
    const res = await apiFetch("/api/integrations/gemini");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load Gemini settings.");
    state.geminiLoaded = true;
    els.geminiApiKey.value = "";
    els.geminiApiKey.placeholder = data.apiKeyConfigured
      ? "Saved — leave blank to keep it"
      : "AIza…";
    els.geminiApiKeyHint.textContent = data.apiKeyConfigured
      ? "The API key is configured in the Keychain and OpenClaw."
      : "Paste a Gemini API key starting with AIza.";
    els.geminiStatus.textContent = data.apiKeyConfigured
      ? "Gemini 2.5 Flash is available in new AI chats."
      : "No Gemini API key stored.";
  } catch (error) {
    els.geminiStatus.className = "integration-status error";
    els.geminiStatus.textContent = error.message;
  }
}

async function saveGeminiSettings() {
  const apiKey = els.geminiApiKey.value.trim();
  els.saveGeminiBtn.disabled = true;
  els.saveGeminiBtn.textContent = "Activating…";
  els.geminiStatus.className = "integration-status";
  els.geminiStatus.textContent = "";

  try {
    const res = await apiFetch("/api/integrations/gemini", {
      method: "POST",
      body: JSON.stringify({ apiKey }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Activation failed.");
    els.geminiApiKey.value = "";
    els.geminiApiKey.placeholder = "Saved — leave blank to keep it";
    els.geminiApiKeyHint.textContent = "The API key is configured in the Keychain and OpenClaw.";
    els.geminiStatus.className = "integration-status success";
    els.geminiStatus.textContent = "Gemini is activated. Open a new AI chat.";
    await loadChatModes();
  } catch (error) {
    els.geminiStatus.className = "integration-status error";
    els.geminiStatus.textContent = error.message;
  } finally {
    els.saveGeminiBtn.disabled = false;
    els.saveGeminiBtn.textContent = "Save and activate";
  }
}

async function loadMacStatus() {
  els.macSchedule.textContent = "Loading…";
  els.macActionStatus.textContent = "";
  try {
    const [macResponse] = await Promise.all([
      apiFetch("/api/mac/status"),
      checkSystemStatus(),
    ]);
    const data = await macResponse.json();
    if (!macResponse.ok) throw new Error(data.error || "Status unavailable");
    els.macSchedule.textContent = data.scheduleSummary || data.schedule || "No scheduled wake.";
    els.runningApplications.innerHTML = "";
    for (const application of data.applications || []) {
      const option = document.createElement("option");
      option.value = application;
      els.runningApplications.appendChild(option);
    }
  } catch (error) {
    els.macSchedule.textContent = `Didn't load: ${error.message}`;
  }
}

async function controlMacApplication(action) {
  const application = els.applicationInput.value.trim();
  if (!application) {
    els.macActionStatus.textContent = "Enter an application name first.";
    els.applicationInput.focus();
    return;
  }
  const confirmed = action !== "quit"
    || window.confirm(`Quit the application "${application}"? It may have unsaved work.`);
  if (!confirmed) return;

  els.macActionStatus.textContent = "Running…";
  try {
    const res = await apiFetch("/api/mac/application", {
      method: "POST",
      body: JSON.stringify({ application, action, confirmed }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "The action failed.");
    els.macActionStatus.textContent = `${application}: ${action} complete.`;
    await loadMacStatus();
  } catch (error) {
    els.macActionStatus.textContent = error.message;
  }
}

async function controlMacPower(action) {
  const labels = { sleep: "sleep", restart: "restart", shutdown: "shutdown" };
  const confirmed = window.confirm(
    `Confirm ${labels[action] || action}: the connection to Dorothy will be interrupted immediately.`
  );
  if (!confirmed) return;

  els.macActionStatus.textContent = `Preparing ${labels[action] || action}…`;
  try {
    const res = await apiFetch("/api/mac/power", {
      method: "POST",
      body: JSON.stringify({ action, confirmed: true }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "The action failed.");
  } catch (error) {
    els.macActionStatus.textContent = error.message;
  }
}

const CONTROL_ACTION_COPY = {
  lock: {
    title: "Lock Mac?",
    text: "The screen will lock immediately. Applications and Dorothy will keep running.",
    confirm: "Lock",
  },
  restart: {
    title: "Restart Mac?",
    text: "The Mac will restart immediately. Save any open work first.",
    confirm: "Restart",
  },
  shutdown: {
    title: "Shut down Mac?",
    text: "The Mac will shut down immediately and the connection to Dorothy will be interrupted.",
    confirm: "Shutdown",
  },
  stop: {
    title: "Kill Dorothy?",
    text: "Only the OpenClaw gateway will stop. Control Center will stay active so you can bring it back.",
    confirm: "Kill Dorothy",
  },
  start: {
    title: "Restore Dorothy?",
    text: "The OpenClaw gateway will start again and Dorothy will come back online.",
    confirm: "Restore Dorothy",
  },
};

function toggleControlCenter() {
  if (els.controlCenter.classList.contains("hidden")) {
    els.controlCenter.classList.remove("hidden");
    els.controlCenterBtn.setAttribute("aria-expanded", "true");
    cancelControlAction();
    loadControlCenterStatus();
    return;
  }
  closeControlCenter();
}

function closeControlCenter() {
  if (els.controlCenter.classList.contains("hidden")) return;
  els.controlCenter.classList.add("hidden");
  els.controlCenterBtn.setAttribute("aria-expanded", "false");
  cancelControlAction();
}

function requestControlAction(kind, action) {
  const copy = CONTROL_ACTION_COPY[action];
  if (!copy) return;
  state.pendingControl = { kind, action };
  els.controlConfirmTitle.textContent = copy.title;
  els.controlConfirmText.textContent = copy.text;
  els.confirmControlBtn.textContent = copy.confirm;
  els.confirmControlBtn.classList.toggle("danger", action === "shutdown" || action === "stop");
  els.controlConfirm.classList.remove("hidden");
  els.controlCenterStatus.textContent = "";
  els.confirmControlBtn.focus();
}

function cancelControlAction() {
  state.pendingControl = null;
  els.controlConfirm.classList.add("hidden");
  els.confirmControlBtn.disabled = false;
  els.confirmControlBtn.classList.remove("danger");
  els.controlCenter.removeAttribute("aria-busy");
}

async function executeControlAction() {
  const pending = state.pendingControl;
  if (!pending) return;

  els.confirmControlBtn.disabled = true;
  els.controlCenter.setAttribute("aria-busy", "true");
  els.controlCenterStatus.textContent = "Running command…";

  try {
    const endpoint = pending.kind === "gateway" ? "/api/system/gateway" : "/api/mac/power";
    const res = await apiFetch(endpoint, {
      method: "POST",
      body: JSON.stringify({ action: pending.action, confirmed: true }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "The command failed.");

    const action = pending.action;
    cancelControlAction();
    if (pending.kind === "gateway") {
      els.controlCenterStatus.textContent = action === "stop"
        ? "Dorothy has stopped. You can restore her from here."
        : "Dorothy is starting up again…";
      await new Promise(resolve => window.setTimeout(resolve, 900));
      await Promise.all([
        loadControlCenterStatus(),
        checkSystemStatus({ quiet: true }),
      ]);
    } else {
      els.controlCenterStatus.textContent = action === "lock"
        ? "The Mac is locking."
        : "The command was sent to the Mac.";
    }
  } catch (error) {
    els.confirmControlBtn.disabled = false;
    els.controlCenter.removeAttribute("aria-busy");
    els.controlCenterStatus.textContent = error.message;
  }
}

async function loadControlCenterStatus() {
  els.controlCenterState.dataset.state = "checking";
  els.controlCenterState.querySelector("span").textContent = "Checking";
  els.controlCenterSummary.textContent = "Checking status…";

  try {
    const res = await apiFetch("/api/control-center/status");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Status unavailable");
    renderControlCenterStatus(data.gatewayOnline === true);
  } catch {
    renderControlCenterStatus(false);
    els.controlCenterSummary.textContent = "Mac online · Dorothy status unknown";
  }
}

function renderControlCenterStatus(gatewayOnline) {
  state.gatewayOnline = gatewayOnline;
  els.controlCenterState.dataset.state = gatewayOnline ? "online" : "offline";
  els.controlCenterState.querySelector("span").textContent = gatewayOnline ? "Online" : "Offline";
  els.controlCenterSummary.textContent = `Mac online · Dorothy ${gatewayOnline ? "online" : "offline"}`;
  els.gatewayControlBtn.dataset.controlAction = gatewayOnline ? "stop" : "start";
  els.gatewayControlBtn.classList.toggle("kill", gatewayOnline);
  els.gatewayControlBtn.classList.toggle("restore", !gatewayOnline);
  els.gatewayControlBtn.querySelector("[data-gateway-label]").textContent = gatewayOnline
    ? "Kill Dorothy"
    : "Restore Dorothy";
  els.gatewayControlBtn.querySelector("[data-gateway-detail]").textContent = gatewayOnline
    ? "Stop OpenClaw"
    : "Start OpenClaw";
}

function showLogin() {
  closeControlCenter();
  document.body.classList.remove("authenticated");
  document.body.classList.remove("finance-view");
  els.loginPanel.classList.remove("hidden");
  els.chatPanel.classList.add("hidden");
  els.financePanel.classList.add("hidden");
  els.workspacePanel?.classList.add("hidden");
  els.tokenInput.value = "";
  setStatus("offline", "Locked");
}

async function showChat() {
  document.body.classList.add("authenticated");
  els.loginPanel.classList.add("hidden");
  els.chatPanel.classList.remove("hidden");
  els.financePanel.classList.add("hidden");
  setStatus("idle", "Ready");
  if (window.DorothyFeatures?.showInitialView) {
    window.DorothyFeatures.showInitialView();
  } else {
    els.messageInput.focus();
  }
  await loadChatModes();
  await loadSessions();
  await checkSystemStatus({ quiet: true });
}

async function validateAndEnter(token) {
  els.loginError.textContent = "";
  els.saveTokenBtn.disabled = true;
  els.saveTokenBtn.textContent = "Checking…";
  try {
    const res = await fetch("/api/auth/check", {
      headers: { "Authorization": `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("invalid");
    state.token = token;
    localStorage.setItem("dorothy_token", token);
    await showChat();
  } catch {
    state.token = "";
    localStorage.removeItem("dorothy_token");
    showLogin();
    els.loginError.textContent = "The token is not correct.";
  } finally {
    els.saveTokenBtn.disabled = false;
    els.saveTokenBtn.textContent = "Sign in";
  }
}

function apiFetch(url, options = {}) {
  return fetch(url, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
      "Authorization": `Bearer ${state.token}`,
    },
  });
}

async function loadSessions() {
  try {
    const res = await apiFetch("/api/sessions");
    if (!res.ok) throw new Error("sessions");
    const data = await res.json();
    state.sessions = Array.isArray(data.sessions) ? data.sessions : [];
    const stored = state.sessions.find(item => item.key === state.sessionKey);
    if (stored) {
      await openSession(stored.key, stored);
    } else if (state.sessions.length) {
      await openSession(state.sessions[0].key, state.sessions[0]);
    } else {
      await createSession("dorothy");
    }
  } catch {
    const mode = modeFromSessionKey(state.sessionKey);
    const modeConfig = getMode(mode);
    state.sessions = [{
      key: state.sessionKey,
      title: modeConfig.title,
      mode,
      updatedAt: Date.now(),
      pending: true
    }];
    await openSession(state.sessionKey, {
      title: state.sessions[0].title,
      mode: state.sessions[0].mode,
      pending: true,
    });
  }
}

async function refreshSessions() {
  try {
    const res = await apiFetch("/api/sessions");
    if (!res.ok) return;
    const data = await res.json();
    const currentPending = state.sessions.find(item => item.key === state.sessionKey && item.pending);
    state.sessions = Array.isArray(data.sessions) ? data.sessions : [];
    if (currentPending && !state.sessions.some(item => item.key === currentPending.key)) {
      state.sessions.unshift(currentPending);
    }
    const current = state.sessions.find(item => item.key === state.sessionKey);
    if (current) {
      state.mode = current.mode || modeFromSessionKey(current.key);
      state.model = current.model || state.model;
      setConversationTitle(current.title);
      applyConversationMode();
    }
    renderSessionList();
  } catch {
    // The active conversation still works if history refresh is unavailable.
  }
}

async function openSession(key, options = {}) {
  if (state.busy || !key) return;
  await showView("chat", { load: false });
  state.sessionKey = key;
  state.mode = options.mode || modeFromSessionKey(key);
  state.model = options.model || "";
  localStorage.setItem("dorothy_session", key);
  setConversationTitle(options.title || "New conversation");
  applyConversationMode();
  renderSessionList();
  closeSidebar();
  els.messages.innerHTML = "";

  if (options.pending) {
    renderWelcome();
    els.messageInput.focus();
    return;
  }

  setStatus("busy", "Loading");
  try {
    const res = await apiFetch(`/api/sessions/history?key=${encodeURIComponent(key)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "History unavailable");
    for (const message of data.messages || []) {
      if (message.role === "user") addUserMsg(message.text);
      else addBotMsg(message.text);
    }
    if (!els.messages.children.length) renderWelcome();
  } catch {
    renderWelcome();
  } finally {
    updateIdleStatus();
    els.messageInput.focus();
  }
}

function setConversationTitle(title) {
  state.sessionTitle = title || "New conversation";
  els.conversationTitle.textContent = state.sessionTitle;
}

async function showView(view, options = {}) {
  if (view !== "finance") view = "chat";
  state.view = view;
  const finance = view === "finance";
  document.body.classList.toggle("finance-view", finance);
  document.body.classList.remove("workspace-view");
  els.chatPanel.classList.toggle("hidden", finance);
  els.financePanel.classList.toggle("hidden", !finance);
  els.workspacePanel?.classList.add("hidden");
  els.sidebarChatNav.classList.toggle("active", !finance);
  els.sidebarFinanceNav.classList.toggle("active", finance);
  document.querySelectorAll("[data-feature-view]").forEach(item => item.classList.remove("active"));
  els.newChatBtn.classList.toggle("hidden", finance);
  closeSidebar();

  if (finance) {
    els.conversationTitle.textContent = "Finance";
    els.conversationMode.classList.add("hidden");
    if (options.load !== false) await loadFinance();
  } else {
    setConversationTitle(state.sessionTitle);
    applyConversationMode();
    if (!state.busy) els.messageInput.focus();
  }
}

function applyConversationMode() {
  const mode = getMode();
  const isDorothy = state.mode === "dorothy";
  document.body.classList.toggle("ai-mode", state.mode === "ai");
  els.conversationMode.classList.toggle("hidden", isDorothy);
  els.conversationMode.textContent = state.mode === "ai" && state.model
    ? `${mode.badge} · ${displayModelName(state.model)}`
    : mode.badge;
  els.messageInput.placeholder = mode.placeholder;
  els.quickActionsEl.classList.toggle("hidden", !isDorothy || !state.showQuickActions);
}

function displayModelName(modelId) {
  const configured = state.aiModels.find(model => model.id === modelId);
  if (configured?.name) return configured.name;
  return String(modelId || "")
    .replace(/^google-gemini-cli\//, "")
    .replace(/^google\//, "")
    .replace(/^ollama\//, "");
}

function displayModelRuntime(modelId) {
  const configured = state.aiModels.find(model => model.id === modelId);
  const isRemote = configured?.remote || /^google(?:-gemini-cli)?\//.test(String(modelId || ""));
  if (isRemote) return `${configured?.provider || "Cloud API"} · processed in the cloud`;
  return `${configured?.provider || "Ollama"} · runs locally on your Mac`;
}

function renderSessionList() {
  els.sessionList.innerHTML = "";
  if (!state.sessions.length) {
    const empty = document.createElement("p");
    empty.className = "session-empty";
    empty.textContent = "No conversations yet.";
    els.sessionList.appendChild(empty);
    return;
  }

  for (const session of state.sessions) {
    const row = document.createElement("div");
    row.className = "session-item";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "session-item-main";
    const mode = session.mode || modeFromSessionKey(session.key);
    row.classList.toggle("active", session.key === state.sessionKey);
    row.classList.toggle("ai", mode === "ai");
    const meta = session.pending ? "Empty" : relativeTime(session.updatedAt);
    const modeLabel = mode === "dorothy" ? "" : `${getMode(mode).label} · `;
    button.innerHTML = `
      <span class="session-item-title"></span>
      <span class="session-item-meta">${modeLabel}${meta}</span>
    `;
    button.querySelector(".session-item-title").textContent = session.title || "New conversation";
    button.addEventListener("click", () => openSession(session.key, session));
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "session-delete";
    deleteButton.setAttribute("aria-label", `Delete conversation ${session.title || "New conversation"}`);
    deleteButton.title = "Delete conversation";
    deleteButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5"/></svg>';
    deleteButton.addEventListener("click", () => deleteSession(session));
    row.append(button, deleteButton);
    els.sessionList.appendChild(row);
  }
}

async function deleteSession(session) {
  if (state.busy || !session?.key) return;
  const title = session.title || "New conversation";
  if (!window.confirm(`Permanently delete the conversation "${title}"?`)) return;

  try {
    if (!session.pending) {
      const response = await apiFetch(`/api/sessions/${encodeURIComponent(session.key)}`, {
        method: "DELETE",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "The deletion failed.");
    }

    const wasActive = session.key === state.sessionKey;
    state.sessions = state.sessions.filter(item => item.key !== session.key);
    if (!wasActive) {
      renderSessionList();
      return;
    }

    localStorage.removeItem("dorothy_session");
    const next = state.sessions[0];
    if (next) await openSession(next.key, next);
    else await createSession("dorothy");
  } catch (error) {
    window.alert(error.message || "The deletion failed.");
  }
}

function relativeTime(timestamp) {
  const seconds = Math.max(0, Math.floor((Date.now() - Number(timestamp || 0)) / 1000));
  if (seconds < 60) return "Now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`;
  return new Date(timestamp).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function openSidebar() {
  els.sidebar.classList.add("open");
  els.sidebarScrim.classList.add("visible");
  document.body.classList.add("sidebar-open");
  els.menuBtn.setAttribute("aria-expanded", "true");
}

function closeSidebar() {
  els.sidebar.classList.remove("open");
  els.sidebarScrim.classList.remove("visible");
  document.body.classList.remove("sidebar-open");
  els.menuBtn.setAttribute("aria-expanded", "false");
}

async function loadFinance(force = false) {
  if (state.financeLoaded && !force && state.financeData) {
    renderFinance(state.financeData);
    renderBanking(state.bankData);
    renderPortfolio(state.portfolioData);
    return;
  }

  els.financeStatus.classList.remove("hidden", "error");
  els.financeContent.classList.add("hidden");
  els.financeStatus.textContent = "Loading finances…";
  els.refreshFinanceBtn.disabled = true;

  try {
    const selectedYear = els.financeYear.value;
    const suffix = selectedYear ? `?year=${encodeURIComponent(selectedYear)}` : "";
    const [res, bankRes, portfolioRes] = await Promise.all([
      apiFetch(`/api/finance/overview${suffix}`),
      apiFetch("/api/open-banking/overview?days=30"),
      apiFetch(`/api/finance/portfolio${force ? "?refresh=1" : ""}`),
    ]);
    const data = await res.json();
    const bankData = await bankRes.json();
    const portfolioData = await portfolioRes.json();
    if (!res.ok || !data.ok) throw new Error(data.error || "Finance data unavailable");
    state.financeLoaded = true;
    state.financeData = data;
    state.bankData = bankRes.ok && bankData.ok ? bankData : null;
    state.portfolioData = portfolioRes.ok && portfolioData.ok ? portfolioData : null;
    renderFinance(data);
    renderBanking(state.bankData);
    renderPortfolio(state.portfolioData);
  } catch (error) {
    els.financeStatus.classList.add("error");
    els.financeStatus.textContent = `Finances didn't load: ${error.message}`;
  } finally {
    els.refreshFinanceBtn.disabled = false;
  }
}

async function syncAndLoadBanking() {
  els.syncBanksBtn.disabled = true;
  els.syncBanksBtn.classList.add("syncing");
  els.bankSyncMeta.textContent = "Syncing balances and transactions…";
  try {
    const res = await apiFetch("/api/open-banking/sync", { method: "POST" });
    const result = await res.json();
    if (!res.ok || !result.ok) throw new Error(result.error || "Bank sync failed");
    const overviewRes = await apiFetch("/api/open-banking/overview?days=30");
    const overview = await overviewRes.json();
    if (!overviewRes.ok || !overview.ok) throw new Error(overview.error || "Bank overview failed");
    state.bankData = overview;
    renderBanking(overview);
  } catch (error) {
    els.bankSyncMeta.textContent = `Bank sync failed: ${error.message}`;
  } finally {
    els.syncBanksBtn.disabled = false;
    els.syncBanksBtn.classList.remove("syncing");
  }
}

async function syncAndLoadFinance() {
  els.financeStatus.classList.remove("hidden", "error");
  els.financeStatus.textContent = "Syncing revenue from Elorus…";
  els.refreshFinanceBtn.disabled = true;
  els.refreshFinanceBtn.classList.add("syncing");
  try {
    const res = await apiFetch("/api/finance/sync", { method: "POST" });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || "Elorus sync failed");
    state.financeLoaded = false;
    await loadFinance(true);
  } catch (error) {
    els.financeStatus.classList.add("error");
    els.financeStatus.textContent = `Sync failed: ${error.message}`;
  } finally {
    els.refreshFinanceBtn.disabled = false;
    els.refreshFinanceBtn.classList.remove("syncing");
  }
}

function renderFinance(data) {
  const summary = data.summary || {};
  const selectedYear = String(summary.year || "");
  const currentOptions = [...els.financeYear.options].map(option => option.value);
  if (JSON.stringify(currentOptions) !== JSON.stringify((data.years || []).map(String))) {
    els.financeYear.innerHTML = "";
    [...(data.years || [])].reverse().forEach(year => {
      const option = document.createElement("option");
      option.value = String(year);
      option.textContent = String(year);
      els.financeYear.appendChild(option);
    });
  }
  els.financeYear.value = selectedYear;

  els.metricRevenue.textContent = formatEuro(summary.revenue);
  els.metricRevenueMeta.textContent = `${summary.invoiceCount || 0} invoices`;
  els.metricDirectCosts.textContent = formatEuro(summary.directCosts);
  els.metricCostsMeta.textContent = summary.directCostsEstimated > 0
    ? `${formatEuro(summary.directCostsActual)} actual · ${formatEuro(summary.directCostsEstimated)} estimated`
    : "Actual category costs";
  els.metricGrossProfit.textContent = formatEuro(summary.grossProfit);
  els.metricGrossMargin.textContent = `${formatPercent(summary.grossMarginPercent)} gross margin`;
  els.metricOperatingResult.textContent = formatEuro(summary.operatingResult);
  els.metricOperatingMargin.textContent = `${formatPercent(summary.operatingMarginPercent)} operating margin`;
  els.metricTaxOutflows.textContent = formatEuro(summary.taxVatCashOutflows);
  const sources = data.sources || summary.sources || {};
  els.financeSyncMeta.textContent = sources.lastSyncedAt
    ? `Elorus: ${new Date(sources.lastSyncedAt).toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    })}`
    : "Revenue from the initial MyDash snapshot";

  const coverage = summary.coverage || {};
  setQuality(els.qualityItems, els.qualityItemsBar, coverage.invoiceItemPercent);
  setQuality(els.qualityCosts, els.qualityCostsBar, coverage.actualCostRevenuePercent);
  els.qualityNote.textContent = coverage.unclassifiedRevenue > 0.005
    ? `${formatEuro(coverage.unclassifiedRevenue)} of revenue has no line-item breakdown and is shown separately.`
    : "All revenue for the period has line-item analysis.";

  renderFinanceChart(data.yearly || []);
  renderFinanceCategories(summary.categories || []);
  renderRenewals(data.renewals || {});
  els.financeStatus.classList.add("hidden");
  els.financeContent.classList.remove("hidden");
}

function renderBanking(data) {
  if (!data) {
    els.bankSyncMeta.textContent = "Bank data isn't available yet.";
    els.bankCashBalance.textContent = "—";
    els.bankInflows.textContent = "—";
    els.bankOutflows.textContent = "—";
    els.bankNetFlow.textContent = "—";
    els.bankAccountsMeta.textContent = "Tap sync";
    els.bankTransactionsMeta.textContent = "—";
    renderBankAccounts([]);
    renderBankCategories([]);
    renderBankTransactions([]);
    return;
  }

  const summary = data.summary || {};
  els.bankCashBalance.textContent = formatEuro(summary.eurCashBalance);
  els.bankInflows.textContent = formatEuro(summary.inflow);
  els.bankOutflows.textContent = formatEuro(summary.outflow);
  els.bankNetFlow.textContent = formatSignedEuro(summary.netFlow);
  els.bankNetFlow.classList.toggle("negative", Number(summary.netFlow) < 0);
  els.bankAccountsMeta.textContent = `${summary.bankCount || 0} banks · ${summary.accountCount || 0} accounts`;
  els.bankTransactionsMeta.textContent = `${summary.transactionCount || 0} transactions`;
  els.bankSyncMeta.textContent = data.lastSync?.finishedAt
    ? `Last updated ${new Date(data.lastSync.finishedAt).toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    })}`
    : "No sync has run yet.";
  renderBankAccounts(data.accounts || []);
  renderBankCategories(data.categories || []);
  renderBankTransactions(data.recentTransactions || []);
}

function renderPortfolio(data) {
  els.portfolioPositions.innerHTML = "";
  const positions = data?.positions || [];
  const total = data?.totals?.[0];
  const euroTotal = data?.euroTotal;

  if (!data || !positions.length) {
    els.portfolioTotalValue.textContent = "—";
    els.portfolioDayChange.textContent = "No structured positions found in memory.";
    els.portfolioDayChange.className = "";
    els.portfolioMarketStatus.textContent = "Not available";
    els.portfolioMeta.textContent = "The rest of the finance tab works normally.";
    return;
  }

  els.portfolioTotalValue.textContent = total
    ? `${formatCurrency(total.marketValue, total.currency)}${euroTotal
      ? ` (${formatCurrency(euroTotal.marketValue, "EUR")})`
      : ""}`
    : "—";
  els.portfolioDayChange.textContent = total
    ? `${formatSignedCurrency(total.dayChangeValue, total.currency)}${euroTotal
      ? ` (${formatSignedCurrency(euroTotal.dayChangeValue, "EUR")})`
      : ""} today`
    : "The current value isn't available.";
  els.portfolioDayChange.className = total
    ? (Number(total.dayChangeValue) >= 0 ? "positive" : "negative")
    : "";

  const quoted = positions.filter(position => Number.isFinite(position.price));
  const marketOpen = quoted.some(position => position.marketStatus === "open");
  els.portfolioMarketStatus.textContent = quoted.length
    ? `${marketOpen ? "Market open" : "Market closed"} · ${data.providers.join(" + ")}`
    : "Prices aren't available";
  els.portfolioMeta.textContent = data.asOf
    ? `Updated ${new Date(data.asOf).toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    })}${data.cached ? " · cache" : ""}${data.fxProviders?.length
      ? ` · EUR: ${data.fxProviders.join(" + ")}`
      : ""}`
    : data.note;

  for (const position of positions) {
    const row = document.createElement("div");
    row.className = "portfolio-position";

    const identity = document.createElement("div");
    identity.className = "portfolio-identity";
    const mark = document.createElement("span");
    mark.className = "portfolio-mark";
    mark.textContent = position.symbol.slice(0, 1);
    const copy = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = position.name;
    const details = document.createElement("span");
    details.textContent = `${position.symbol} · ${formatQuantity(position.quantity)} shares · ${position.broker}`;
    copy.append(name, details);
    identity.append(mark, copy);

    const quote = document.createElement("div");
    quote.className = "portfolio-quote";
    const price = document.createElement("strong");
    price.textContent = Number.isFinite(position.price)
      ? formatCurrency(position.price, position.currency)
      : "—";
    const change = document.createElement("span");
    change.textContent = Number.isFinite(position.changePercent)
      ? `${formatSignedNumber(position.changePercent)}% today`
      : position.quoteError || "No current price";
    if (Number.isFinite(position.changePercent)) {
      change.className = position.changePercent >= 0 ? "positive" : "negative";
    }
    quote.append(price, change);

    const value = document.createElement("div");
    value.className = "portfolio-value";
    const valueLabel = document.createElement("span");
    valueLabel.textContent = "Position value";
    const valueAmount = document.createElement("strong");
    valueAmount.textContent = Number.isFinite(position.marketValue)
      ? `${formatCurrency(position.marketValue, position.currency)}${Number.isFinite(position.marketValueEur)
        ? ` (${formatCurrency(position.marketValueEur, "EUR")})`
        : ""}`
      : "—";
    value.append(valueLabel, valueAmount);

    row.append(identity, quote, value);
    els.portfolioPositions.appendChild(row);
  }
}

function renderBankAccounts(accounts) {
  els.bankAccountsList.innerHTML = "";
  if (!accounts.length) {
    els.bankAccountsList.innerHTML = '<p class="bank-empty">No synced balances.</p>';
    return;
  }
  for (const account of accounts) {
    const row = document.createElement("div");
    row.className = "bank-account-row";
    const copy = document.createElement("div");
    const bank = document.createElement("strong");
    bank.textContent = account.bankName;
    const detail = document.createElement("span");
    detail.textContent = [account.displayName, account.maskedIdentifier].filter(Boolean).join(" · ");
    copy.append(bank, detail);
    const amount = document.createElement("strong");
    amount.className = "bank-account-balance";
    amount.textContent = account.balance === null
      ? "—"
      : formatCurrency(account.balance, account.currency);
    row.append(copy, amount);
    els.bankAccountsList.appendChild(row);
  }
}

function renderBankCategories(categories) {
  els.bankCategoriesList.innerHTML = "";
  const max = Math.max(1, ...categories.map(row => Number(row.amount || 0)));
  if (!categories.length) {
    els.bankCategoriesList.innerHTML = '<p class="bank-empty">No outflows in this period.</p>';
    return;
  }
  for (const category of categories.slice(0, 8)) {
    const row = document.createElement("div");
    row.className = "bank-category-row";
    row.innerHTML = `
      <div><span>${escapeHtml(category.label)}</span><strong>${formatEuro(category.amount)}</strong></div>
      <i><b style="width:${Math.max(3, Number(category.amount || 0) / max * 100)}%"></b></i>
    `;
    els.bankCategoriesList.appendChild(row);
  }
}

function renderBankTransactions(transactions) {
  els.bankTransactionsList.innerHTML = "";
  if (!transactions.length) {
    els.bankTransactionsList.innerHTML = '<p class="bank-empty">No transactions in this period.</p>';
    return;
  }
  for (const transaction of transactions.slice(0, 18)) {
    const row = document.createElement("div");
    row.className = "bank-transaction-row";
    const date = new Date(`${transaction.bookingDate}T12:00:00Z`).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
    });
    row.innerHTML = `
      <time>${escapeHtml(date)}</time>
      <div>
        <strong>${escapeHtml(transaction.description || transaction.counterparty || "Transaction")}</strong>
        <span>${escapeHtml([transaction.bankName, transaction.categoryLabel].filter(Boolean).join(" · "))}</span>
      </div>
      <strong class="${Number(transaction.amount) < 0 ? "negative" : "positive"}">${formatSignedCurrency(transaction.amount, transaction.currency)}</strong>
    `;
    els.bankTransactionsList.appendChild(row);
  }
}

function setQuality(label, bar, value) {
  const percent = Math.max(0, Math.min(100, Number(value || 0)));
  label.textContent = formatPercent(percent);
  bar.style.width = `${percent}%`;
}

function renderFinanceChart(rows) {
  if (!rows.length) {
    els.financeChart.textContent = "No historical data available.";
    return;
  }

  const width = 760;
  const height = 260;
  const padding = { top: 20, right: 24, bottom: 36, left: 52 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const values = rows.flatMap(row => [Number(row.revenue || 0), Number(row.operatingResult || 0)]);
  const minValue = Math.min(0, ...values);
  const maxValue = Math.max(1, ...values);
  const range = maxValue - minValue || 1;
  const y = value => padding.top + (maxValue - value) / range * plotHeight;
  const zeroY = y(0);
  const step = plotWidth / rows.length;
  const barWidth = Math.min(42, step * .48);
  const linePoints = rows.map((row, index) => {
    const x = padding.left + step * index + step / 2;
    return `${x},${y(Number(row.operatingResult || 0))}`;
  }).join(" ");

  const grid = Array.from({ length: 5 }, (_, index) => {
    const value = maxValue - range * index / 4;
    const gridY = y(value);
    return `
      <line x1="${padding.left}" y1="${gridY}" x2="${width - padding.right}" y2="${gridY}" class="chart-grid-line"/>
      <text x="${padding.left - 10}" y="${gridY + 4}" text-anchor="end" class="chart-axis-label">${compactMoney(value)}</text>
    `;
  }).join("");
  const bars = rows.map((row, index) => {
    const x = padding.left + step * index + (step - barWidth) / 2;
    const revenueY = y(Number(row.revenue || 0));
    return `
      <rect x="${x}" y="${revenueY}" width="${barWidth}" height="${Math.max(1, zeroY - revenueY)}" rx="5" class="chart-bar"/>
      <text x="${x + barWidth / 2}" y="${height - 12}" text-anchor="middle" class="chart-year">${row.year}</text>
    `;
  }).join("");
  const points = rows.map((row, index) => {
    const x = padding.left + step * index + step / 2;
    const pointY = y(Number(row.operatingResult || 0));
    return `<circle cx="${x}" cy="${pointY}" r="4.5" class="chart-point"><title>${row.year}: ${formatEuro(row.operatingResult)}</title></circle>`;
  }).join("");

  els.financeChart.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Revenue and operating result by year">
      ${grid}
      <line x1="${padding.left}" y1="${zeroY}" x2="${width - padding.right}" y2="${zeroY}" class="chart-zero-line"/>
      ${bars}
      <polyline points="${linePoints}" class="chart-result-line"/>
      ${points}
    </svg>
  `;
}

function renderFinanceCategories(rows) {
  els.financeCategories.innerHTML = "";
  for (const row of rows) {
    const tr = document.createElement("tr");
    const values = [
      row.label || row.category,
      formatEuro(row.revenue),
      formatEuro(row.cost),
      formatEuro(row.profit),
      formatPercent(row.marginPercent),
    ];
    values.forEach((value, index) => {
      const td = document.createElement("td");
      td.textContent = value;
      if (index === 3) td.className = Number(row.profit) >= 0 ? "positive" : "negative";
      tr.appendChild(td);
    });
    const source = document.createElement("td");
    const badge = document.createElement("span");
    badge.className = `cost-source ${row.costSource === "actual_category_cost" ? "actual" : "estimated"}`;
    badge.textContent = row.costSource === "actual_category_cost" ? "Actual" : "Estimated";
    source.appendChild(badge);
    tr.appendChild(source);
    els.financeCategories.appendChild(tr);
  }
}

function renderRenewals(renewals) {
  els.renewalsList.innerHTML = "";
  els.renewalsCount.textContent = String(renewals.count || 0);
  const rows = renewals.rows || [];
  if (!rows.length) {
    const empty = document.createElement("p");
    empty.className = "renewals-empty";
    empty.textContent = "No confident renewals in the next 90 days.";
    els.renewalsList.appendChild(empty);
    return;
  }

  for (const row of rows) {
    const item = document.createElement("div");
    item.className = "renewal-item";
    const copy = document.createElement("div");
    copy.className = "renewal-copy";
    const service = document.createElement("strong");
    service.textContent = row.service;
    const client = document.createElement("span");
    client.textContent = row.client;
    copy.append(service, client);
    const date = document.createElement("div");
    date.className = "renewal-date";
    const dateText = document.createElement("strong");
    dateText.textContent = formatDate(row.nextRenewalDate);
    const relative = document.createElement("span");
    relative.textContent = row.daysUntil < 0
      ? `${Math.abs(row.daysUntil)} days overdue`
      : row.daysUntil === 0 ? "today" : `in ${row.daysUntil} days`;
    date.append(dateText, relative);
    const amount = document.createElement("div");
    amount.className = "renewal-amount";
    amount.textContent = formatEuro(row.amountNet);
    item.append(copy, date, amount);
    els.renewalsList.appendChild(item);
  }
}

function formatEuro(value) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatSignedNumber(value) {
  const number = Number(value || 0);
  return `${number >= 0 ? "+" : "−"}${Math.abs(number).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatQuantity(value) {
  return Number(value || 0).toLocaleString("en-GB", {
    maximumFractionDigits: 4,
  });
}

function formatCurrency(value, currency = "EUR") {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency || "EUR",
    minimumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatSignedCurrency(value, currency = "EUR") {
  const number = Number(value || 0);
  const formatted = formatCurrency(Math.abs(number), currency);
  return `${number > 0 ? "+" : number < 0 ? "−" : ""}${formatted}`;
}

function formatSignedEuro(value) {
  return formatSignedCurrency(value, "EUR");
}

function formatPercent(value) {
  return `${new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 }).format(Number(value || 0))}%`;
}

function compactMoney(value) {
  const number = Number(value || 0);
  if (Math.abs(number) >= 1000) return `${new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 }).format(number / 1000)}k`;
  return new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 }).format(number);
}

function formatDate(value) {
  if (!value) return "No date";
  return new Date(`${value}T12:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function setStatus(status, label) {
  els.connectionStatus.dataset.state = status;
  els.connectionLabel.textContent = label;
}

function updateIdleStatus() {
  if (state.systemReady === false) {
    setStatus("degraded", "Partially online");
    return;
  }
  if (state.systemReady === true) {
    setStatus("idle", "All online");
    return;
  }
  setStatus("idle", "Ready");
}

function setBusy(on) {
  state.busy = on;
  els.chatPanel.setAttribute("aria-busy", String(on));
  els.sendBtn.disabled = on;
  els.voiceBtn.disabled = on;
  els.messageInput.disabled = on;
  document.querySelectorAll(".quick-actions button").forEach(btn => { btn.disabled = on; });
  if (on) setStatus("busy", "Thinking");
  else updateIdleStatus();
}

async function checkSystemStatus(options = {}) {
  if (!options.quiet && els.systemReadinessSummary) {
    els.systemReadinessSummary.textContent = "Checking services…";
  }

  try {
    const res = await apiFetch("/api/system/status");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "System status unavailable");
    state.systemReady = data.ready === true;
    state.systemStatus = data;
    renderSystemStatus(data);
    const gateway = (data.services || []).find(service => service.id === "openclaw");
    if (gateway) renderControlCenterStatus(gateway.ok === true);
    if (!state.busy) updateIdleStatus();
    return data;
  } catch (error) {
    state.systemReady = false;
    if (!state.busy) updateIdleStatus();
    if (els.systemReadinessSummary) {
      els.systemReadinessSummary.textContent = `Check failed: ${error.message}`;
    }
    return null;
  }
}

function renderSystemStatus(data) {
  if (!els.systemReadiness) return;

  els.systemReadiness.innerHTML = "";
  for (const service of data.services || []) {
    const item = document.createElement("div");
    item.className = `service-item ${service.ok ? "online" : "offline"}`;

    const dot = document.createElement("span");
    dot.className = "service-dot";

    const copy = document.createElement("span");
    copy.className = "service-copy";

    const label = document.createElement("strong");
    label.textContent = service.label;

    const detail = document.createElement("small");
    detail.textContent = service.detail || (service.ok ? "Online" : "Offline");

    copy.append(label, detail);
    item.append(dot, copy);
    els.systemReadiness.appendChild(item);
  }

  const checked = data.checkedAt
    ? new Date(data.checkedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    : "";
  els.systemReadinessSummary.textContent = data.ready
    ? `All ready${checked ? ` · checked ${checked}` : ""}`
    : `Needs attention${checked ? ` · checked ${checked}` : ""}`;

  const boot = data.bootAutomation || {};
  const login = boot.autoLoginUser ? `automatic login: ${boot.autoLoginUser}` : "automatic login inactive";
  els.bootAutomationStatus.className = `boot-status ${boot.ready ? "ready" : "warning"}`;
  els.bootAutomationStatus.textContent = boot.ready
    ? `Cold boot ready · FileVault off · ${login}`
    : `Cold boot not ready · ${boot.fileVaultOff ? "FileVault off" : "FileVault on"} · ${login}`;
}

function renderWelcome() {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good evening" : "Good evening";
  const mode = getMode();
  const welcome = document.createElement("section");
  welcome.className = `welcome welcome-${state.mode}`;

  if (state.mode === "ai") {
    const modelId = state.model || selectedAiModel();
    welcome.innerHTML = `
      <div class="welcome-mark" aria-hidden="true">AI</div>
      <p class="welcome-kicker">Personal AI</p>
      <h1>What do you want to explore?</h1>
      <p>${escapeHtml(displayModelName(modelId))} · ${escapeHtml(displayModelRuntime(modelId))}</p>
      <div class="welcome-hints">
        <button type="button" data-welcome-prompt="Help me organize my thoughts on a topic.">Organize an idea</button>
        <button type="button" data-welcome-prompt="Search the web for the latest developments on a topic I'll give you.">Search the web</button>
        <button type="button" data-welcome-prompt="I want to create a simple image. Ask me what it should depict.">Generate an image</button>
      </div>
    `;
  } else {
    welcome.innerHTML = `
      <div class="welcome-mark" aria-hidden="true"></div>
      <p class="welcome-kicker">${greeting}.</p>
      <h1>What do you want to do?</h1>
      <p>How can I help you today?</p>
      <div class="welcome-hints">
        <button type="button" data-welcome-prompt="What needs my attention today?">What's urgent today?</button>
        <button type="button" data-welcome-prompt="What do I have on my calendar in the next 24 hours?">See my schedule</button>
        <button type="button" data-welcome-prompt="Scan my communications for real pending items and log them correctly in Apple Notes with a Reminder or Calendar entry where needed.">See pending items</button>
      </div>
    `;
  }

  welcome.querySelectorAll("[data-welcome-prompt]").forEach(btn => {
    btn.addEventListener("click", () => sendMessage(btn.dataset.welcomePrompt));
  });
  els.messages.appendChild(welcome);
}

function clearWelcome() {
  els.messages.querySelector(".welcome")?.remove();
}

// ─── send / receive ──────────────────────────────────────────────────────────

async function sendMessage(text) {
  audioStop();
  clearWelcome();
  setBusy(true);
  addUserMsg(text);
  const current = state.sessions.find(item => item.key === state.sessionKey);
  const emptyTitles = new Set(["New conversation", "New AI chat"]);
  if (current && (!current.title || emptyTitles.has(current.title))) {
    const shortTitle = text.length > 46 ? `${text.slice(0, 45).trimEnd()}…` : text;
    current.title = state.mode === "ai" ? `AI · ${shortTitle}` : shortTitle;
    current.updatedAt = Date.now();
    setConversationTitle(current.title);
    renderSessionList();
  }
  const thinking = addThinking();

  try {
    const res = await fetch("/api/chat/stream", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${state.token}`,
      },
      body: JSON.stringify({
        message: text,
        sessionKey: state.sessionKey,
        mode: state.mode,
        model: state.mode === "ai" ? state.model : "",
      }),
    });

    if (!res.ok) {
      thinking.remove();
      const data = await res.json().catch(() => ({}));
      addBotMsg(data.error || `Request failed (${res.status})`);
      if (res.status === 401) showLogin();
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let reply = "";
    let hadError = false;
    let eventBuffer = "";
    thinking.remove();

    const botWrap = document.createElement("div");
    markLatestBot(botWrap);
    botWrap.className = "msg-wrap bot latest";
    const bubble = document.createElement("div");
    bubble.className = "msg bot";
    botWrap.appendChild(bubble);
    els.messages.appendChild(botWrap);
    scrollBottom();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      eventBuffer += decoder.decode(value, { stream: true });
      const events = eventBuffer.split("\n\n");
      eventBuffer = events.pop() || "";
      for (const event of events) {
        for (const line of event.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.text) {
              reply += data.text;
              bubble.innerHTML = renderMarkdown(reply);
              scrollBottom();
            }
            if (data.error) {
              hadError = true;
              botWrap.remove();
              addBotMsg(data.error);
            }
          } catch {
            // skip malformed SSE events
          }
        }
      }
    }

    if (!hadError) {
      const finalText = reply || "(No response)";
      bubble.innerHTML = renderMarkdown(finalText);
      botWrap.appendChild(buildReactionBar(finalText));
      scrollBottom();
      if (state.tts && reply && !isIOS) speak(reply);
      window.dispatchEvent(new CustomEvent("dorothy:reply", {
        detail: { text: reply || "", spoke: Boolean(state.tts && reply && !isIOS) },
      }));
      const active = state.sessions.find(item => item.key === state.sessionKey);
      if (active) active.pending = false;
      await refreshSessions();
    }
  } catch (err) {
    thinking.remove();
    addBotMsg(`Connection error: ${err.message}`);
  } finally {
    setBusy(false);
  }
}

// ─── communications quick actions ────────────────────────────────────────────

const COMMS_PROMPTS = {
  attention: "What needs my attention?",
  replies:   "Who should I reply to?",
  today:     "What came in today?",
};

const COMMS_EMPTY = {
  attention: "All clear — nothing needs immediate attention. ✨",
  replies:   "No pending replies right now.",
  today:     "No new messages have arrived today.",
};

async function showCommunications(type) {
  audioStop();
  clearWelcome();
  setBusy(true);
  addUserMsg(COMMS_PROMPTS[type] || type);
  const thinking = addThinking();

  try {
    const res = await fetch("/api/communications", {
      headers: { "Authorization": `Bearer ${state.token}` },
    });
    thinking.remove();

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      addBotMsg(data.error || `Request failed (${res.status})`);
      if (res.status === 401) showLogin();
      return;
    }

    const data = await res.json();
    const filtered = filterCommunications(data.mail || [], type);
    addBotMsg(type === "today"
      ? renderTodayCommunications(data.mail || [], data)
      : renderCommunications(filtered, type, data));
  } catch (err) {
    thinking.remove();
    addBotMsg(`Connection error: ${err.message}`);
  } finally {
    setBusy(false);
  }
}

function filterCommunications(mail, type) {
  const sorted = [...mail].sort((a, b) => new Date(b.receivedAt) - new Date(a.receivedAt));

  if (type === "today") {
    const today = new Date().toDateString();
    return sorted.filter(m => m.receivedAt && new Date(m.receivedAt).toDateString() === today);
  }

  if (type === "replies") {
    return sorted.filter(m => DorothyCommunications.isReplyCandidate(m)).slice(0, 6);
  }

  return sorted.filter(m => DorothyCommunications.isAttentionWorthy(m)).slice(0, 6);
}

function renderTodayCommunications(mail, data) {
  const digest = DorothyCommunications.summarizeToday(mail, { maxGroups: 6 });
  if (!digest.totalMessages) {
    return renderCommunications([], "today", data);
  }

  const sections = [
    ["security", "**Security**"],
    ["transactions", "**Orders & money**"],
    ["updates", "**Other useful updates**"],
  ];
  const blocks = [];

  sections.forEach(([category, heading]) => {
    const groups = digest.groups.filter(group => group.category === category);
    if (!groups.length) return;
    blocks.push([
      heading,
      ...groups.map(group => `- ${group.summary}`),
    ].join("\n"));
  });

  if (!blocks.length) {
    blocks.push("Nothing substantial in today's emails.");
  }

  const stats = [`${digest.groups.length} useful threads out of ${digest.totalMessages} emails`];
  if (digest.noiseMessages) stats.push(`${digest.noiseMessages} low-priority hidden`);
  if (digest.collapsedMessages) stats.push(`${digest.collapsedMessages} related updates merged`);
  if (digest.omittedGroups) stats.push(`+${digest.omittedGroups} more useful threads`);

  blocks.push(`*${stats.join(" · ")}*`);
  if (typeof data.ageSeconds === "number") {
    blocks.push(`*Updated ${formatAge(data.ageSeconds)} ago*`);
  }
  return blocks.join("\n\n");
}

function renderCommunications(mails, type, data) {
  if (!mails.length) {
    let msg = COMMS_EMPTY[type] || "No messages found.";
    if (!data.cached && !(data.mail || []).length) {
      msg += "\n\n*(The email cache hasn't loaded yet — try again shortly.)*";
    }
    return msg;
  }

  const lines = mails.map(m => {
    const sender = String(m.sender || "Unknown").replace(/\s*<.*?>\s*/, "").trim() || "Unknown";
    const subject = m.subject || "(no subject)";
    const flags = (m.flagged ? " 🚩" : "") + (!m.read ? " 🔵" : "");
    return `**${sender}**${flags} — ${subject}  \n${formatMailTime(m.receivedAt)} · ${m.account}`;
  });

  let footer = "";
  if (typeof data.ageSeconds === "number") {
    footer = `\n\n*Updated ${formatAge(data.ageSeconds)} ago*`;
  }

  return lines.join("\n\n") + footer;
}

function formatMailTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";

  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";

  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit" });
}

function formatAge(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes === 1) return "1 minute";
  if (minutes < 60) return `${minutes} minutes`;
  const hours = Math.round(minutes / 60);
  return hours === 1 ? "1 hour" : `${hours} hours`;
}

// ─── message rendering ───────────────────────────────────────────────────────

function addMeta(text) {
  const el = document.createElement("div");
  el.className = "msg meta";
  el.textContent = text;
  els.messages.appendChild(el);
  scrollBottom();
  return el;
}

function addThinking() {
  const el = document.createElement("div");
  el.className = "msg thinking";

  const dots = document.createElement("div");
  dots.className = "thinking-dots";
  for (let i = 0; i < 3; i++) {
    const dot = document.createElement("span");
    dot.className = "thinking-dot";
    dots.appendChild(dot);
  }

  const label = document.createElement("span");
  label.className = "thinking-label";
  label.textContent = "Thinking";

  const elapsed = document.createElement("span");
  elapsed.className = "thinking-elapsed";

  el.appendChild(dots);
  el.appendChild(label);
  el.appendChild(elapsed);
  els.messages.appendChild(el);
  scrollBottom();

  const start = Date.now();
  const timer = setInterval(() => {
    elapsed.textContent = ((Date.now() - start) / 1000).toFixed(0) + "s";
  }, 1000);

  const orig = el.remove.bind(el);
  el.remove = () => { clearInterval(timer); orig(); };
  return el;
}

function addUserMsg(text) {
  const wrap = document.createElement("div");
  wrap.className = "msg-wrap user";

  const bubble = document.createElement("div");
  bubble.className = "msg user";
  bubble.textContent = text;

  wrap.appendChild(bubble);
  els.messages.appendChild(wrap);
  scrollBottom();
  return wrap;
}

function addBotMsg(text) {
  const wrap = document.createElement("div");
  markLatestBot(wrap);
  wrap.className = "msg-wrap bot latest";

  const bubble = document.createElement("div");
  bubble.className = "msg bot";
  bubble.innerHTML = renderMarkdown(text);

  wrap.appendChild(bubble);
  wrap.appendChild(buildReactionBar(text));

  els.messages.appendChild(wrap);
  scrollBottom();
  return wrap;
}

function markLatestBot(nextWrap) {
  els.messages.querySelectorAll(".msg-wrap.bot.latest").forEach(wrap => {
    if (wrap !== nextWrap) wrap.classList.remove("latest");
  });
}

function scrollBottom() {
  const scroll = () => {
    els.messages.scrollTop = els.messages.scrollHeight;
  };
  scroll();
  requestAnimationFrame(scroll);
}

// ─── reactions ───────────────────────────────────────────────────────────────

function buildReactionBar(plainText) {
  const bar = document.createElement("div");
  bar.className = "reactions";

  const speakBtn = reactionBtn("▶", "Read reply aloud");
  speakBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    speak(plainText);
  });

  const retry = reactionBtn("↻", "Try a new approach");
  const copy = reactionBtn("⧉", "Copy reply");
  copy.classList.add("copy");

  retry.addEventListener("click", () => {
    if (retry.dataset.done) return;
    retry.dataset.done = "1";
    retry.classList.add("active");
    retry.disabled = true;
    setTimeout(() =>
      sendMessage("That reply didn't quite cover it. Can you approach it differently?"),
      250
    );
  });

  copy.addEventListener("click", () => {
    navigator.clipboard?.writeText(plainText).then(() => {
      copy.textContent = "✓";
      copy.setAttribute("aria-label", "Copied");
      setTimeout(() => {
        copy.textContent = "⧉";
        copy.setAttribute("aria-label", "Copy reply");
      }, 1600);
    });
  });

  const stopBtn = reactionBtn("■", "Stop reading aloud");
  stopBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    audioStop();
  });

  bar.appendChild(speakBtn);
  bar.appendChild(stopBtn);
  bar.appendChild(retry);
  bar.appendChild(copy);
  return bar;
}

function reactionBtn(icon, title) {
  const btn = document.createElement("button");
  btn.className = "reaction";
  btn.title = title;
  btn.setAttribute("aria-label", title);
  btn.textContent = icon;
  btn.type = "button";
  return btn;
}

// ─── markdown ────────────────────────────────────────────────────────────────

function renderMarkdown(raw) {
  let s = String(raw)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  s = s.replace(/```(?:[^\n]*)?\n([\s\S]*?)```/g, (_, code) =>
    `<pre><code>${code.trimEnd()}</code></pre>`
  );

  s = s.replace(/`([^`\n]+)`/g, "<code>$1</code>");

  s = s.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");

  s = s.replace(/(?<!\*)\*(?!\*)([^*\n]+?)(?<!\*)\*(?!\*)/g, "<em>$1</em>");

  s = s.replace(/^### (.+)$/gm, "<h4>$1</h4>");
  s = s.replace(/^## (.+)$/gm,  "<h3>$1</h3>");
  s = s.replace(/^# (.+)$/gm,   "<h2>$1</h2>");

  s = s.replace(/((?:^[ \t]*[-•] .+(?:\n|$))+)/gm, (block) => {
    const items = block.trim().split("\n")
      .map(l => `<li>${l.replace(/^[ \t]*[-•] /, "")}</li>`)
      .join("");
    return `<ul>${items}</ul>`;
  });

  s = s.replace(/((?:^[ \t]*\d+[.)]\s+.+(?:\n|$))+)/gm, (block) => {
    const items = block.trim().split("\n")
      .map(l => `<li>${l.replace(/^[ \t]*\d+[.)]\s+/, "")}</li>`)
      .join("");
    return `<ol>${items}</ol>`;
  });

  s = s.split(/(<pre>[\s\S]*?<\/pre>)/).map((chunk, i) =>
    i % 2 === 0 ? chunk.replace(/\n/g, "<br>") : chunk
  ).join("");

  return s;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function autoGrow() {
  els.messageInput.style.height = "auto";
  els.messageInput.style.height = Math.min(170, els.messageInput.scrollHeight) + "px";
}

function speak(text) {
  const clean = String(text).replace(/https?:\/\/\S+/g, "").slice(0, 1200);
  if (!clean) return;

  if (state.ttsEngine !== "browser") {
    ensureAudioCtx();
    speakServer(clean);
    return;
  }

  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();

  const segments = splitByLanguage(clean);
  const voices = speechSynthesis.getVoices();
  const greekVoice = state.greekVoice ? voices.find(v => v.voiceURI === state.greekVoice) : null;
  const englishVoice = state.englishVoice ? voices.find(v => v.voiceURI === state.englishVoice) : null;

  let speakingCount = segments.length;
  let spokenCount = 0;
  for (const { text: segText, lang } of segments) {
    const utt = new SpeechSynthesisUtterance(segText);
    utt.lang = lang;
    utt.rate = state.speechRate;

    if (lang === "el-GR" && greekVoice) utt.voice = greekVoice;
    else if (lang === "en-US" && englishVoice) utt.voice = englishVoice;

    utt.onstart = () => setSpeaking(true);
    utt.onend = () => { spokenCount++; if (spokenCount >= speakingCount) setSpeaking(false); };

    speechSynthesis.speak(utt);
  }
}

function audioStop() {
  setSpeaking(false);
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  const el = document.getElementById("dorothy-audio");
  if (el) {
    el.pause();
    if (el.src.startsWith("blob:")) { URL.revokeObjectURL(el.src); el.src = ""; }
    el._blob = null;
  }
}

const TTS_FALLBACK = {
  google: "piper",
  piper: "gtts",
  gtts: "server",
  server: "browser",
};

function speakServer(text, engine) {
  engine = engine || state.ttsEngine;
  const payload = {
    text,
    engine,
    rate: String(state.speechRate),
  };
  if (engine === "edge-tts" || engine === "server") {
    // Single neural voice for the whole reply — Greek and English alike.
    payload.greekVoice = "el-GR-AthinaNeural";
  }
  fetch("/api/tts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${state.token}`,
    },
    body: JSON.stringify(payload),
  })
  .then(res => {
    if (!res.ok) throw new Error("TTS failed: " + res.status);
    return res.blob();
  })
  .then(blob => {
    const url = URL.createObjectURL(blob);
    const el = document.getElementById("dorothy-audio") || (() => {
      const e = document.createElement("audio");
      e.id = "dorothy-audio";
      document.body.appendChild(e);
      return e;
    })();
    el._blob = blob;
    el.volume = 1;
    el.muted = false;
    el.pause();
    if (el.src && el.src.startsWith("blob:")) URL.revokeObjectURL(el.src);
    el.src = url;
    el.onerror = () => {
      setSpeaking(false);
      setTimeout(() => { URL.revokeObjectURL(url); el._blob = null; }, 1000);
    };
    el.onended = () => {
      setSpeaking(false);
      setTimeout(() => { URL.revokeObjectURL(url); el._blob = null; }, 1000);
    };
    el.play().then(() => {
      setSpeaking(true);
    }).catch(() => {
      setSpeaking(false);
      URL.revokeObjectURL(url);
      el._blob = null;
    });
  })
  .catch(err => {
    const fallback = TTS_FALLBACK[engine];
    if (fallback) {
      speakServer(text, fallback);
    }
  });
}

function toggleTtsEngineUI(engine) {
  els.browserTtsSettings.style.display =
    engine === "browser" ? "" : "none";
}

// ─── voice input ─────────────────────────────────────────────────────────────

function setupVoiceButton() {
  const btn = els.voiceBtn;
  const clone = btn.cloneNode(true);
  btn.parentNode.replaceChild(clone, btn);
  els.voiceBtn = clone;

  if (state.pushToTalk) {
    let held = false;
    const down = (e) => {
      e.preventDefault();
      if (held) return;
      held = true;
      startRecording();
    };
    const up = () => {
      if (!held) return;
      held = false;
      stopRecording(true);
    };
    els.voiceBtn.addEventListener("pointerdown", down);
    els.voiceBtn.addEventListener("pointerup", up);
    els.voiceBtn.addEventListener("pointerleave", up);
    els.voiceBtn.addEventListener("touchstart", down, { passive: false });
    els.voiceBtn.addEventListener("touchend", up);
    els.voiceBtn.addEventListener("touchcancel", up);
  } else {
    els.voiceBtn.addEventListener("click", () => {
      if (recording) stopRecording(false);
      else startRecording();
    });
  }
}

function startRecording() {
  audioStop();
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { addMeta("Voice input is not supported in this browser. Try Safari or Chrome."); return; }

  voiceTranscript = "";
  recognition = new SR();
  recognition.lang = "el-GR";
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  recording = true;
  els.voiceBtn.textContent = "●";
  els.voiceBtn.classList.add("recording");

  recognition.onresult = (e) => {
    let final = "";
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) final += e.results[i][0].transcript;
      else interim += e.results[i][0].transcript;
    }
    voiceTranscript = final;
    els.messageInput.value = final + interim;
    autoGrow();
  };

  recognition.onerror = () => {
    addMeta("Voice input failed.");
    stopRecording(false);
  };

  recognition.onend = () => {
    if (recording) recording = false;
    els.voiceBtn.textContent = "○";
    els.voiceBtn.classList.remove("recording");
  };

  recognition.start();
}

function stopRecording(send) {
  if (!recording) return;
  recording = false;

  if (recognition) {
    recognition.onend = null;
    recognition.stop();
    recognition = null;
  }

  els.voiceBtn.textContent = "○";
  els.voiceBtn.classList.remove("recording");

  if (send && voiceTranscript) {
    sendMessage(voiceTranscript);
    els.messageInput.value = "";
    voiceTranscript = "";
    autoGrow();
  }
}

// ─── code-switching TTS ──────────────────────────────────────────────────────

function splitByLanguage(text) {
  const segments = [];
  let current = "";
  let currentLang = null;

  for (const char of text) {
    let charLang;
    if (/[\u0370-\u03FF\u1F00-\u1FFF]/.test(char)) charLang = "el-GR";
    else if (/[a-zA-Z]/.test(char)) charLang = "en-US";
    else charLang = currentLang;

    if (charLang !== currentLang && current.trim()) {
      segments.push({ text: current, lang: currentLang });
      current = "";
    }

    if (currentLang === null) currentLang = charLang;
    else if (charLang !== null) currentLang = charLang;

    current += char;
  }

  if (current.trim()) {
    segments.push({ text: current, lang: currentLang || "el-GR" });
  }

  if (segments.length === 0 && text.trim()) {
    segments.push({ text: text.trim(), lang: "el-GR" });
  }

  return segments;
}

// ─── voice listing ────────────────────────────────────────────────────────────

function populateVoiceSelect(id, voices, selected, defaultLabel) {
  const sel = document.getElementById(id);
  sel.innerHTML = `<option value="">${defaultLabel}</option>`;

  const grouped = {};
  for (const v of voices) {
    const key = v.lang;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(v);
  }

  for (const [lang, list] of Object.entries(grouped)) {
    const group = document.createElement("optgroup");
    group.label = lang;
    for (const v of list) {
      const opt = document.createElement("option");
      opt.value = v.voiceURI;
      opt.textContent = `${v.name}${v.localService ? "" : " (cloud)"}`;
      if (v.voiceURI === selected) opt.selected = true;
      group.appendChild(opt);
    }
    sel.appendChild(group);
  }
}

function loadVoices() {
  if (!("speechSynthesis" in window)) return;
  const voices = speechSynthesis.getVoices();
  if (voices.length === 0) {
    speechSynthesis.addEventListener("voiceschanged", () => loadVoices(), { once: true });
    return;
  }

  const greekVoices = voices.filter(v => v.lang.startsWith("el"));
  const englishVoices = voices.filter(v => v.lang.startsWith("en"));

  populateVoiceSelect("greekVoiceSelect", greekVoices, state.greekVoice, "— System default —");
  populateVoiceSelect("englishVoiceSelect", englishVoices, state.englishVoice, "— System default —");
}

window.DorothyApp = {
  apiFetch,
  audioStop,
  closeSidebar,
  createSession,
  getState: () => state,
  openSession,
  sendMessage,
  setConversationTitle,
  showView,
  speak,
};
