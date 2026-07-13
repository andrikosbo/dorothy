"use strict";

// Synthetic fixtures used only when DOROTHY_DEMO_MODE=1. Lets anyone try the
// full UI (communications, finance, portfolio, calendar) without connecting
// Mail.app, iMessage, a bank, or a real Elorus/portfolio account.

// Read lazily (not cached at module-load time) since server.js loads .env
// after its top-level requires run.
function isDemoMode() {
  return process.env.DOROTHY_DEMO_MODE === "1";
}

function money(value) {
  return Math.round(value * 100) / 100;
}

function isoInHours(hours) {
  return new Date(Date.now() - hours * 3600_000).toISOString();
}

function isoInDays(days) {
  return new Date(Date.now() + days * 86400_000).toISOString();
}

function demoRawMail() {
  return [
    {
      mailId: 1001,
      messageId: "<demo-1@example.com>",
      account: "Work",
      accountAddresses: ["hello@example.com"],
      sender: "Maria Papadopoulou <maria@acme-clients.example>",
      to: [],
      cc: [],
      subject: "Signed contract — next steps",
      receivedAt: isoInHours(2),
      read: false,
      flagged: false,
      replied: false,
      excerpt: "Hi! We signed the contract this morning. Could you send the kickoff checklist and confirm the first milestone date?",
    },
    {
      mailId: 1002,
      messageId: "<demo-2@example.com>",
      account: "Work",
      accountAddresses: ["hello@example.com"],
      sender: "GitHub <notifications@github.com>",
      to: [],
      cc: [],
      subject: "[dorothy] New issue opened: feature request",
      receivedAt: isoInHours(5),
      read: true,
      flagged: false,
      replied: false,
      excerpt: "A new issue was opened on andrikosbo/dorothy: \"Add support for X\".",
    },
    {
      mailId: 1003,
      messageId: "<demo-3@example.com>",
      account: "Personal",
      accountAddresses: ["me@example.com"],
      sender: "Acme Bank <no-reply@acmebank.example>",
      to: [],
      cc: [],
      subject: "Your one-time code is 482913",
      receivedAt: isoInHours(0.2),
      read: false,
      flagged: false,
      replied: false,
      excerpt: "Your one-time verification code is 482913. It expires in 10 minutes.",
    },
    {
      mailId: 1004,
      messageId: "<demo-4@example.com>",
      account: "Work",
      accountAddresses: ["hello@example.com"],
      sender: "Nikos (Studio Partner) <nikos@partner.example>",
      to: [],
      cc: [],
      subject: "Quick call this week?",
      receivedAt: isoInHours(20),
      read: false,
      flagged: true,
      replied: false,
      excerpt: "Do you have 15 minutes this week to sync on the Q3 roadmap? Free Tue/Thu afternoon.",
    },
    {
      mailId: 1005,
      messageId: "<demo-5@example.com>",
      account: "Personal",
      accountAddresses: ["me@example.com"],
      sender: "Northwind Store <news@northwind.example>",
      to: [],
      cc: [],
      subject: "Summer sale: 30% off everything",
      receivedAt: isoInHours(30),
      read: true,
      flagged: false,
      replied: false,
      excerpt: "Our summer sale is here. Enjoy 30% off site-wide, this week only.",
    },
    {
      mailId: 1006,
      messageId: "<demo-6@example.com>",
      account: "Work",
      accountAddresses: ["hello@example.com"],
      sender: "Elena (Accountant) <elena@bookkeeping.example>",
      to: [],
      cc: [],
      subject: "Q2 invoices ready for review",
      receivedAt: isoInHours(48),
      read: true,
      flagged: false,
      replied: true,
      excerpt: "The Q2 invoice batch is ready for your review before I file it.",
    },
  ];
}

function demoCommunications({ enrichCommunications, buildCommunicationOverview }) {
  const mail = enrichCommunications(demoRawMail(), {
    channel: "mail",
    previousItems: [],
    trackedSourceIds: new Set(),
  });
  const intelligence = buildCommunicationOverview(mail);
  return {
    schemaVersion: 2,
    cached: true,
    ageSeconds: 12,
    fetchedAt: new Date().toISOString(),
    coverage: {
      mail: { available: true, limit: 50, recentDays: 14 },
      imessage: { available: false, reason: "demo_mode" },
      messenger: { available: false, reason: "demo_mode" },
      instagram: { available: false, reason: "demo_mode" },
      viber: { available: false, reason: "demo_mode" },
    },
    mail,
    mailCount: mail.length,
    intelligence,
  };
}

