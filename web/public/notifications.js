// Dorothy web app notification center.
// Polls /api/notifications (written by the dorothy_notify tool), shows them in
// the bell panel, fires an OS banner + toast for genuinely new ones.
(function () {
  "use strict";

  const POLL_MS = 30_000;
  const seen = new Set();
  let primed = false; // first load seeds `seen` without alerting on the backlog
  let panelOpen = false;
  let els = null;

  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  function api(url, options) {
    if (window.DorothyApp && window.DorothyApp.apiFetch) return window.DorothyApp.apiFetch(url, options);
    return fetch(url, options);
  }

  function loggedIn() {
    try {
      const s = window.DorothyApp && window.DorothyApp.getState && window.DorothyApp.getState();
      return !!(s && s.token);
    } catch {
      return false;
    }
  }

  function fmtTime(iso) {
    try {
      const d = new Date(iso);
      const today = new Date();
      const sameDay = d.toDateString() === today.toDateString();
      return sameDay
        ? d.toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit" })
        : d.toLocaleString("el-GR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  }

  function toast(title, text) {
    const el = document.createElement("div");
    el.className = "notif-toast";
    el.innerHTML = `<strong></strong><span></span>`;
    el.querySelector("strong").textContent = title || "Dorothy";
    el.querySelector("span").textContent = text || "";
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add("visible"));
    el.addEventListener("click", () => openPanel());
    setTimeout(() => {
      el.classList.remove("visible");
      setTimeout(() => el.remove(), 250);
    }, 6000);
  }

  function osBanner(n) {
    try {
      if (!("Notification" in window) || Notification.permission !== "granted") return;
      const note = new Notification(n.title || "Dorothy", { body: n.text || "", tag: n.id, renotify: false });
      note.onclick = () => {
        window.focus();
        openPanel();
        note.close();
      };
    } catch {
      /* ignore */
    }
  }

  function setBadge(count) {
    if (!els) return;
    if (count > 0) {
      els.badge.textContent = count > 99 ? "99+" : String(count);
      els.badge.classList.remove("hidden");
      els.btn.classList.add("has-unread");
    } else {
      els.badge.classList.add("hidden");
      els.btn.classList.remove("has-unread");
    }
  }

  function render(items) {
    if (!els) return;
    if (!items.length) {
      els.list.innerHTML = `<div class="notif-empty">Καμία ειδοποίηση.</div>`;
      return;
    }
    els.list.innerHTML = "";
    for (const n of items) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = `notif-item${n.read ? "" : " unread"}${n.urgent ? " urgent" : ""}`;
      row.dataset.id = n.id;
      const title = document.createElement("div");
      title.className = "notif-item-title";
      title.textContent = n.title || "Dorothy";
      const body = document.createElement("div");
      body.className = "notif-item-text";
      body.textContent = n.text || "";
      const time = document.createElement("div");
      time.className = "notif-item-time";
      time.textContent = fmtTime(n.at);
      row.append(title, body, time);
      row.addEventListener("click", () => markRead(n.id));
      els.list.appendChild(row);
    }
  }

  async function load() {
    if (!loggedIn()) return;
    let data;
    try {
      const res = await api("/api/notifications");
      if (!res.ok) return;
      data = await res.json();
    } catch {
      return;
    }
    const items = (data && data.notifications) || [];
    const unread = items.filter((n) => !n.read).length;
    setBadge(unread);
    if (panelOpen) render(items);

    // Alert only on genuinely new, unread, non-silent notifications.
    const fresh = items.filter((n) => !seen.has(n.id));
    fresh.forEach((n) => seen.add(n.id));
    if (primed) {
      for (const n of fresh) {
        if (n.read || n.silent) continue;
        toast(n.title, n.text);
        if (document.hidden || true) osBanner(n);
      }
    }
    primed = true;
  }

  async function markRead(id) {
    try {
      await api(`/api/notifications/${encodeURIComponent(id)}/read`, { method: "POST", body: "{}" });
    } catch {
      /* ignore */
    }
    load();
  }

  async function readAll() {
    try {
      await api("/api/notifications/read-all", { method: "POST", body: "{}" });
    } catch {
      /* ignore */
    }
    load();
  }

  async function clearAll() {
    try {
      await api("/api/notifications/clear", { method: "POST", body: "{}" });
    } catch {
      /* ignore */
    }
    load();
  }

  function requestPermission() {
    try {
      if ("Notification" in window && Notification.permission === "default") Notification.requestPermission();
    } catch {
      /* ignore */
    }
  }

  function openPanel() {
    if (!els) return;
    panelOpen = true;
    els.panel.classList.remove("hidden");
    els.btn.setAttribute("aria-expanded", "true");
    load();
  }
  function closePanel() {
    if (!els) return;
    panelOpen = false;
    els.panel.classList.add("hidden");
    els.btn.setAttribute("aria-expanded", "false");
  }
  function togglePanel() {
    requestPermission();
    panelOpen ? closePanel() : openPanel();
  }

  ready(function () {
    els = {
      btn: document.getElementById("notifBtn"),
      badge: document.getElementById("notifBadge"),
      panel: document.getElementById("notifPanel"),
      list: document.getElementById("notifList"),
      readAll: document.getElementById("notifReadAll"),
      clear: document.getElementById("notifClear"),
    };
    if (!els.btn || !els.panel) return;

    els.btn.addEventListener("click", (e) => {
      e.stopPropagation();
      togglePanel();
    });
    els.readAll && els.readAll.addEventListener("click", (e) => { e.stopPropagation(); readAll(); });
    els.clear && els.clear.addEventListener("click", (e) => { e.stopPropagation(); clearAll(); });
    els.panel.addEventListener("click", (e) => e.stopPropagation());
    document.addEventListener("click", () => { if (panelOpen) closePanel(); });

    document.addEventListener("visibilitychange", () => { if (!document.hidden) load(); });
    window.addEventListener("focus", load);

    // Start polling once logged in.
    const startTimer = () => setInterval(load, POLL_MS);
    load();
    startTimer();
  });
})();
