(function () {
  "use strict";

  const panel = document.getElementById("workspacePanel");
  const title = document.getElementById("conversationTitle");
  const mode = document.getElementById("conversationMode");
  const newChat = document.getElementById("newChatBtn");
  const searchBtn = document.getElementById("globalSearchBtn");
  const voiceModeBtn = document.getElementById("voiceModeBtn");
  const navItems = [...document.querySelectorAll("[data-feature-view]")];
  const viewTitles = {
    today: "Today",
    communications: "Communications",
    documents: "Documents",
    browser: "Browser Action Mode",
    meetings: "Meetings",
    projects: "Projects",
    analytics: "Analytics",
  };
  const cache = {
    today: null,
    communications: null,
    documents: null,
    browser: null,
    projects: null,
    analyticsProps: null,
  };
  let currentView = "";
  let searchTimer = 0;
  let voiceRecognition = null;

  function token() {
    return localStorage.getItem("dorothy_token") || "";
  }

  async function api(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {}),
        Authorization: `Bearer ${token()}`,
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
    return data;
  }

  function escape(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function icon(name) {
    const paths = {
      calendar: '<path d="M5 5h14v15H5zM8 3v4m8-4v4M5 9h14"/>',
      mail: '<path d="M4 6h16v12H4z"/><path d="m4 7 8 6 8-6"/>',
      reminder: '<path d="M9 11.5 11 13.5 15.5 8.5"/><path d="M5 4h14v16H5z"/>',
      file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5"/>',
      browser: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18"/>',
      money: '<path d="M5 19V9m7 10V5m7 14v-7"/>',
      project: '<path d="M3 7h7l2 2h9v11H3z"/>',
      search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 4 4"/>',
      upload: '<path d="M12 16V4m-4 4 4-4 4 4M5 20h14"/>',
      mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
    };
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.file}</svg>`;
  }

  function workspaceShell(view, body, actions = "") {
    const heading = viewTitles[view] || "Dorothy";
    const header = view === "today" ? "" : `
        <header class="workspace-header">
          <div>
            <p>${formatLongDate(new Date())}</p>
            <h1>${escape(heading)}</h1>
          </div>
          <div class="workspace-header-actions">${actions}</div>
        </header>`;
    return `
      <div class="workspace-scroll">
        ${header}
        ${body}
      </div>
      <form class="workspace-command" data-workspace-command>
        <button type="button" class="workspace-attach" data-open-documents aria-label="Add file">${icon("file")}</button>
        <input name="prompt" placeholder="Ask Dorothy…" autocomplete="off">
        <button type="button" class="workspace-voice" data-open-voice aria-label="Voice mode">${icon("mic")}</button>
        <button type="submit" class="workspace-send" aria-label="Send">↗</button>
      </form>
    `;
  }

  function showView(view, options = {}) {
    if (view === "spotlight") {
      openSpotlight();
      return;
    }
    currentView = view;
    document.body.classList.add("workspace-view");
    document.body.classList.remove("finance-view");
    document.getElementById("chatPanel").classList.add("hidden");
    document.getElementById("financePanel").classList.add("hidden");
    panel.classList.remove("hidden");
    navItems.forEach(item => item.classList.toggle("active", item.dataset.featureView === view));
    document.getElementById("sidebarChatNav").classList.remove("active");
    document.getElementById("sidebarFinanceNav").classList.remove("active");
    title.textContent = viewTitles[view] || "Dorothy";
    mode.classList.add("hidden");
    newChat.classList.add("hidden");
    window.DorothyApp?.closeSidebar();
    renderView(view, options);
  }

  function showInitialView() {
    const params = new URLSearchParams(location.search);
    const requested = params.get("view");
    if (params.get("shared")) showView("documents", { force: true });
    else if (requested && viewTitles[requested]) showView(requested);
    else showView("today");
  }

  async function renderView(view, options = {}) {
    panel.innerHTML = workspaceShell(view, skeleton(view));
    bindWorkspaceChrome();
    try {
      if (view === "today") await renderToday(Boolean(options.force));
      if (view === "communications") await renderCommunications(Boolean(options.force));
      if (view === "documents") await renderDocuments(Boolean(options.force));
      if (view === "browser") await renderBrowser(Boolean(options.force));
      if (view === "meetings") await renderMeetings(Boolean(options.force));
      if (view === "projects") await renderProjects(Boolean(options.force));
      if (view === "analytics") await renderAnalytics(Boolean(options.force));
    } catch (error) {
      panel.innerHTML = workspaceShell(view, emptyState("Didn't load", error.message, "Try again"));
      bindWorkspaceChrome();
    }
  }

  function skeleton(view) {
    return `<div class="feature-skeleton" aria-label="Loading ${escape(viewTitles[view] || view)}">
      <i></i><i></i><i></i><i></i><i></i>
    </div>`;
  }

  function gaNum(value) {
    return Number(value || 0).toLocaleString("en-GB");
  }

  function gaSparkline(series) {
    const points = (series || []).map(point => Number(point.users) || 0);
    if (points.length < 2) return "";
    const max = Math.max(...points, 1);
    const width = 100;
    const height = 30;
    const step = width / (points.length - 1);
    const coords = points
      .map((value, index) => `${(index * step).toFixed(1)},${(height - (value / max) * height).toFixed(1)}`)
      .join(" ");
    return `<div class="ga-spark"><svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
      <polyline points="${coords}"/></svg></div>`;
  }

  async function connectAnalytics() {
    try {
      const result = await api("/api/analytics/connect", { method: "POST", body: "{}" });
      if (result.authorizationUrl) window.open(result.authorizationUrl, "_blank", "noopener");
    } catch (error) {
      window.alert(error.message);
    }
  }

  async function renderAnalytics(force) {
    const status = await api("/api/analytics/status");
    if (!status.clientConfigured) {
      panel.innerHTML = workspaceShell("analytics",
        emptyState("Google Analytics", "No OAuth client has been configured.", ""));
      bindWorkspaceChrome();
      return;
    }
    if (!status.connected) {
      panel.innerHTML = workspaceShell("analytics", `<section class="workspace-section">
        ${sectionHeading("browser", "Google Analytics", "Not connected", "")}
        ${emptyState("Connect Google Analytics", "Read-only access with your Google account.", "Connect with Google")}
      </section>`);
      bindWorkspaceChrome();
      panel.querySelector(".feature-empty button")?.addEventListener("click", connectAnalytics);
      return;
    }
    if (!cache.analyticsProps || force) {
      cache.analyticsProps = await api("/api/analytics/properties").catch(() => ({ properties: [] }));
    }
    const properties = cache.analyticsProps.properties || [];
    let overview = null;
    if (status.propertyId) {
      overview = await api("/api/analytics/overview").catch(() => null);
    }
    const optionsMarkup = properties
      .map(property => `<option value="${escape(property.propertyId)}"${property.propertyId === status.propertyId ? " selected" : ""}>${escape(property.displayName)}</option>`)
      .join("");
    const picker = `<section class="workspace-section ga-picker">
      ${sectionHeading("search", "Property", `${properties.length} available`, "")}
      <select data-ga-property class="ga-select" aria-label="Select GA4 property">${optionsMarkup || "<option>—</option>"}</select>
    </section>`;
    const metrics = overview && overview.ok ? `<section class="workspace-section">
      ${sectionHeading("browser", overview.propertyName || "Property", `Last ${overview.window || "28 days"}`, '<button class="soft-button" data-refresh-view>Refresh</button>')}
      <div class="ga-metrics">
        <article class="ga-metric"><span>Users</span><strong>${gaNum(overview.totals.users)}</strong></article>
        <article class="ga-metric"><span>Sessions</span><strong>${gaNum(overview.totals.sessions)}</strong></article>
        <article class="ga-metric"><span>Views</span><strong>${gaNum(overview.totals.pageViews)}</strong></article>
        <article class="ga-metric accent"><span>Engagement</span><strong>${overview.totals.engagementRate}%</strong></article>
      </div>
      ${gaSparkline(overview.series)}
    </section>`
      : `<section class="workspace-section">${emptyState("Choose a property", "Select a GA4 property to see data.", "")}</section>`;
    panel.innerHTML = workspaceShell("analytics", picker + metrics);
    bindWorkspaceChrome();
    bindAnalytics();
  }

  function bindAnalytics() {
    panel.querySelector("[data-refresh-view]")?.addEventListener("click", () => renderView("analytics", { force: true }));
    panel.querySelector("[data-ga-property]")?.addEventListener("change", async (event) => {
      const select = event.target;
      const propertyName = select.options[select.selectedIndex]?.textContent || "";
      try {
        await api("/api/analytics/property", {
          method: "POST",
          body: JSON.stringify({ propertyId: select.value, propertyName }),
        });
        renderView("analytics", { force: false });
      } catch (error) {
        window.alert(error.message);
      }
    });
  }

  async function renderToday(force) {
    if (!cache.today || force) cache.today = await api("/api/today");
    const data = cache.today;
    const mail = (data.communications?.mail || []).filter(isImportantMail).slice(0, 5);
    const calendar = (data.calendar || []).slice(0, 7);
    const reminders = (data.reminders || []).slice(0, 6);
    const documents = [...(data.documents || []), ...(data.files || [])].slice(0, 6);
    const pending = (data.browserActions || []).find(item => item.status === "preview");
    const finance = data.finance?.summary || data.finance || {};
    const body = `
      <section class="today-intro">
        <div>
          <p class="today-date">${formatLongDate(new Date())}</p>
          <h2>${greeting()}.</h2>
          <p>${todaySummary(calendar, mail, reminders)}</p>
        </div>
        <button class="soft-button" data-refresh-view>Refresh</button>
      </section>
      <div class="today-layout">
        <section class="workspace-section agenda-section ${calendar.length ? "" : "empty-agenda"}">
          ${sectionHeading("calendar", "Schedule", `${calendar.length} upcoming`, '<button data-view-jump="meetings">Prepare</button>')}
          <div class="agenda-list">${calendar.length ? calendar.map(eventRow).join("") : emptyInline("Nothing on the calendar.")}</div>
        </section>
        <section class="workspace-section communications-section">
          ${sectionHeading("mail", "Priority communications", `${mail.length} threads`, '<button data-view-jump="communications">View all</button>')}
          <div class="compact-list">${mail.length ? mail.map(mailRow).join("") : emptyInline("Inbox is clear.")}</div>
        </section>
        <section class="workspace-section reminders-section">
          ${sectionHeading("reminder", "Reminders", `${reminders.length} open`, "")}
          <div class="compact-list">${reminders.length ? reminders.map(reminderRow).join("") : emptyInline("No upcoming reminders.")}</div>
        </section>
        <section class="workspace-section finance-pulse">
          ${sectionHeading("money", "Financial snapshot", String(data.finance?.year || new Date().getFullYear()), '<button data-finance-jump>Details</button>')}
          <div class="finance-pulse-grid">
            ${metric("Revenue", finance.revenue)}
            ${metric("Gross profit", finance.grossProfit)}
            ${metric("Result", finance.operatingResult, true)}
          </div>
        </section>
        <section class="workspace-section documents-section">
          ${sectionHeading("file", "Recent documents", `${documents.length} recent`, '<button data-view-jump="documents">View all</button>')}
          <div class="document-rail">${documents.length ? documents.map(documentRow).join("") : emptyInline("No recent documents found.")}</div>
        </section>
        <section class="workspace-section browser-pulse">
          ${sectionHeading("browser", "Browser Action", pending ? "Awaiting approval" : "Nothing pending", '<button data-view-jump="browser">Open</button>')}
          ${pending ? browserPreview(pending, true) : emptyInline("Create a safe browser action with a preview.")}
        </section>
      </div>`;
    panel.innerHTML = workspaceShell("today", body);
    bindWorkspaceChrome();
    bindToday();
  }

  function bindToday() {
    panel.querySelector("[data-refresh-view]")?.addEventListener("click", () => renderView("today", { force: true }));
    panel.querySelector("[data-finance-jump]")?.addEventListener("click", () => window.DorothyApp?.showView("finance"));
    panel.querySelectorAll("[data-view-jump]").forEach(button =>
      button.addEventListener("click", () => showView(button.dataset.viewJump))
    );
    panel.querySelectorAll("[data-event-brief]").forEach(button => button.addEventListener("click", () => {
      const event = decodePayload(button.dataset.eventBrief);
      runPrompt(`Prepare a short meeting brief for the meeting "${event.title}" at ${event.startsAt}. Check the calendar, relevant emails, notes, and files.`);
    }));
    panel.querySelectorAll("[data-mail-review]").forEach(button =>
      button.addEventListener("click", () => showView("communications"))
    );
    panel.querySelectorAll("[data-mail-dismiss]").forEach(button => button.addEventListener("click", async () => {
      const mail = decodePayload(button.dataset.mailDismiss);
      button.disabled = true;
      button.textContent = "…";
      try {
        await setMailRead(mail, true);
        cache.today = null;
        await renderToday(true);
        showUndoToast("Marked as read.", async () => {
          await setMailRead(mail, false);
          cache.today = null;
          await renderToday(true);
        });
      } catch (error) {
        button.disabled = false;
        button.textContent = "Dismiss";
        showToast(error.message, true);
      }
    }));
  }

  async function renderCommunications(force) {
    if (!cache.communications || force) cache.communications = await api("/api/communications");
    const data = cache.communications;
    const mails = (data.mail || []).slice().sort((a, b) => new Date(b.receivedAt) - new Date(a.receivedAt));
    const body = `
      <div class="workspace-toolbar">
        <div class="segmented" role="tablist">
          <button class="active" data-mail-filter="priority">Priority</button>
          <button data-mail-filter="pending">Pending</button>
          <button data-mail-filter="reply">Needs reply</button>
          <button data-mail-filter="all">All</button>
        </div>
        <button class="soft-button" data-refresh-comms>Refresh inbox</button>
      </div>
      <div class="communications-workspace">
        <div class="mail-list" data-mail-list>${renderMailList(mails.filter(isImportantMail))}</div>
        <aside class="copilot-panel">
          <span class="section-label">Communication Copilot</span>
          <h2>From message to next action</h2>
          <p>Select an email and ask for a draft, task, or meeting follow-up. Nothing is sent without approval.</p>
          <div class="copilot-empty" data-copilot-detail>Select a message from the list.</div>
        </aside>
      </div>`;
    panel.innerHTML = workspaceShell("communications", body);
    bindWorkspaceChrome();
    bindCommunications(mails);
  }

  function bindCommunications(mails) {
    let active = "priority";
    const render = () => {
      const filtered = active === "all"
        ? mails
        : active === "pending"
          ? mails.filter(mail => window.DorothyCommunications?.isPendingCandidate(mail))
        : active === "reply"
          ? mails.filter(mail => window.DorothyCommunications?.isReplyCandidate(mail))
          : mails.filter(isImportantMail);
      panel.querySelector("[data-mail-list]").innerHTML = renderMailList(filtered, active);
      panel.querySelector("[data-copilot-detail]").textContent = filtered.length
        ? "Select a message from the list."
        : active === "all"
          ? "No recent messages."
          : "No pending communications. Read messages only show under “All”.";
      bindMailSelection(filtered, render);
    };
    panel.querySelectorAll("[data-mail-filter]").forEach(button => button.addEventListener("click", () => {
      active = button.dataset.mailFilter;
      panel.querySelectorAll("[data-mail-filter]").forEach(item => item.classList.toggle("active", item === button));
      render();
    }));
    panel.querySelector("[data-refresh-comms]")?.addEventListener("click", async () => {
      await api("/api/communications/refresh", { method: "POST", body: "{}" });
      cache.communications = null;
      cache.today = null;
      renderCommunications(true);
    });
    render();
  }

  function bindMailSelection(mails, rerender) {
    panel.querySelectorAll("[data-mail-index]").forEach(button => button.addEventListener("click", () => {
      const mail = mails[Number(button.dataset.mailIndex)];
      if (!mail) return;
      panel.querySelectorAll(".mail-item").forEach(item => item.classList.remove("selected"));
      button.closest(".mail-item")?.classList.add("selected");
      panel.querySelector("[data-copilot-detail]").innerHTML = `
        <div class="copilot-message">
          <span>${escape(senderName(mail.sender))}</span>
          <h3>${escape(mail.subject || "(no subject)")}</h3>
          <p>${escape(mail.excerpt || "No preview available.")}</p>
        </div>
        <div class="copilot-actions">
          <button data-copilot="draft">Draft reply</button>
          <button data-copilot="task">Create task</button>
          <button data-copilot="meeting">Add to meeting</button>
          ${mail.read ? "" : '<button class="dismiss-action" data-copilot="dismiss">Dismiss · Read</button>'}
        </div>
        <small>${mail.read ? "This message is already read." : "Dismiss updates Mail and syncs to your Apple devices."}</small>`;
      panel.querySelectorAll("[data-copilot]").forEach(action => action.addEventListener("click", async () => {
        if (action.dataset.copilot === "dismiss") {
          await dismissMail(mail, rerender, action);
          return;
        }
        const prompts = {
          draft: `Read this email and prepare only a draft reply, without sending it. From: ${mail.sender}. Subject: ${mail.subject}. Content: ${mail.excerpt}`,
          task: `Turn this email into a full communication task with an Apple Note and an appropriate Reminder, but show me first what you'll create. From: ${mail.sender}. Subject: ${mail.subject}. Content: ${mail.excerpt}`,
          meeting: `Use this email as context for an upcoming meeting and suggest a meeting note/follow-up. From: ${mail.sender}. Subject: ${mail.subject}. Content: ${mail.excerpt}`,
        };
        runPrompt(prompts[action.dataset.copilot]);
      }));
    }));
    panel.querySelectorAll("[data-mail-quick-dismiss]").forEach(button => button.addEventListener("click", async () => {
      const mail = mails[Number(button.dataset.mailQuickDismiss)];
      if (mail) await dismissMail(mail, rerender, button);
    }));
  }

  async function dismissMail(mail, rerender, button) {
    button.disabled = true;
    const previous = button.textContent;
    button.textContent = "…";
    try {
      await setMailRead(mail, true);
      mail.read = true;
      cache.today = null;
      rerender();
      showUndoToast("Dismissed and marked as read.", async () => {
        await setMailRead(mail, false);
        mail.read = false;
        cache.today = null;
        rerender();
      });
    } catch (error) {
      button.disabled = false;
      button.textContent = previous;
      showToast(error.message, true);
    }
  }

  async function setMailRead(mail, read) {
    return api(`/api/communications/${encodeURIComponent(mail.mailId)}/read`, {
      method: "POST",
      body: JSON.stringify({ account: mail.account || "", read }),
    });
  }

  async function renderDocuments(force) {
    if (!cache.documents || force) {
      const [documents, shared] = await Promise.all([api("/api/documents"), api("/api/shared")]);
      cache.documents = { documents: documents.documents || [], shared: shared.items || [] };
    }
    const data = cache.documents;
    const body = `
      <input id="documentUpload" class="hidden" type="file" accept="image/*,.pdf,.doc,.docx,.rtf,.txt,.md,.csv">
      <section class="document-drop" data-document-drop tabindex="0">
        ${icon("upload")}
        <h2>Drop a document here</h2>
        <p>PDF, image, Office file, or text. Dorothy does local extraction/OCR and finds amounts, dates, and next actions.</p>
        <button class="primary-action" data-choose-document>Choose file</button>
        <small>18 MB max · saved to Dorothy-inbox</small>
      </section>
      <div class="document-workspace">
        <section class="workspace-section">
          ${sectionHeading("file", "Documents", `${data.documents.length} stored`, "")}
          <div class="document-grid">${data.documents.length ? data.documents.map(documentCard).join("") : emptyInline("No document has been analyzed yet.")}</div>
        </section>
        <section class="workspace-section">
          ${sectionHeading("upload", "Share to Dorothy", `${data.shared.length} incoming`, "")}
          <div class="shared-list">${data.shared.length ? data.shared.map(sharedRow).join("") : emptyInline("Use your device's Share Sheet for a URL, text, or file.")}</div>
        </section>
      </div>`;
    panel.innerHTML = workspaceShell("documents", body);
    bindWorkspaceChrome();
    bindDocuments();
  }

  function bindDocuments() {
    const input = panel.querySelector("#documentUpload");
    const drop = panel.querySelector("[data-document-drop]");
    const choose = () => input.click();
    panel.querySelector("[data-choose-document]")?.addEventListener("click", choose);
    drop?.addEventListener("keydown", event => { if (event.key === "Enter") choose(); });
    drop?.addEventListener("dragover", event => { event.preventDefault(); drop.classList.add("dragging"); });
    drop?.addEventListener("dragleave", () => drop.classList.remove("dragging"));
    drop?.addEventListener("drop", event => {
      event.preventDefault();
      drop.classList.remove("dragging");
      uploadDocument(event.dataTransfer.files?.[0]);
    });
    input?.addEventListener("change", () => uploadDocument(input.files?.[0]));
    panel.querySelectorAll("[data-document-ask]").forEach(button => button.addEventListener("click", () => {
      const document = decodePayload(button.dataset.documentAsk);
      runPrompt(`Analyze the stored document "${document.name}" at ${document.path}. Give a summary, deadlines, amounts, and suggested actions.`);
    }));
    panel.querySelectorAll("[data-shared-ask]").forEach(button => button.addEventListener("click", () => {
      const item = decodePayload(button.dataset.sharedAsk);
      runPrompt(`Process this item I shared with Dorothy. Title: ${item.title}. URL: ${item.url}. Text: ${item.text}. File: ${item.filePath}`);
    }));
  }

  async function uploadDocument(file) {
    if (!file) return;
    if (file.size > 18 * 1024 * 1024) return showToast("The file exceeds 18 MB.", true);
    showToast("Analyzing document…");
    try {
      const data = await fileToBase64(file);
      const response = await api("/api/documents", {
        method: "POST",
        body: JSON.stringify({ name: file.name, type: file.type, data }),
      });
      cache.documents = null;
      showToast(response.document?.insights?.characters
        ? "The document was analyzed."
        : "The document was saved, with no recognizable text.");
      renderDocuments(true);
    } catch (error) {
      showToast(error.message, true);
    }
  }

  async function renderBrowser(force) {
    if (!cache.browser || force) cache.browser = await api("/api/browser-actions");
    const actions = cache.browser.actions || [];
    const body = `
      <div class="browser-mode-layout">
        <section class="browser-compose">
          <span class="section-label">Preview first</span>
          <h2>What do you want it to do in the dedicated browser?</h2>
          <p>Dorothy separates read-only actions from clicks, forms, downloads, and submissions. The latter only run after exact approval.</p>
          <form data-browser-form>
            <label>URL or existing tab<input name="url" type="url" placeholder="https://… (optional)"></label>
            <label>Action<textarea name="instruction" rows="5" placeholder="Open the page, compare the prices, and tell me what changed."></textarea></label>
            <button class="primary-action" type="submit">Create preview</button>
          </form>
        </section>
        <section class="browser-action-list">
          ${actions.length ? actions.map(action => browserPreview(action)).join("") : emptyState("No browser actions", "Create the first safe preview.", "")}
        </section>
      </div>`;
    panel.innerHTML = workspaceShell("browser", body);
    bindWorkspaceChrome();
    bindBrowser();
  }

  function bindBrowser() {
    panel.querySelector("[data-browser-form]")?.addEventListener("submit", async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const instruction = form.instruction.value.trim();
      if (!instruction) return;
      try {
        await api("/api/browser-actions", {
          method: "POST",
          body: JSON.stringify({ url: form.url.value.trim(), instruction }),
        });
        cache.browser = null;
        cache.today = null;
        renderBrowser(true);
      } catch (error) {
        showToast(error.message, true);
      }
    });
    panel.querySelectorAll("[data-browser-execute]").forEach(button => button.addEventListener("click", async () => {
      const action = decodePayload(button.dataset.browserExecute);
      const confirmed = !action.requiresConfirmation || window.confirm(
        `Run exactly this browser action?\n\n${action.instruction}\n\n${action.summary}`
      );
      if (!confirmed) return;
      button.disabled = true;
      button.textContent = "Running…";
      try {
        await api(`/api/browser-actions/${encodeURIComponent(action.id)}/execute`, {
          method: "POST",
          body: JSON.stringify({ confirmed }),
        });
        cache.browser = null;
        cache.today = null;
        renderBrowser(true);
      } catch (error) {
        showToast(error.message, true);
        renderBrowser(true);
      }
    }));
  }

  async function renderMeetings(force) {
    if (!cache.today || force) cache.today = await api("/api/today");
    const events = (cache.today.calendar || []).slice(0, 20);
    const body = `
      <div class="meeting-layout">
        <section class="workspace-section">
          ${sectionHeading("calendar", "Upcoming meetings", `${events.length} events`, "")}
          <div class="meeting-list">${events.length ? events.map(meetingCard).join("") : emptyInline("No upcoming meetings found.")}</div>
        </section>
        <section class="workspace-section meeting-notes">
          <span class="section-label">After the meeting</span>
          <h2>Notes into actions</h2>
          <p>Write rough notes and Dorothy will turn them into a summary, decisions, tasks, and follow-ups.</p>
          <textarea data-meeting-notes rows="10" placeholder="We discussed… It was decided… Nick will…"></textarea>
          <button class="primary-action" data-process-meeting>Process notes</button>
        </section>
      </div>`;
    panel.innerHTML = workspaceShell("meetings", body);
    bindWorkspaceChrome();
    panel.querySelectorAll("[data-meeting-brief]").forEach(button => button.addEventListener("click", () => {
      const event = decodePayload(button.dataset.meetingBrief);
      runPrompt(`Prepare a meeting brief for "${event.title}" (${event.startsAt}). Use the calendar, relevant emails, Apple Notes, and files. Give the goal, context, open topics, and suggested questions.`);
    }));
    panel.querySelector("[data-process-meeting]")?.addEventListener("click", () => {
      const notes = panel.querySelector("[data-meeting-notes]").value.trim();
      if (!notes) return;
      runPrompt(`Turn the following meeting notes into a short summary, decisions, owners, deadlines, and suggested follow-ups. Don't send anything without approval.\n\n${notes}`);
    });
  }

  async function renderProjects(force) {
    if (!cache.projects || force) cache.projects = await api("/api/projects");
    const projects = cache.projects.projects || [];
    const body = `
      <div class="projects-layout">
        <section class="project-list-pane">
          <form class="project-create" data-project-form>
            <input name="name" placeholder="New project" maxlength="120">
            <button type="submit">＋</button>
          </form>
          <div class="project-list">${projects.length ? projects.map(projectRow).join("") : emptyInline("Create a project for a client or goal.")}</div>
        </section>
        <section class="project-detail-pane" data-project-detail>
          ${emptyState("Persistent context", "Connect chats, notes, decisions, and next steps around a goal.", "")}
        </section>
      </div>`;
    panel.innerHTML = workspaceShell("projects", body);
    bindWorkspaceChrome();
    bindProjects(projects);
  }

  function bindProjects(projects) {
    panel.querySelector("[data-project-form]")?.addEventListener("submit", async event => {
      event.preventDefault();
      const name = event.currentTarget.name.value.trim();
      if (!name) return;
      await api("/api/projects", { method: "POST", body: JSON.stringify({ name }) });
      cache.projects = null;
      cache.today = null;
      renderProjects(true);
    });
    panel.querySelectorAll("[data-project-id]").forEach(button => button.addEventListener("click", () => {
      const project = projects.find(item => item.id === button.dataset.projectId);
      if (!project) return;
      panel.querySelectorAll("[data-project-id]").forEach(item => item.classList.toggle("selected", item === button));
      const detail = panel.querySelector("[data-project-detail]");
      detail.innerHTML = `
        <span class="section-label">${escape(project.status)}</span>
        <h2>${escape(project.name)}</h2>
        <textarea data-project-description rows="3" placeholder="Description and goal">${escape(project.description)}</textarea>
        <div class="project-actions">
          <button data-project-chat>Chat with context</button>
          <button data-project-done>${project.status === "done" ? "Reactivate" : "Complete"}</button>
        </div>
        <form class="project-note-form" data-project-note-form>
          <textarea name="note" rows="4" placeholder="New decision, note, or next step"></textarea>
          <button class="primary-action" type="submit">Add note</button>
        </form>
        <div class="project-notes">${(project.notes || []).length ? project.notes.map(note => `
          <article><p>${escape(note.text)}</p><small>${formatDateTime(note.createdAt)}</small></article>`).join("") : emptyInline("No notes yet.")}</div>`;
      detail.querySelector("[data-project-description]").addEventListener("change", async event => {
        await api(`/api/projects/${encodeURIComponent(project.id)}`, {
          method: "POST",
          body: JSON.stringify({ description: event.target.value }),
        });
        cache.projects = null;
      });
      detail.querySelector("[data-project-chat]").addEventListener("click", () =>
        runPrompt(`Work with me on the project "${project.name}". Description: ${project.description}. Notes: ${(project.notes || []).map(note => note.text).join(" | ")}`)
      );
      detail.querySelector("[data-project-done]").addEventListener("click", async () => {
        await api(`/api/projects/${encodeURIComponent(project.id)}`, {
          method: "POST",
          body: JSON.stringify({ status: project.status === "done" ? "active" : "done" }),
        });
        cache.projects = null;
        cache.today = null;
        renderProjects(true);
      });
      detail.querySelector("[data-project-note-form]").addEventListener("submit", async event => {
        event.preventDefault();
        const note = event.currentTarget.note.value.trim();
        if (!note) return;
        await api(`/api/projects/${encodeURIComponent(project.id)}`, {
          method: "POST",
          body: JSON.stringify({ note }),
        });
        cache.projects = null;
        cache.today = null;
        renderProjects(true);
      });
    }));
  }

  function ensureSpotlight() {
    let dialog = document.getElementById("spotlightDialog");
    if (dialog) return dialog;
    dialog = document.createElement("dialog");
    dialog.id = "spotlightDialog";
    dialog.className = "spotlight-dialog";
    dialog.innerHTML = `
      <div class="spotlight-shell">
        <label class="spotlight-input">${icon("search")}<input type="search" placeholder="Search all of Dorothy…" autocomplete="off"><kbd>esc</kbd></label>
        <div class="spotlight-results"><div class="spotlight-hint">Chats, emails, Apple Notes, files, projects, and documents.</div></div>
      </div>`;
    document.body.appendChild(dialog);
    dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });
    const input = dialog.querySelector("input");
    input.addEventListener("input", () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => runSearch(input.value), 180);
    });
    return dialog;
  }

  function openSpotlight() {
    const dialog = ensureSpotlight();
    if (!dialog.open) dialog.showModal();
    const input = dialog.querySelector("input");
    input.value = "";
    dialog.querySelector(".spotlight-results").innerHTML =
      '<div class="spotlight-hint">Chats, emails, Apple Notes, files, projects, and documents.</div>';
    setTimeout(() => input.focus(), 0);
  }

  async function runSearch(query) {
    const results = ensureSpotlight().querySelector(".spotlight-results");
    if (!query.trim()) {
      results.innerHTML = '<div class="spotlight-hint">Type what you remember. You don\'t need to know where it is.</div>';
      return;
    }
    results.innerHTML = '<div class="spotlight-hint">Searching…</div>';
    try {
      const data = await api(`/api/search?q=${encodeURIComponent(query)}`);
      const paint = items => {
        results.innerHTML = items.length
          ? items.map((item, index) => `
          <button class="spotlight-result" data-search-index="${index}">
            <span class="result-icon">${resultIcon(item.type)}</span>
            <span><strong>${escape(item.title)}</strong><small>${escape(item.subtitle || item.excerpt || item.type)}</small></span>
            <em>${escape(item.type)}</em>
          </button>`).join("")
          : '<div class="spotlight-hint">Nothing relevant found.</div>';
        results.querySelectorAll("[data-search-index]").forEach(button => button.addEventListener("click", () => {
          const item = items[Number(button.dataset.searchIndex)];
          ensureSpotlight().close();
          openSearchResult(item);
        }));
      };
      const initial = data.results || [];
      paint(initial);
      api(`/api/search/notes?q=${encodeURIComponent(query)}`).then(notes => {
        const input = ensureSpotlight().querySelector("input");
        if (input.value.trim() !== query.trim()) return;
        const merged = [...initial, ...(notes.results || [])]
          .filter((item, index, rows) => rows.findIndex(row => `${row.type}:${row.id}` === `${item.type}:${item.id}`) === index)
          .slice(0, 50);
        paint(merged);
      }).catch(() => {});
    } catch (error) {
      results.innerHTML = `<div class="spotlight-hint">${escape(error.message)}</div>`;
    }
  }

  function openSearchResult(item) {
    if (item.type === "chat") return window.DorothyApp?.openSession(item.id, { title: item.title });
    if (item.type === "project") return showView("projects");
    if (item.type === "mail") return showView("communications");
    if (item.type === "document" || item.type === "shared") return showView("documents");
    runPrompt(`I found this via Dorothy Spotlight and want to open/analyze it: ${item.title}. ${item.subtitle || ""} ${item.excerpt || ""}`);
  }

  function ensureVoiceDialog() {
    let dialog = document.getElementById("voiceDialog");
    if (dialog) return dialog;
    dialog = document.createElement("dialog");
    dialog.id = "voiceDialog";
    dialog.className = "voice-dialog";
    dialog.innerHTML = `
      <div class="voice-shell">
        <button class="voice-close" type="button" aria-label="Close">×</button>
        <div class="voice-orb"><i></i><i></i><i></i></div>
        <span class="voice-state">Ready to listen</span>
        <p class="voice-transcript">Press the microphone and speak naturally.</p>
        <button class="voice-main" type="button" aria-label="Start voice conversation">${icon("mic")}</button>
        <div class="voice-actions">
          <button data-voice-clear>Clear</button>
          <button data-voice-send disabled>Send</button>
        </div>
      </div>`;
    document.body.appendChild(dialog);
    dialog.querySelector(".voice-close").addEventListener("click", () => stopVoice(dialog, false));
    dialog.querySelector(".voice-main").addEventListener("click", () => {
      if (voiceRecognition) stopVoiceRecognition(dialog);
      else startVoice(dialog);
    });
    dialog.querySelector("[data-voice-clear]").addEventListener("click", () => {
      dialog.querySelector(".voice-transcript").textContent = "Press the microphone and speak naturally.";
      dialog.querySelector("[data-voice-send]").disabled = true;
    });
    dialog.querySelector("[data-voice-send]").addEventListener("click", () => stopVoice(dialog, true));
    return dialog;
  }

  function openVoice() {
    const dialog = ensureVoiceDialog();
    if (!dialog.open) dialog.showModal();
  }

  function startVoice(dialog) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      dialog.querySelector(".voice-state").textContent = "Not supported by this browser";
      return;
    }
    window.DorothyApp?.audioStop();
    const recognition = new SpeechRecognition();
    voiceRecognition = recognition;
    recognition.lang = navigator.language?.startsWith("en") ? "en-US" : "el-GR";
    recognition.continuous = true;
    recognition.interimResults = true;
    let finalText = "";
    dialog.classList.add("listening");
    dialog.querySelector(".voice-state").textContent = "Listening… speak naturally";
    recognition.onresult = event => {
      let interim = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const text = event.results[index][0].transcript;
        if (event.results[index].isFinal) finalText += `${text} `;
        else interim += text;
      }
      const transcript = `${finalText}${interim}`.trim();
      dialog.querySelector(".voice-transcript").textContent = transcript || "Listening…";
      dialog.querySelector("[data-voice-send]").disabled = !transcript;
    };
    recognition.onerror = () => stopVoiceRecognition(dialog);
    recognition.onend = () => {
      if (voiceRecognition === recognition) stopVoiceRecognition(dialog);
    };
    recognition.start();
  }

  function stopVoiceRecognition(dialog) {
    const recognition = voiceRecognition;
    voiceRecognition = null;
    if (recognition) {
      recognition.onend = null;
      try { recognition.stop(); } catch {}
    }
    dialog.classList.remove("listening");
    dialog.querySelector(".voice-state").textContent = "Ready to send";
  }

  function stopVoice(dialog, send) {
    stopVoiceRecognition(dialog);
    const text = dialog.querySelector(".voice-transcript").textContent.trim();
    dialog.close();
    if (send && text && !text.startsWith("Press the microphone")) runPrompt(text);
  }

  function bindWorkspaceChrome() {
    panel.querySelector("[data-workspace-command]")?.addEventListener("submit", event => {
      event.preventDefault();
      const prompt = event.currentTarget.prompt.value.trim();
      if (prompt) runPrompt(prompt);
    });
    panel.querySelector("[data-open-documents]")?.addEventListener("click", () => showView("documents"));
    panel.querySelector("[data-open-voice]")?.addEventListener("click", openVoice);
  }

  async function runPrompt(prompt) {
    if (!prompt) return;
    await window.DorothyApp?.showView("chat", { load: false });
    window.DorothyApp?.sendMessage(prompt);
  }

  function sectionHeading(iconName, heading, meta, action) {
    return `<header class="section-heading">
      <div>${icon(iconName)}<span><strong>${escape(heading)}</strong><small>${escape(meta)}</small></span></div>
      ${action || ""}
    </header>`;
  }

  function eventRow(event) {
    return `<article class="agenda-row">
      <time>${event.allDay ? "All day" : formatTime(event.startsAt)}</time>
      <i></i>
      <div><strong>${escape(event.title)}</strong><small>${escape(event.location || event.calendar)}</small></div>
      <button data-event-brief="${encodePayload(event)}">Brief</button>
    </article>`;
  }

  function mailRow(mail) {
    return `<article class="compact-row">
      <span class="avatar">${escape(initials(senderName(mail.sender)))}</span>
      <div><strong>${escape(senderName(mail.sender))}</strong><small>${escape(mail.subject || "(no subject)")}</small></div>
      <span class="compact-actions">
        <button data-mail-review>Review</button>
        <button class="dismiss-action" data-mail-dismiss="${escape(encodePayload({
          mailId: mail.mailId,
          account: mail.account,
          sender: mail.sender,
          subject: mail.subject,
        }))}">Dismiss</button>
      </span>
    </article>`;
  }

  function reminderRow(reminder) {
    return `<article class="reminder-row">
      <span class="check-ring"></span>
      <div><strong>${escape(reminder.title)}</strong><small>${escape(reminder.dueAt ? formatDateTime(reminder.dueAt) : reminder.list)}</small></div>
    </article>`;
  }

  function documentRow(document) {
    return `<article class="document-row">
      ${icon("file")}<div><strong>${escape(document.name || document.title)}</strong><small>${escape(formatDateTime(document.createdAt || document.updatedAt))}</small></div>
    </article>`;
  }

  function documentCard(document) {
    return `<article class="document-card">
      <div class="document-card-icon">${icon("file")}</div>
      <div><strong>${escape(document.name)}</strong><small>${formatBytes(document.size)} · ${escape(formatDateTime(document.createdAt))}</small></div>
      <p>${escape(document.insights?.excerpt || "No recognizable text found.")}</p>
      <div class="insight-tags">${(document.insights?.amounts || []).slice(0, 3).map(value => `<span>${escape(value)}</span>`).join("")}${(document.insights?.dates || []).slice(0, 3).map(value => `<span>${escape(value)}</span>`).join("")}</div>
      <button data-document-ask="${encodePayload(document)}">Analyze with Dorothy</button>
    </article>`;
  }

  function sharedRow(item) {
    return `<article class="shared-row">
      <div><strong>${escape(item.title || item.url || item.fileName || "Shared item")}</strong><small>${escape(item.url || item.fileName || formatDateTime(item.createdAt))}</small></div>
      <button data-shared-ask="${encodePayload(item)}">Open</button>
    </article>`;
  }

  function browserPreview(action, compact) {
    const label = action.risk === "confirmation" ? "Needs approval" : "Read-only";
    return `<article class="browser-preview ${compact ? "compact" : ""}" data-risk="${escape(action.risk)}">
      <header><span>${escape(label)}</span><small>${escape(action.status)}</small></header>
      <strong>${escape(action.instruction)}</strong>
      ${action.url ? `<a href="${escape(action.url)}" target="_blank" rel="noreferrer">${escape(action.url)}</a>` : ""}
      <p>${escape(action.summary)}</p>
      ${action.result ? `<div class="browser-result">${escape(action.result)}</div>` : ""}
      ${action.status === "preview" ? `<button data-browser-execute="${encodePayload(action)}">${action.requiresConfirmation ? "Approve and run" : "Run"}</button>` : ""}
    </article>`;
  }

  function meetingCard(event) {
    return `<article class="meeting-card">
      <time><strong>${formatTime(event.startsAt)}</strong><small>${formatShortDate(event.startsAt)}</small></time>
      <div><h3>${escape(event.title)}</h3><p>${escape(event.location || event.calendar)}${event.notes ? ` · ${escape(event.notes)}` : ""}</p></div>
      <button data-meeting-brief="${encodePayload(event)}">Prepare brief</button>
    </article>`;
  }

  function projectRow(project) {
    return `<button class="project-row" data-project-id="${escape(project.id)}">
      <span>${escape(project.name.slice(0, 1).toUpperCase())}</span>
      <div><strong>${escape(project.name)}</strong><small>${escape(project.description || `${(project.notes || []).length} notes`)}</small></div>
      <em>${escape(project.status)}</em>
    </button>`;
  }

  function renderMailList(mails, active = "priority") {
    if (!mails.length) {
      return emptyInline(active === "all"
        ? "No recent messages."
        : "No pending communications. Read messages are considered handled.");
    }
    return mails.slice(0, 30).map((mail, index) => `
      <article class="mail-item ${mail.read ? "read" : "unread"}">
        <button class="mail-item-main" data-mail-index="${index}">
          <span class="avatar">${escape(initials(senderName(mail.sender)))}</span>
          <span><strong>${escape(senderName(mail.sender))}</strong><b>${escape(mail.subject || "(no subject)")}</b><small>${escape(mail.excerpt || "")}</small>${mail.intelligence ? `<small>${escape(intelligenceLabel(mail.intelligence))}</small>` : ""}</span>
          <time>${formatMailTime(mail.receivedAt)}</time>
        </button>
        ${mail.read
          ? '<span class="mail-read-state">Read</span>'
          : `<button class="mail-dismiss dismiss-action" data-mail-quick-dismiss="${index}">Dismiss</button>`}
      </article>`).join("");
  }

  function metric(label, value, accent) {
    return `<div class="${accent ? "accent" : ""}"><span>${escape(label)}</span><strong>${formatMoney(value)}</strong></div>`;
  }

  function emptyState(heading, copy, action) {
    return `<div class="feature-empty"><h2>${escape(heading)}</h2><p>${escape(copy)}</p>${action ? `<button>${escape(action)}</button>` : ""}</div>`;
  }

  function emptyInline(copy) {
    return `<div class="empty-inline">${escape(copy)}</div>`;
  }

  function isImportantMail(mail) {
    return window.DorothyCommunications?.isActionable(mail) || mail.flagged;
  }

  function intelligenceLabel(intelligence) {
    const category = {
      work: "Work",
      personal: "Personal",
      otp: "OTP",
      security: "Security",
      transaction: "Transaction",
      notification: "Notification",
      marketing: "Marketing",
      noise: "Noise",
      unknown: "Unknown",
    }[intelligence.category] || intelligence.category;
    const action = {
      reply: "needs reply",
      task: "possible action",
      review: "needs review",
      none: "",
    }[intelligence.action] || "";
    return [category, action].filter(Boolean).join(" · ");
  }

  function todaySummary(calendar, mail, reminders) {
    const parts = [];
    if (calendar.length) parts.push(`${calendar.length} events`);
    if (mail.length) parts.push(`${mail.length} important communications`);
    if (reminders.length) parts.push(`${reminders.length} reminders`);
    return parts.length ? `${parts.join(" · ")}. Everything in one clear view.` : "The day is clear.";
  }

  function greeting() {
    const hour = new Date().getHours();
    return hour < 12 ? "Good morning" : hour < 18 ? "Good evening" : "Good evening";
  }

  function senderName(value) {
    return String(value || "Unknown").replace(/\s*<.*?>\s*/, "").trim() || "Unknown";
  }

  function initials(value) {
    return String(value).split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();
  }

  function formatTime(value) {
    if (!value) return "—";
    return new Date(value).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  }

  function formatShortDate(value) {
    if (!value) return "";
    return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  }

  function formatLongDate(value) {
    return value.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  }

  function formatDateTime(value) {
    if (!value) return "No date";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  }

  function formatMailTime(value) {
    if (!value) return "";
    const date = new Date(value);
    return date.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  }

  function formatMoney(value) {
    const amount = Number(value || 0);
    return new Intl.NumberFormat("en-GB", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(amount);
  }

  function formatBytes(value) {
    const bytes = Number(value || 0);
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  function resultIcon(type) {
    return { chat: "◫", mail: "✉", note: "N", file: "⌑", project: "P", document: "D", shared: "↗" }[type] || "•";
  }

  function encodePayload(value) {
    return encodeURIComponent(JSON.stringify(value));
  }

  function decodePayload(value) {
    try { return JSON.parse(decodeURIComponent(value)); } catch { return {}; }
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",").pop());
      reader.onerror = () => reject(reader.error || new Error("File read failed"));
      reader.readAsDataURL(file);
    });
  }

  function showToast(message, error) {
    const toast = document.createElement("div");
    toast.className = `feature-toast ${error ? "error" : ""}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("visible"));
    setTimeout(() => {
      toast.classList.remove("visible");
      setTimeout(() => toast.remove(), 200);
    }, 2600);
  }

  function showUndoToast(message, onUndo) {
    const toast = document.createElement("div");
    toast.className = "feature-toast action-toast";
    const text = document.createElement("span");
    text.textContent = message;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Undo";
    toast.append(text, button);
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("visible"));
    const close = () => {
      toast.classList.remove("visible");
      setTimeout(() => toast.remove(), 200);
    };
    const timer = setTimeout(close, 6000);
    button.addEventListener("click", async () => {
      clearTimeout(timer);
      button.disabled = true;
      try {
        await onUndo();
        close();
      } catch (error) {
        toast.classList.add("error");
        text.textContent = error.message;
        button.remove();
        setTimeout(close, 2600);
      }
    });
  }

  navItems.forEach(item => item.addEventListener("click", () => showView(item.dataset.featureView)));
  searchBtn?.addEventListener("click", openSpotlight);
  voiceModeBtn?.addEventListener("click", openVoice);
  document.addEventListener("keydown", event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      openSpotlight();
    }
    if (event.key === "Escape" && voiceRecognition) stopVoiceRecognition(ensureVoiceDialog());
  });

  window.DorothyFeatures = { openSpotlight, openVoice, showInitialView, showView };
})();