function demoCalendar() {
  const at = (hours, minutes, addDays = 0) => {
    const date = new Date();
    date.setDate(date.getDate() + addDays);
    date.setHours(hours, minutes, 0, 0);
    return date.toISOString();
  };
  return [
    {
      id: "demo-cal-1",
      title: "Client kickoff — Acme Clients",
      calendar: "Work",
      startsAt: at(10, 0),
      endsAt: at(11, 0),
      location: "Zoom",
      notes: "",
      allDay: false,
    },
    {
      id: "demo-cal-2",
      title: "Design review",
      calendar: "Work",
      startsAt: at(15, 30),
      endsAt: at(16, 15),
      location: "Studio",
      notes: "",
      allDay: false,
    },
    {
      id: "demo-cal-3",
      title: "Dentist",
      calendar: "Personal",
      startsAt: at(9, 0, 1),
      endsAt: at(9, 45, 1),
      location: "",
      notes: "",
      allDay: false,
    },
  ];
}

function demoReminders() {
  return [
    { id: "demo-rem-1", title: "Send kickoff checklist to Maria", list: "Work", dueAt: isoInDays(0), notes: "", priority: 1 },
    { id: "demo-rem-2", title: "Review Q2 invoices", list: "Work", dueAt: isoInDays(1), notes: "", priority: 2 },
    { id: "demo-rem-3", title: "Renew domain — example.com", list: "Admin", dueAt: isoInDays(5), notes: "", priority: 0 },
  ];
}

function demoFiles() {
  const now = new Date().toISOString();
  return [
    { type: "file", id: "/demo/Projects/acme-clients/proposal.pdf", title: "proposal.pdf", subtitle: "~/Projects/acme-clients", path: "/demo/Projects/acme-clients/proposal.pdf", updatedAt: now },
    { type: "file", id: "/demo/Projects/acme-clients/contract-signed.pdf", title: "contract-signed.pdf", subtitle: "~/Projects/acme-clients", path: "/demo/Projects/acme-clients/contract-signed.pdf", updatedAt: now },
    { type: "file", id: "/demo/Finance/q2-invoices.xlsx", title: "q2-invoices.xlsx", subtitle: "~/Finance", path: "/demo/Finance/q2-invoices.xlsx", updatedAt: now },
  ];
}

function demoNotifications() {
  const ago = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString();
  return [
    { id: "demo-notif-1", title: "New reply from Maria Papadopoulou", text: "Could you send the kickoff checklist?", at: ago(15), read: false },
    { id: "demo-notif-2", title: "Q2 invoices ready for review", text: "Elena finished the Q2 invoice batch.", at: ago(180), read: true },
  ];
}

function demoFinanceOverview() {
  const year = new Date().getFullYear();
  const monthly = Array.from({ length: 12 }, (_, index) => ({
    month: index + 1,
    revenue: Math.round(4200 + Math.sin(index / 2) * 900 + index * 60),
    operatingResult: Math.round(1800 + Math.sin(index / 2) * 400 + index * 20),
  }));
  const revenue = monthly.reduce((sum, m) => sum + m.revenue, 0);
  const operatingResult = monthly.reduce((sum, m) => sum + m.operatingResult, 0);
  const categories = [
    { category: "consulting", label: "Consulting", revenue: 28400, cost: 6200, profit: 22200, marginPercent: 78.2, costSource: "estimated_margin" },
    { category: "development", label: "Development", revenue: 19600, cost: 8100, profit: 11500, marginPercent: 58.7, costSource: "actual_category_cost" },
    { category: "hosting", label: "Hosting & infra", revenue: 3200, cost: 1400, profit: 1800, marginPercent: 56.3, costSource: "estimated_margin" },
  ];
  const sources = { source: "demo", lastSyncAt: new Date().toISOString() };
  return {
    ok: true,
    scope: "managerial_estimate",
    accountingStatement: false,
    generatedAt: new Date().toISOString(),
    years: [year - 1, year],
    summary: {
      year,
      month: null,
      invoiceCount: 34,
      revenue: money(revenue),
      directCosts: money(revenue * 0.32),
      directCostsActual: money(revenue * 0.18),
      directCostsEstimated: money(revenue * 0.14),
      grossProfit: money(revenue * 0.68),
      grossMarginPercent: 68,
      operatingExpenses: money(revenue * 0.2),
      operatingResult: money(operatingResult),
      operatingMarginPercent: money((operatingResult / revenue) * 100),
      taxVatCashOutflows: money(revenue * 0.08),
      categories,
      coverage: { invoiceItemPercent: 92, actualCostRevenuePercent: 61, unclassifiedRevenue: 0 },
      sources,
    },
    yearly: [
      { year: year - 1, revenue: Math.round(revenue * 0.86), operatingResult: Math.round(operatingResult * 0.8) },
      { year, revenue: money(revenue), operatingResult: money(operatingResult) },
    ],
    monthly,
    renewals: [
      { id: "demo-renewal-1", customer: "Acme Clients", label: "Annual retainer", amount: 1200, dueDate: isoInDays(30) },
      { id: "demo-renewal-2", customer: "Northwind Studio", label: "Support contract", amount: 450, dueDate: isoInDays(60) },
    ],
    sources,
  };
}

