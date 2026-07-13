"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const demoData = require("./demo-data.js");

const INDEX_ROOT = path.join(os.homedir(), "Dorothy_Index");

function run(command, args, timeout = 20000) {
  return new Promise(resolve => {
    const child = spawn(command, args, { shell: false });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      resolve({ ok: false, stdout, stderr: stderr || "Timed out" });
    }, timeout);
    child.stdout.on("data", chunk => { stdout += chunk.toString(); });
    child.stderr.on("data", chunk => { stderr += chunk.toString(); });
    child.on("error", error => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: false, stdout, stderr: error.message });
    });
    child.on("close", code => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: code === 0, stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
}

const CALENDAR_SCRIPT = String.raw`
function text(value) { return value === null || value === undefined ? "" : String(value); }
function run(argv) {
  var options = JSON.parse(argv[0]);
  var Calendar = Application("Calendar");
  var start = new Date();
  start.setHours(0, 0, 0, 0);
  var end = new Date(start.getTime() + options.days * 86400000);
  var rows = [];
  Calendar.calendars().forEach(function (calendar) {
    var calendarName = text(calendar.name());
    if (/nameday|εορτο|γιορτ|holiday|promo|astrolog|social/i.test(calendarName)) return;
    var events = calendar.events.whose({ startDate: { _greaterThanEquals: start }, _and: { startDate: { _lessThan: end } } })();
    events.slice(0, options.limit).forEach(function (event) {
      var startsAt = event.startDate();
      var endsAt = event.endDate();
      rows.push({
        id: text(event.uid()),
        title: text(event.summary()),
        calendar: calendarName,
        startsAt: startsAt ? startsAt.toISOString() : "",
        endsAt: endsAt ? endsAt.toISOString() : "",
        location: text(event.location()),
        notes: text(event.description()).slice(0, 500),
        allDay: Boolean(event.alldayEvent())
      });
    });
  });
  rows.sort(function (a, b) { return a.startsAt.localeCompare(b.startsAt); });
  return JSON.stringify(rows.slice(0, options.limit));
}`;

const REMINDERS_SCRIPT = String.raw`
function text(value) { return value === null || value === undefined ? "" : String(value); }
function run(argv) {
  var options = JSON.parse(argv[0]);
  var Reminders = Application("Reminders");
  var now = new Date();
  var end = new Date(now.getTime() + options.days * 86400000);
  var rows = [];
  Reminders.lists().forEach(function (list) {
    var listName = text(list.name());
    var reminders;
    try { reminders = list.reminders.whose({ completed: false })(); } catch (_) { reminders = []; }
    reminders.slice(0, options.limit).forEach(function (reminder) {
      var due = null;
      try { due = reminder.dueDate(); } catch (_) {}
      if (due && due.getTime() > end.getTime()) return;
      rows.push({
        id: text(reminder.id()),
        title: text(reminder.name()),
        list: listName,
        dueAt: due ? due.toISOString() : "",
        notes: text(reminder.body()).slice(0, 500),
        priority: Number(reminder.priority()) || 0
      });
    });
  });
  rows.sort(function (a, b) {
    if (!a.dueAt && !b.dueAt) return a.title.localeCompare(b.title);
    if (!a.dueAt) return 1;
    if (!b.dueAt) return -1;
    return a.dueAt.localeCompare(b.dueAt);
  });
  return JSON.stringify(rows.slice(0, options.limit));
}`;

