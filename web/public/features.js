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
    today: "Σήμερα",
    communications: "Επικοινωνίες",
    documents: "Έγγραφα",
    browser: "Browser Action Mode",
    meetings: "Συναντήσεις",
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
        <button type="button" class="workspace-attach" data-open-documents aria-label="Προσθήκη αρχείου">${icon("file")}</button>
        <input name="prompt" placeholder="Ρώτησε τη Dorothy…" autocomplete="off">
        <button type="button" class="workspace-voice" data-open-voice aria-label="Voice mode">${icon("mic")}</button>
        <button type="submit" class="workspace-send" aria-label="Αποστολή">↗</button>
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
      panel.innerHTML = workspaceShell(view, emptyState("Δεν φορτώθηκε", error.message, "Δοκίμασε ξανά"));
      bindWorkspaceChrome();
    }
  }

  function skeleton(view) {
    return `<div class="feature-skeleton" aria-label="Φόρτωση ${escape(viewTitles[view] || view)}">
      <i></i><i></i><i></i><i></i><i></i>
    </div>`;
  }

  function gaNum(value) {
    return Number(value || 0).toLocaleString("el-GR");
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
        emptyState("Google Analytics", "Δεν έχει ρυθμιστεί OAuth client.", ""));
      bindWorkspaceChrome();
      return;
    }
    if (!status.connected) {
      panel.innerHTML = workspaceShell("analytics", `<section class="workspace-section">
        ${sectionHeading("browser", "Google Analytics", "Μη συνδεδεμένο", "")}
        ${emptyState("Σύνδεσε το Google Analytics", "Read-only πρόσβαση με τον Google λογαριασμό σου.", "Σύνδεση με Google")}
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
      ${sectionHeading("search", "Property", `${properties.length} διαθέσιμα`, "")}
      <select data-ga-property class="ga-select" aria-label="Επιλογή GA4 property">${optionsMarkup || "<option>—</option>"}</select>
    </section>`;
    const metrics = overview && overview.ok ? `<section class="workspace-section">
      ${sectionHeading("browser", overview.propertyName || "Property", `Τελευταίες ${overview.window || "28 ημέρες"}`, '<button class="soft-button" data-refresh-view>Ανανέωση</button>')}
      <div class="ga-metrics">
        <article class="ga-metric"><span>Χρήστες</span><strong>${gaNum(overview.totals.users)}</strong></article>
        <article class="ga-metric"><span>Sessions</span><strong>${gaNum(overview.totals.sessions)}</strong></article>
        <article class="ga-metric"><span>Προβολές</span><strong>${gaNum(overview.totals.pageViews)}</strong></article>
        <article class="ga-metric accent"><span>Engagement</span><strong>${overview.totals.engagementRate}%</strong></article>
      </div>
      ${gaSparkline(overview.series)}
    </section>`
      : `<section class="workspace-section">${emptyState("Διάλεξε property", "Επίλεξε ένα GA4 property για να δεις στοιχεία.", "")}</section>`;
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
          <h2>${greeting()}, χρήστη.</h2>
          <p>${todaySummary(calendar, mail, reminders)}</p>
        </div>
        <button class="soft-button" data-refresh-view>Ανανέωση</button>
      </section>
      <div class="today-layout">
        <section class="workspace-section agenda-section ${calendar.length ? "" : "empty-agenda"}">
          ${sectionHeading("calendar", "Πρόγραμμα", `${calendar.length} επόμενα`, '<button data-view-jump="meetings">Προετοιμασία</button>')}
          <div class="agenda-list">${calendar.length ? calendar.map(eventRow).join("") : emptyInline("Δεν υπάρχει κάτι στο ημερολόγιο.")}</div>
        </section>
        <section class="workspace-section communications-section">
          ${sectionHeading("mail", "Επικοινωνίες προτεραιότητας", `${mail.length} θέματα`, '<button data-view-jump="communications">Προβολή όλων</button>')}
          <div class="compact-list">${mail.length ? mail.map(mailRow).join("") : emptyInline("Το inbox είναι καθαρό.")}</div>
        </section>
        <section class="workspace-section reminders-section">
          ${sectionHeading("reminder", "Υπενθυμίσεις", `${reminders.length} ανοιχτές`, "")}
          <div class="compact-list">${reminders.length ? reminders.map(reminderRow).join("") : emptyInline("Δεν υπάρχουν κοντινές υπενθυμίσεις.")}</div>
        </section>
        <section class="workspace-section finance-pulse">
          ${sectionHeading("money", "Οικονομική εικόνα", String(data.finance?.year || new Date().getFullYear()), '<button data-finance-jump>Αναλυτικά</button>')}
          <div class="finance-pulse-grid">
            ${metric("Έσοδα", finance.revenue)}
            ${metric("Μικτό κέρδος", finance.grossProfit)}
            ${metric("Αποτέλεσμα", finance.operatingResult, true)}
          </div>
        </section>
        <section class="workspace-section documents-section">
          ${sectionHeading("file", "Πρόσφατα έγγραφα", `${documents.length} πρόσφατα`, '<button data-view-jump="documents">Προβολή όλων</button>')}
          <div class="document-rail">${documents.length ? documents.map(documentRow).join("") : emptyInline("Δεν βρέθηκαν πρόσφατα έγγραφα.")}</div>
        </section>
        <section class="workspace-section browser-pulse">
          ${sectionHeading("browser", "Browser Action", pending ? "Αναμένει έγκριση" : "Καμία εκκρεμότητα", '<button data-view-jump="browser">Άνοιγμα</button>')}
          ${pending ? browserPreview(pending, true) : emptyInline("Δημιούργησε μια ασφαλή browser ενέργεια με προεπισκόπηση.")}
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
      runPrompt(`Ετοίμασέ μου σύντομο meeting brief για τη συνάντηση "${event.title}" στις ${event.startsAt}. Έλεγξε calendar, σχετικά emails, notes και αρχεία.`);
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
        showUndoToast("Η επικοινωνία έγινε διαβασμένη.", async () => {
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
          <button class="active" data-mail-filter="priority">Προτεραιότητα</button>
          <button data-mail-filter="pending">Εκκρεμότητες</button>
          <button data-mail-filter="reply">Χρειάζονται απάντηση</button>
          <button data-mail-filter="all">Όλα</button>
        </div>
        <button class="soft-button" data-refresh-comms>Ανανέωση inbox</button>
      </div>
      <div class="communications-workspace">
        <div class="mail-list" data-mail-list>${renderMailList(mails.filter(isImportantMail))}</div>
        <aside class="copilot-panel">
          <span class="section-label">Communication Copilot</span>
          <h2>Από μήνυμα σε επόμενη ενέργεια</h2>
          <p>Επίλεξε ένα email και ζήτησε draft, task ή meeting follow-up. Τίποτα δεν αποστέλλεται χωρίς έγκριση.</p>
          <div class="copilot-empty" data-copilot-detail>Επίλεξε ένα μήνυμα από τη λίστα.</div>
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
        ? "Επίλεξε ένα μήνυμα από τη λίστα."
        : active === "all"
          ? "Δεν υπάρχουν πρόσφατα μηνύματα."
          : "Καμία εκκρεμής επικοινωνία. Τα διαβασμένα εμφανίζονται μόνο στο «Όλα».";
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
          <h3>${escape(mail.subject || "(χωρίς θέμα)")}</h3>
          <p>${escape(mail.excerpt || "Δεν υπάρχει διαθέσιμο preview.")}</p>
        </div>
        <div class="copilot-actions">
          <button data-copilot="draft">Σύνταξη απάντησης</button>
          <button data-copilot="task">Δημιουργία task</button>
          <button data-copilot="meeting">Προσθήκη σε meeting</button>
          ${mail.read ? "" : '<button class="dismiss-action" data-copilot="dismiss">Dismiss · Διαβάστηκε</button>'}
        </div>
        <small>${mail.read ? "Το μήνυμα είναι ήδη διαβασμένο." : "Το Dismiss ενημερώνει το Mail και συγχρονίζεται στις Apple συσκευές σου."}</small>`;
      panel.querySelectorAll("[data-copilot]").forEach(action => action.addEventListener("click", async () => {
        if (action.dataset.copilot === "dismiss") {
          await dismissMail(mail, rerender, action);
          return;
        }
        const prompts = {
          draft: `Διάβασε αυτό το email και ετοίμασε μόνο draft απάντησης, χωρίς αποστολή. Από: ${mail.sender}. Θέμα: ${mail.subject}. Περιεχόμενο: ${mail.excerpt}`,
          task: `Μετέτρεψε αυτό το email σε πλήρες communication task με Apple Note και κατάλληλο Reminder, αλλά δείξε μου πρώτα τι θα δημιουργήσεις. Από: ${mail.sender}. Θέμα: ${mail.subject}. Περιεχόμενο: ${mail.excerpt}`,
          meeting: `Χρησιμοποίησε αυτό το email ως context για επόμενη συνάντηση και πρότεινε meeting note/follow-up. Από: ${mail.sender}. Θέμα: ${mail.subject}. Περιεχόμενο: ${mail.excerpt}`,
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
      showUndoToast("Dismissed και σημειώθηκε ως διαβασμένο.", async () => {
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
        <h2>Ρίξε ένα έγγραφο εδώ</h2>
        <p>PDF, εικόνα, Office ή κείμενο. Η Dorothy κάνει local extraction/OCR και βρίσκει ποσά, ημερομηνίες και επόμενες ενέργειες.</p>
        <button class="primary-action" data-choose-document>Επιλογή αρχείου</button>
        <small>Μέγιστο 18 MB · αποθήκευση στο Dorothy-inbox</small>
      </section>
      <div class="document-workspace">
        <section class="workspace-section">
          ${sectionHeading("file", "Έγγραφα", `${data.documents.length} αποθηκευμένα`, "")}
          <div class="document-grid">${data.documents.length ? data.documents.map(documentCard).join("") : emptyInline("Δεν έχει αναλυθεί ακόμη κάποιο έγγραφο.")}</div>
        </section>
        <section class="workspace-section">
          ${sectionHeading("upload", "Share to Dorothy", `${data.shared.length} εισερχόμενα`, "")}
          <div class="shared-list">${data.shared.length ? data.shared.map(sharedRow).join("") : emptyInline("Χρησιμοποίησε το Share Sheet της συσκευής σου για URL, κείμενο ή αρχείο.")}</div>
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
      runPrompt(`Ανάλυσε το αποθηκευμένο έγγραφο "${document.name}" στο ${document.path}. Δώσε σύνοψη, deadlines, ποσά και προτεινόμενες ενέργειες.`);
    }));
    panel.querySelectorAll("[data-shared-ask]").forEach(button => button.addEventListener("click", () => {
      const item = decodePayload(button.dataset.sharedAsk);
      runPrompt(`Επεξεργάσου αυτό που μοιράστηκα στη Dorothy. Τίτλος: ${item.title}. URL: ${item.url}. Κείμενο: ${item.text}. Αρχείο: ${item.filePath}`);
    }));
  }

  async function uploadDocument(file) {
    if (!file) return;
    if (file.size > 18 * 1024 * 1024) return showToast("Το αρχείο ξεπερνά τα 18 MB.", true);
    showToast("Ανάλυση εγγράφου…");
    try {
      const data = await fileToBase64(file);
      const response = await api("/api/documents", {
        method: "POST",
        body: JSON.stringify({ name: file.name, type: file.type, data }),
      });
      cache.documents = null;
      showToast(response.document?.insights?.characters
        ? "Το έγγραφο αναλύθηκε."
        : "Το έγγραφο αποθηκεύτηκε, χωρίς αναγνωρίσιμο κείμενο.");
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
          <h2>Τι θέλεις να κάνει στον dedicated browser;</h2>
          <p>Η Dorothy ξεχωρίζει τις read-only ενέργειες από clicks, forms, downloads και αποστολές. Οι δεύτερες εκτελούνται μόνο μετά από ακριβή έγκριση.</p>
          <form data-browser-form>
            <label>URL ή υπάρχον tab<input name="url" type="url" placeholder="https://… (προαιρετικό)"></label>
            <label>Ενέργεια<textarea name="instruction" rows="5" placeholder="Άνοιξε τη σελίδα, σύγκρινε τις τιμές και πες μου τι άλλαξε."></textarea></label>
            <button class="primary-action" type="submit">Δημιουργία προεπισκόπησης</button>
          </form>
        </section>
        <section class="browser-action-list">
          ${actions.length ? actions.map(action => browserPreview(action)).join("") : emptyState("Καμία browser ενέργεια", "Δημιούργησε την πρώτη ασφαλή προεπισκόπηση.", "")}
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
        `Να εκτελεστεί ακριβώς αυτή η browser ενέργεια;\n\n${action.instruction}\n\n${action.summary}`
      );
      if (!confirmed) return;
      button.disabled = true;
      button.textContent = "Εκτέλεση…";
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
          ${sectionHeading("calendar", "Επόμενες συναντήσεις", `${events.length} γεγονότα`, "")}
          <div class="meeting-list">${events.length ? events.map(meetingCard).join("") : emptyInline("Δεν βρέθηκαν επόμενες συναντήσεις.")}</div>
        </section>
        <section class="workspace-section meeting-notes">
          <span class="section-label">Μετά τη συνάντηση</span>
          <h2>Σημειώσεις σε actions</h2>
          <p>Γράψε πρόχειρες σημειώσεις και η Dorothy θα τις μετατρέψει σε σύνοψη, αποφάσεις, tasks και follow-ups.</p>
          <textarea data-meeting-notes rows="10" placeholder="Συζητήσαμε… Αποφασίστηκε… Ο Νίκος θα…"></textarea>
          <button class="primary-action" data-process-meeting>Επεξεργασία σημειώσεων</button>
        </section>
      </div>`;
    panel.innerHTML = workspaceShell("meetings", body);
    bindWorkspaceChrome();
    panel.querySelectorAll("[data-meeting-brief]").forEach(button => button.addEventListener("click", () => {
      const event = decodePayload(button.dataset.meetingBrief);
      runPrompt(`Ετοίμασε meeting brief για "${event.title}" (${event.startsAt}). Χρησιμοποίησε ημερολόγιο, σχετικά emails, Apple Notes και αρχεία. Δώσε στόχο, context, ανοιχτά θέματα και προτεινόμενες ερωτήσεις.`);
    }));
    panel.querySelector("[data-process-meeting]")?.addEventListener("click", () => {
      const notes = panel.querySelector("[data-meeting-notes]").value.trim();
      if (!notes) return;
      runPrompt(`Μετέτρεψε τις παρακάτω σημειώσεις συνάντησης σε σύντομη σύνοψη, αποφάσεις, υπεύθυνους, deadlines και προτεινόμενα follow-ups. Μην στείλεις τίποτα χωρίς έγκριση.\n\n${notes}`);
    });
  }

  async function renderProjects(force) {
    if (!cache.projects || force) cache.projects = await api("/api/projects");
    const projects = cache.projects.projects || [];
    const body = `
      <div class="projects-layout">
        <section class="project-list-pane">
          <form class="project-create" data-project-form>
            <input name="name" placeholder="Νέο project" maxlength="120">
            <button type="submit">＋</button>
          </form>
          <div class="project-list">${projects.length ? projects.map(projectRow).join("") : emptyInline("Δημιούργησε project για πελάτη ή στόχο.")}</div>
        </section>
        <section class="project-detail-pane" data-project-detail>
          ${emptyState("Μόνιμο context", "Σύνδεσε chats, σημειώσεις, αποφάσεις και επόμενα βήματα γύρω από έναν στόχο.", "")}
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
        <textarea data-project-description rows="3" placeholder="Περιγραφή και στόχος">${escape(project.description)}</textarea>
        <div class="project-actions">
          <button data-project-chat>Συζήτηση με context</button>
          <button data-project-done>${project.status === "done" ? "Επανενεργοποίηση" : "Ολοκλήρωση"}</button>
        </div>
        <form class="project-note-form" data-project-note-form>
          <textarea name="note" rows="4" placeholder="Νέα απόφαση, σημείωση ή επόμενο βήμα"></textarea>
          <button class="primary-action" type="submit">Προσθήκη σημείωσης</button>
        </form>
        <div class="project-notes">${(project.notes || []).length ? project.notes.map(note => `
          <article><p>${escape(note.text)}</p><small>${formatDateTime(note.createdAt)}</small></article>`).join("") : emptyInline("Δεν υπάρχουν σημειώσεις.")}</div>`;
      detail.querySelector("[data-project-description]").addEventListener("change", async event => {
        await api(`/api/projects/${encodeURIComponent(project.id)}`, {
          method: "POST",
          body: JSON.stringify({ description: event.target.value }),
        });
        cache.projects = null;
      });
      detail.querySelector("[data-project-chat]").addEventListener("click", () =>
        runPrompt(`Δούλεψε μαζί μου στο project "${project.name}". Περιγραφή: ${project.description}. Σημειώσεις: ${(project.notes || []).map(note => note.text).join(" | ")}`)
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
        <label class="spotlight-input">${icon("search")}<input type="search" placeholder="Αναζήτηση σε όλη τη Dorothy…" autocomplete="off"><kbd>esc</kbd></label>
        <div class="spotlight-results"><div class="spotlight-hint">Chats, emails, Apple Notes, αρχεία, projects και έγγραφα.</div></div>
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
      '<div class="spotlight-hint">Chats, emails, Apple Notes, αρχεία, projects και έγγραφα.</div>';
    setTimeout(() => input.focus(), 0);
  }

  async function runSearch(query) {
    const results = ensureSpotlight().querySelector(".spotlight-results");
    if (!query.trim()) {
      results.innerHTML = '<div class="spotlight-hint">Γράψε αυτό που θυμάσαι. Δεν χρειάζεται να ξέρεις πού βρίσκεται.</div>';
      return;
    }
    results.innerHTML = '<div class="spotlight-hint">Αναζήτηση…</div>';
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
          : '<div class="spotlight-hint">Δεν βρέθηκε κάτι σχετικό.</div>';
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
    runPrompt(`Βρήκα αυτό μέσω Dorothy Spotlight και θέλω να το ανοίξουμε/αναλύσουμε: ${item.title}. ${item.subtitle || ""} ${item.excerpt || ""}`);
  }

  function ensureVoiceDialog() {
    let dialog = document.getElementById("voiceDialog");
    if (dialog) return dialog;
    dialog = document.createElement("dialog");
    dialog.id = "voiceDialog";
    dialog.className = "voice-dialog";
    dialog.innerHTML = `
      <div class="voice-shell">
        <button class="voice-close" type="button" aria-label="Κλείσιμο">×</button>
        <div class="voice-orb"><i></i><i></i><i></i></div>
        <span class="voice-state">Έτοιμη να ακούσω</span>
        <p class="voice-transcript">Πάτησε το μικρόφωνο και μίλησε φυσικά.</p>
        <button class="voice-main" type="button" aria-label="Έναρξη φωνητικής συνομιλίας">${icon("mic")}</button>
        <div class="voice-actions">
          <button data-voice-clear>Καθαρισμός</button>
          <button data-voice-send disabled>Αποστολή</button>
        </div>
      </div>`;
    document.body.appendChild(dialog);
    dialog.querySelector(".voice-close").addEventListener("click", () => stopVoice(dialog, false));
    dialog.querySelector(".voice-main").addEventListener("click", () => {
      if (voiceRecognition) stopVoiceRecognition(dialog);
      else startVoice(dialog);
    });
    dialog.querySelector("[data-voice-clear]").addEventListener("click", () => {
      dialog.querySelector(".voice-transcript").textContent = "Πάτησε το μικρόφωνο και μίλησε φυσικά.";
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
      dialog.querySelector(".voice-state").textContent = "Δεν υποστηρίζεται από αυτόν τον browser";
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
    dialog.querySelector(".voice-state").textContent = "Ακούω… μίλα φυσικά";
    recognition.onresult = event => {
      let interim = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const text = event.results[index][0].transcript;
        if (event.results[index].isFinal) finalText += `${text} `;
        else interim += text;
      }
      const transcript = `${finalText}${interim}`.trim();
      dialog.querySelector(".voice-transcript").textContent = transcript || "Ακούω…";
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
    dialog.querySelector(".voice-state").textContent = "Έτοιμο για αποστολή";
  }

  function stopVoice(dialog, send) {
    stopVoiceRecognition(dialog);
    const text = dialog.querySelector(".voice-transcript").textContent.trim();
    dialog.close();
    if (send && text && !text.startsWith("Πάτησε")) runPrompt(text);
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
      <time>${event.allDay ? "Όλη μέρα" : formatTime(event.startsAt)}</time>
      <i></i>
      <div><strong>${escape(event.title)}</strong><small>${escape(event.location || event.calendar)}</small></div>
      <button data-event-brief="${encodePayload(event)}">Brief</button>
    </article>`;
  }

  function mailRow(mail) {
    return `<article class="compact-row">
      <span class="avatar">${escape(initials(senderName(mail.sender)))}</span>
      <div><strong>${escape(senderName(mail.sender))}</strong><small>${escape(mail.subject || "(χωρίς θέμα)")}</small></div>
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
      <p>${escape(document.insights?.excerpt || "Δεν βρέθηκε αναγνωρίσιμο κείμενο.")}</p>
      <div class="insight-tags">${(document.insights?.amounts || []).slice(0, 3).map(value => `<span>${escape(value)}</span>`).join("")}${(document.insights?.dates || []).slice(0, 3).map(value => `<span>${escape(value)}</span>`).join("")}</div>
      <button data-document-ask="${encodePayload(document)}">Ανάλυση με Dorothy</button>
    </article>`;
  }

  function sharedRow(item) {
    return `<article class="shared-row">
      <div><strong>${escape(item.title || item.url || item.fileName || "Shared item")}</strong><small>${escape(item.url || item.fileName || formatDateTime(item.createdAt))}</small></div>
      <button data-shared-ask="${encodePayload(item)}">Άνοιγμα</button>
    </article>`;
  }

  function browserPreview(action, compact) {
    const label = action.risk === "confirmation" ? "Χρειάζεται έγκριση" : "Read-only";
    return `<article class="browser-preview ${compact ? "compact" : ""}" data-risk="${escape(action.risk)}">
      <header><span>${escape(label)}</span><small>${escape(action.status)}</small></header>
      <strong>${escape(action.instruction)}</strong>
      ${action.url ? `<a href="${escape(action.url)}" target="_blank" rel="noreferrer">${escape(action.url)}</a>` : ""}
      <p>${escape(action.summary)}</p>
      ${action.result ? `<div class="browser-result">${escape(action.result)}</div>` : ""}
      ${action.status === "preview" ? `<button data-browser-execute="${encodePayload(action)}">${action.requiresConfirmation ? "Έγκριση και εκτέλεση" : "Εκτέλεση"}</button>` : ""}
    </article>`;
  }

  function meetingCard(event) {
    return `<article class="meeting-card">
      <time><strong>${formatTime(event.startsAt)}</strong><small>${formatShortDate(event.startsAt)}</small></time>
      <div><h3>${escape(event.title)}</h3><p>${escape(event.location || event.calendar)}${event.notes ? ` · ${escape(event.notes)}` : ""}</p></div>
      <button data-meeting-brief="${encodePayload(event)}">Προετοιμασία brief</button>
    </article>`;
  }

  function projectRow(project) {
    return `<button class="project-row" data-project-id="${escape(project.id)}">
      <span>${escape(project.name.slice(0, 1).toUpperCase())}</span>
      <div><strong>${escape(project.name)}</strong><small>${escape(project.description || `${(project.notes || []).length} σημειώσεις`)}</small></div>
      <em>${escape(project.status)}</em>
    </button>`;
  }

  function renderMailList(mails, active = "priority") {
    if (!mails.length) {
      return emptyInline(active === "all"
        ? "Δεν υπάρχουν πρόσφατα μηνύματα."
        : "Καμία εκκρεμής επικοινωνία. Τα διαβασμένα θεωρούνται διεκπεραιωμένα.");
    }
    return mails.slice(0, 30).map((mail, index) => `
      <article class="mail-item ${mail.read ? "read" : "unread"}">
        <button class="mail-item-main" data-mail-index="${index}">
          <span class="avatar">${escape(initials(senderName(mail.sender)))}</span>
          <span><strong>${escape(senderName(mail.sender))}</strong><b>${escape(mail.subject || "(χωρίς θέμα)")}</b><small>${escape(mail.excerpt || "")}</small>${mail.intelligence ? `<small>${escape(intelligenceLabel(mail.intelligence))}</small>` : ""}</span>
          <time>${formatMailTime(mail.receivedAt)}</time>
        </button>
        ${mail.read
          ? '<span class="mail-read-state">Διαβασμένο</span>'
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
      work: "Δουλειά",
      personal: "Προσωπικό",
      otp: "OTP",
      security: "Ασφάλεια",
      transaction: "Συναλλαγή",
      notification: "Ενημέρωση",
      marketing: "Marketing",
      noise: "Θόρυβος",
      unknown: "Άγνωστο",
    }[intelligence.category] || intelligence.category;
    const action = {
      reply: "χρειάζεται απάντηση",
      task: "πιθανή ενέργεια",
      review: "θέλει έλεγχο",
      none: "",
    }[intelligence.action] || "";
    return [category, action].filter(Boolean).join(" · ");
  }

  function todaySummary(calendar, mail, reminders) {
    const parts = [];
    if (calendar.length) parts.push(`${calendar.length} γεγονότα`);
    if (mail.length) parts.push(`${mail.length} σημαντικές επικοινωνίες`);
    if (reminders.length) parts.push(`${reminders.length} υπενθυμίσεις`);
    return parts.length ? `${parts.join(" · ")}. Όλα σε μία καθαρή εικόνα.` : "Η ημέρα είναι καθαρή.";
  }

  function greeting() {
    const hour = new Date().getHours();
    return hour < 12 ? "Καλημέρα" : hour < 18 ? "Καλησπέρα" : "Καλησπέρα";
  }

  function senderName(value) {
    return String(value || "Άγνωστος").replace(/\s*<.*?>\s*/, "").trim() || "Άγνωστος";
  }

  function initials(value) {
    return String(value).split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();
  }

  function formatTime(value) {
    if (!value) return "—";
    return new Date(value).toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit" });
  }

  function formatShortDate(value) {
    if (!value) return "";
    return new Date(value).toLocaleDateString("el-GR", { day: "numeric", month: "short" });
  }

  function formatLongDate(value) {
    return value.toLocaleDateString("el-GR", { weekday: "long", day: "numeric", month: "long" });
  }

  function formatDateTime(value) {
    if (!value) return "Χωρίς ημερομηνία";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString("el-GR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  }

  function formatMailTime(value) {
    if (!value) return "";
    const date = new Date(value);
    return date.toLocaleString("el-GR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  }

  function formatMoney(value) {
    const amount = Number(value || 0);
    return new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(amount);
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
    button.textContent = "Αναίρεση";
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