function demoPortfolio() {
  const positions = [
    { symbol: "VWCE.DE", name: "Vanguard FTSE All-World UCITS ETF", quantity: 42, broker: "Demo Broker", currency: "EUR", price: 118.4, change: 0.9, changePercent: 0.76, marketStatus: "closed", marketValue: 4972.8, dayChangeValue: 37.8, provider: "demo", euroRate: 1, marketValueEur: 4972.8, dayChangeValueEur: 37.8 },
    { symbol: "AAPL", name: "Apple Inc.", quantity: 12, broker: "Demo Broker", currency: "USD", price: 224.1, change: -1.8, changePercent: -0.8, marketStatus: "closed", marketValue: 2689.2, dayChangeValue: -21.6, provider: "demo", euroRate: 0.92, marketValueEur: 2474.06, dayChangeValueEur: -19.87 },
    { symbol: "BTC-EUR", name: "Bitcoin", quantity: 0.15, broker: "Demo Wallet", currency: "EUR", price: 58200, change: 640, changePercent: 1.11, marketStatus: "closed", marketValue: 8730, dayChangeValue: 96, provider: "demo", euroRate: 1, marketValueEur: 8730, dayChangeValueEur: 96 },
  ];
  return {
    ok: true,
    cached: false,
    positions,
    totals: [
      { currency: "EUR", marketValue: 13702.8, dayChangeValue: 133.8 },
      { currency: "USD", marketValue: 2689.2, dayChangeValue: -21.6 },
    ],
    euroTotal: { currency: "EUR", marketValue: 16176.86, dayChangeValue: 113.93 },
    asOf: new Date().toISOString(),
    providers: ["demo"],
    fxProviders: ["demo"],
    note: "Demo portfolio data — not connected to any real broker or bank.",
  };
}

function demoProjects() {
  const statuses = ["active", "active", "active", "paused", "active", "done"];
  const projects = [
    { name: "Acme Clients — brand refresh", description: "Full brand refresh and marketing site for a long-standing client.", status: 0 },
    { name: "Northwind Studio retainer", description: "Ongoing monthly support retainer: fixes, small features, uptime.", status: 0 },
    { name: "Dorothy public release", description: "Prepare the open-source release: docs, CI, demo mode, screenshots.", status: 0 },
    { name: "Q3 roadmap", description: "Plan next quarter's priorities with the studio partner.", status: 3 },
    { name: "Personal finance cleanup", description: "Reconcile accounts, categorize the backlog, set renewal reminders.", status: 0 },
    { name: "Portfolio rebalance", description: "Review allocation across ETFs and crypto after the Q2 run-up.", status: 5 },
  ];
  const now = Date.now();
  return projects.map((project, index) => ({
    id: `demo-project-${index + 1}`,
    name: project.name,
    description: project.description,
    status: statuses[project.status] || statuses[index] || "active",
    notes: [],
    links: [],
    createdAt: new Date(now - (index + 2) * 86_400_000).toISOString(),
    updatedAt: new Date(now - index * 7_200_000).toISOString(),
  }));
}

function demoBrowserActions() {
  const now = Date.now();
  return [
    {
      id: "demo-browser-1",
      instruction: "Open the Acme Clients invoice portal and check whether the June invoice was marked as paid.",
      url: "https://portal.acme-clients.example/invoices",
      status: "preview",
      risk: "read-only",
      requiresConfirmation: false,
      summary: "This action is limited to opening, reading, or summarizing — no data will change.",
      createdAt: new Date(now - 3_600_000).toISOString(),
      updatedAt: new Date(now - 3_600_000).toISOString(),
      result: "The June invoice is marked \"Paid\" as of July 10.",
    },
  ];
}

function demoAnalyticsStatus() {
  return {
    ok: true,
    clientConfigured: true,
    connected: true,
    propertyId: "properties/000000demo",
    propertyName: "example.com (demo)",
  };
}