const NOTES_SCRIPT = String.raw`
function text(value) { return value === null || value === undefined ? "" : String(value); }
function run(argv) {
  var options = JSON.parse(argv[0]);
  var query = text(options.query).toLowerCase();
  var Notes = Application("Notes");
  var rows = [];
  Notes.accounts().forEach(function (account) {
    account.folders().forEach(function (folder) {
      var candidates = [];
      try {
        candidates = query
          ? folder.notes.whose({ name: { _contains: options.query } })()
          : folder.notes().slice(0, options.limit);
      } catch (_) {}
      if (query && candidates.length < options.limit) {
        try {
          folder.notes().slice(0, 20).forEach(function (note) {
            if (!candidates.some(function (item) { return text(item.id()) === text(note.id()); })) candidates.push(note);
          });
        } catch (_) {}
      }
      candidates.slice(0, 30).forEach(function (note) {
        var title = text(note.name());
        var body = text(note.plaintext()).replace(/\s+/g, " ").trim();
        if (query && !(title + " " + body).toLowerCase().includes(query)) return;
        var modified = note.modificationDate();
        rows.push({
          type: "note",
          id: text(note.id()),
          title: title || "Apple Note",
          subtitle: text(folder.name()),
          excerpt: body.slice(0, 240),
          updatedAt: modified ? modified.toISOString() : ""
        });
      });
    });
  });
  rows.sort(function (a, b) { return b.updatedAt.localeCompare(a.updatedAt); });
  return JSON.stringify(rows.slice(0, options.limit));
}`;

async function readCalendar(days = 2, limit = 20) {
  if (demoData.DEMO_MODE) return demoData.demoCalendar();
  const result = await run("/usr/bin/osascript", [
    "-l", "JavaScript", "-e", CALENDAR_SCRIPT,
    JSON.stringify({ days, limit }),
  ], 30000);
  if (!result.ok) return [];
  try { return JSON.parse(result.stdout); } catch { return []; }
}

async function readReminders(days = 14, limit = 20) {
  if (demoData.DEMO_MODE) return demoData.demoReminders();
  const result = await run("/usr/bin/osascript", [
    "-l", "JavaScript", "-e", REMINDERS_SCRIPT,
    JSON.stringify({ days, limit }),
  ], 30000);
  if (!result.ok) return [];
  try { return JSON.parse(result.stdout); } catch { return []; }
}

async function searchNotes(query, limit = 10) {
  const result = await run("/usr/bin/osascript", [
    "-l", "JavaScript", "-e", NOTES_SCRIPT,
    JSON.stringify({ query, limit }),
  ], 7000);
  if (!result.ok) return [];
  try { return JSON.parse(result.stdout); } catch { return []; }
}

async function searchFiles(query, limit = 12) {
  if (!fs.existsSync(INDEX_ROOT)) return [];
  const result = await run("/usr/bin/mdfind", [
    "-onlyin", INDEX_ROOT,
    `kMDItemFSName == "*${String(query || "").replace(/["*]/g, "")}*"cd`,
  ], 12000);
  if (!result.ok) return [];
  return result.stdout.split(/\r?\n/).filter(Boolean).slice(0, limit).map(filePath => ({
    type: "file",
    id: filePath,
    title: path.basename(filePath),
    subtitle: path.dirname(filePath).replace(os.homedir(), "~"),
    path: filePath,
    updatedAt: safeMtime(filePath),
  }));
}

function safeMtime(filePath) {
  try { return fs.statSync(filePath).mtime.toISOString(); } catch { return ""; }
}

async function recentFiles(limit = 8) {
  if (demoData.DEMO_MODE) return demoData.demoFiles();
  if (!fs.existsSync(INDEX_ROOT)) return [];
  const result = await run("/usr/bin/mdfind", [
    "-onlyin", INDEX_ROOT,
    "kMDItemContentModificationDate >= $time.today(-14)",
  ], 12000);
  if (!result.ok) return [];
  return result.stdout.split(/\r?\n/)
    .filter(Boolean)
    .map(filePath => ({
      type: "file",
      id: filePath,
      title: path.basename(filePath),
      subtitle: path.dirname(filePath).replace(os.homedir(), "~"),
      path: filePath,
      updatedAt: safeMtime(filePath),
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit);
}

module.exports = {
  readCalendar,
  readReminders,
  recentFiles,
  searchFiles,
  searchNotes,
};
