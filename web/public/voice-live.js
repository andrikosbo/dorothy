/* Dorothy — hands-free live conversation with barge-in.
   Listens continuously (SpeechRecognition), auto-sends on a short silence,
   speaks the reply (Athina / edge-tts), then listens again. While Dorothy is
   speaking, a voice-activity detector (echo-cancelled mic) lets you interrupt:
   start talking and she stops and listens. No buttons during the conversation. */
(() => {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const overlay = document.getElementById("liveVoice");
  const launchBtn = document.getElementById("liveVoiceBtn");
  if (!overlay || !launchBtn) return;

  const ui = {
    orb: overlay.querySelector("[data-live-orb]"),
    status: overlay.querySelector("[data-live-status]"),
    transcript: overlay.querySelector("[data-live-transcript]"),
    end: overlay.querySelector("[data-live-end]"),
  };

  // Tunables
  const ENDPOINT_MS = 1100;   // silence after speech before auto-send
  const VAD_THRESHOLD = 0.03; // RMS level that counts as "the user is talking"
  const VAD_FRAMES = 9;       // consecutive frames above threshold → barge-in

  let active = false;
  let phase = "idle"; // idle | listening | thinking | speaking
  let recognition = null;
  let restarting = false;
  let finalText = "";
  let endpointTimer = null;
  let awaitingReply = false;

  let micStream = null;
  let audioCtx = null;
  let analyser = null;
  let vadRaf = 0;
  let vadHits = 0;

  function setPhase(next, statusText) {
    phase = next;
    overlay.dataset.phase = next;
    ui.orb.className = "live-orb " + next;
    if (statusText != null) ui.status.textContent = statusText;
  }

  function setTranscript(text) {
    ui.transcript.textContent = text || "";
  }

  // ---- Speech recognition (the listening half) ----
  function startRecognition() {
    if (!SR) { setPhase("listening", "This browser doesn't support voice"); return; }
    stopRecognition();
    finalText = "";
    const recog = new SR();
    recognition = recog;
    recog.lang = navigator.language && navigator.language.startsWith("en") ? "en-US" : "el-GR";
    recog.continuous = true;
    recog.interimResults = true;
    recog.onresult = (event) => {
      let interim = "";
      finalText = "";
      for (let i = 0; i < event.results.length; i += 1) {
        const chunk = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += chunk + " ";
        else interim += chunk;
      }
      setTranscript((finalText + interim).trim());
      scheduleEndpoint();
    };
    recog.onerror = () => {};
    recog.onend = () => {
      if (!active || restarting || recognition !== recog) return;
      if (phase === "listening") { try { recog.start(); } catch (e) {} }
    };
    try { recog.start(); } catch (e) {}
    setPhase("listening", "Listening…");
  }

  function stopRecognition() {
    clearTimeout(endpointTimer);
    if (recognition) {
      restarting = true;
      const recog = recognition;
      recognition = null;
      recog.onend = null;
      recog.onresult = null;
      try { recog.stop(); } catch (e) {}
      restarting = false;
    }
  }

  function scheduleEndpoint() {
    clearTimeout(endpointTimer);
    endpointTimer = setTimeout(() => {
      const text = (finalText || ui.transcript.textContent || "").trim();
      if (text && phase === "listening") submit(text);
    }, ENDPOINT_MS);
  }

  function submit(text) {
    awaitingReply = true;
    stopRecognition();
    setPhase("thinking", "Thinking…");
    setTranscript(text);
    window.DorothyApp && window.DorothyApp.showView && window.DorothyApp.showView("chat", { load: false });
    window.DorothyApp && window.DorothyApp.sendMessage && window.DorothyApp.sendMessage(text);
  }

  // ---- Reply + speaking events from app.js ----
  function onReply(event) {
    if (!active || !awaitingReply) return;
    awaitingReply = false;
    const detail = event.detail || {};
    if (!detail.text) { startRecognition(); return; }
    setPhase("speaking", "Speaking…");
    setTranscript("");
    if (!detail.spoke && window.DorothyApp && window.DorothyApp.speak) {
      window.DorothyApp.speak(detail.text);
    }
    startVad();
  }

  function onSpeaking(event) {
    if (!active) return;
    if (phase === "speaking" && event.detail && event.detail.on === false) {
      stopVad();
      startRecognition();
    }
  }

  // ---- Voice-activity detection for barge-in ----
  async function ensureMic() {
    if (micStream) return true;
    try {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioCtx.createMediaStreamSource(micStream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser); // not connected to destination → no feedback
      return true;
    } catch (e) {
      return false;
    }
  }

  function startVad() {
    if (!analyser) return;
    vadHits = 0;
    const buffer = new Float32Array(analyser.fftSize);
    const tick = () => {
      if (phase !== "speaking") return;
      analyser.getFloatTimeDomainData(buffer);
      let sum = 0;
      for (let i = 0; i < buffer.length; i += 1) sum += buffer[i] * buffer[i];
      const rms = Math.sqrt(sum / buffer.length);
      vadHits = rms > VAD_THRESHOLD ? vadHits + 1 : 0;
      if (vadHits >= VAD_FRAMES) { bargeIn(); return; }
      vadRaf = requestAnimationFrame(tick);
    };
    vadRaf = requestAnimationFrame(tick);
  }

  function stopVad() {
    if (vadRaf) cancelAnimationFrame(vadRaf);
    vadRaf = 0;
    vadHits = 0;
  }

  function bargeIn() {
    stopVad();
    window.DorothyApp && window.DorothyApp.audioStop && window.DorothyApp.audioStop();
    startRecognition();
  }

  // ---- Lifecycle ----
  async function start() {
    if (active) return;
    if (!SR) { window.alert("This browser doesn't support voice recognition — try Chrome."); return; }
    active = true;
    overlay.classList.remove("hidden");
    overlay.setAttribute("aria-hidden", "false");
    launchBtn.classList.add("active");
    setPhase("listening", "Starting…");
    setTranscript("");
    const gotMic = await ensureMic();
    if (audioCtx && audioCtx.state === "suspended") { try { await audioCtx.resume(); } catch (e) {} }
    if (!gotMic) setPhase("listening", "No microphone access (barge-in won't work)");
    startRecognition();
  }

  function stop() {
    active = false;
    awaitingReply = false;
    stopRecognition();
    stopVad();
    window.DorothyApp && window.DorothyApp.audioStop && window.DorothyApp.audioStop();
    if (micStream) { micStream.getTracks().forEach((track) => track.stop()); micStream = null; }
    if (audioCtx) { try { audioCtx.close(); } catch (e) {} audioCtx = null; analyser = null; }
    overlay.classList.add("hidden");
    overlay.setAttribute("aria-hidden", "true");
    launchBtn.classList.remove("active");
    setPhase("idle", "");
  }

  launchBtn.addEventListener("click", () => { if (active) stop(); else start(); });
  ui.end.addEventListener("click", stop);
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && active) stop(); });
  window.addEventListener("dorothy:reply", onReply);
  window.addEventListener("dorothy:speaking", onSpeaking);
})();