function demoAnalyticsOverview() {
  const days = 28;
  const series = Array.from({ length: days }, (_, index) => {
    const date = new Date(Date.now() - (days - 1 - index) * 86_400_000);
    const iso = date.toISOString().slice(0, 10).replace(/-/g, "");
    const users = Math.round(120 + Math.sin(index / 3) * 30 + index * 2);
    return { date: iso, users, sessions: Math.round(users * 1.3) };
  });
  const totals = series.reduce((acc, row) => ({
    users: acc.users + row.users,
    sessions: acc.sessions + row.sessions,
    pageViews: acc.pageViews + Math.round(row.sessions * 2.4),
  }), { users: 0, sessions: 0, pageViews: 0 });
  return {
    ok: true,
    propertyId: "properties/000000demo",
    propertyName: "example.com (demo)",
    window: "28 days",
    totals: { ...totals, engagementRate: 64.2 },
    series,
  };
}

function demoOpenBankingStatus() {
  return {
    ok: true,
    configuration: { configured: true, environment: "sandbox" },
    connected: true,
    banks: [{ bankName: "Demo Bank", psuType: "personal", connectedAt: new Date().toISOString() }],
  };
}

function demoOpenBankingOverview() {
  const now = new Date();
  const accounts = [
    { bankName: "Demo Bank", displayName: "Everyday account", maskedIdentifier: "•• 4821", currency: "EUR", balance: 8420.13, isCard: false, syncedAt: now.toISOString() },
    { bankName: "Demo Bank", displayName: "Business card", maskedIdentifier: "•• 1197", currency: "EUR", balance: -312.44, isCard: true, syncedAt: now.toISOString() },
  ];
  const categories = [
    { category: "hosting", label: "Hosting", amount: 84.5 },
    { category: "software", label: "Software", amount: 156.2 },
    { category: "travel", label: "Travel", amount: 240.0 },
    { category: "meals", label: "Meals", amount: 98.75 },
  ];
  const recentTransactions = [
    { bookingDate: isoDate(0), amount: -45.0, currency: "EUR", description: "Cloud hosting — monthly", counterparty: "Demo Cloud Provider", category: "hosting", categoryLabel: "Hosting", bankName: "Demo Bank", account: "•• 4821" },
    { bookingDate: isoDate(1), amount: 1200.0, currency: "EUR", description: "Client payment — Acme Clients", counterparty: "Acme Clients", category: "income", categoryLabel: "Income", bankName: "Demo Bank", account: "•• 4821" },
    { bookingDate: isoDate(2), amount: -19.99, currency: "EUR", description: "Software subscription", counterparty: "Demo Software Co", category: "software", categoryLabel: "Software", bankName: "Demo Bank", account: "•• 1197" },
    { bookingDate: isoDate(4), amount: -62.3, currency: "EUR", description: "Client dinner", counterparty: "Local Taverna", category: "meals", categoryLabel: "Meals", bankName: "Demo Bank", account: "•• 1197" },
  ];
  return {
    ok: true,
    days: 30,
    from: isoDate(30),
    summary: {
      bankCount: 1,
      accountCount: accounts.length,
      eurCashBalance: 8420.13,
      inflow: 1200.0,
      outflow: 127.29,
      netFlow: 1072.71,
      transactionCount: recentTransactions.length,
    },
    accounts,
    categories,
    recentTransactions,
    lastSync: { ok: true, finishedAt: now.toISOString() },
  };
}

function isoDate(daysAgo) {
  return new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);
}

function demoSystemStatus(appVersion) {
  return {
    ok: true,
    ready: true,
    checkedAt: new Date().toISOString(),
    services: [
      { id: "openclaw", label: "Dorothy", ok: true, detail: "OpenClaw online (demo)" },
      { id: "webapp", label: "Web app", ok: true, detail: `v${appVersion}` },
      { id: "tailscale", label: "Tailscale", ok: true, detail: "Connected (demo)" },
      { id: "docker", label: "Docker", ok: true, detail: "v24.0.0 (demo)" },
      { id: "n8n", label: "n8n", ok: true, detail: "Healthy (demo)" },
      { id: "ollama", label: "Ollama", ok: true, detail: "Models ready (demo)" },
    ],
    bootAutomation: { fileVaultOff: true, autoLoginUser: "", ready: true },
  };
}

module.exports = {
  get DEMO_MODE() {
    return isDemoMode();
  },
  demoCommunications,
  demoCalendar,
  demoReminders,
  demoFiles,
  demoNotifications,
  demoFinanceOverview,
  demoPortfolio,
  demoSystemStatus,
  demoProjects,
  demoBrowserActions,
  demoAnalyticsStatus,
  demoAnalyticsOverview,
  demoOpenBankingStatus,
  demoOpenBankingOverview,
};
