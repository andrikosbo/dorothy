import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const NOTES_SEARCH_LIMIT_MAX = 20;
export const NOTES_EXCERPT_MAX = 1_000;
// Body scan is expensive (one Apple Event per note), so cap how many recent
// notes get a plaintext scan when the title match comes up empty.
const BODY_SCAN_MAX = 60;

export type CreateNoteInput = {
  title: string;
  body?: string;
  folder?: string;
};

export type SearchNotesInput = {
  query?: string;
  limit?: number;
  excerptChars?: number;
};

async function runJxa(script: string, args: string[], timeoutMs = 20_000): Promise<string> {
  const { stdout } = await execFileAsync("osascript", ["-l", "JavaScript", "-e", script, "--", ...args], {
    timeout: timeoutMs,
    maxBuffer: 1024 * 1024,
  });
  return stdout.trim();
}

// JXA: create a note in Apple Notes. Body arrives as plain text and is converted
// to Notes HTML here; the first line of a Notes body renders as the title, so the
// title is prepended as a div.
const CREATE_NOTE_JXA = `
function run(argv) {
  var app = Application("Notes");
  var title = argv[0];
  var bodyText = argv[1];
  var folderName = argv[2];

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  var html = "<div><b>" + escapeHtml(title) + "</b></div>";
  if (bodyText) {
    var lines = String(bodyText).split("\\n");
    for (var i = 0; i < lines.length; i++) {
      html += "<div>" + (escapeHtml(lines[i]) || "<br>") + "</div>";
    }
  }

  var account = app.defaultAccount();
  var container = account;
  if (folderName) {
    var folders = account.folders.whose({ name: folderName });
    if (folders.length > 0) {
      container = folders[0];
    } else {
      var created = app.Folder({ name: folderName });
      account.folders.push(created);
      container = created;
    }
  }

  var note = app.Note({ body: html });
  container.notes.push(note);

  return JSON.stringify({
    ok: true,
    name: note.name(),
    folder: folderName || "default",
    id: note.id(),
  });
}
`;

// JXA: search Apple Notes by title (bulk property reads, one Apple Event per
// property — same pattern as the mail.ts fix). Falls back to scanning the
// plaintext of the most recent notes when no title matches.
const SEARCH_NOTES_JXA = `
function run(argv) {
  var app = Application("Notes");
  var query = String(argv[0] || "").toLowerCase();
  var limit = Math.max(1, Math.min(Number(argv[1] || 10), ${NOTES_SEARCH_LIMIT_MAX}));
  var excerptChars = Math.max(100, Math.min(Number(argv[2] || 400), ${NOTES_EXCERPT_MAX}));
  var bodyScanMax = ${BODY_SCAN_MAX};

  var notes = app.defaultAccount().notes;
  var names = notes.name();
  var dates = notes.modificationDate();

  var rows = [];
  for (var i = 0; i < names.length; i++) {
    rows.push({ index: i, name: String(names[i] || ""), date: dates[i] });
  }
  rows.sort(function (a, b) { return b.date - a.date; });

  var matched;
  var matchType = "recent";
  if (query) {
    matched = rows.filter(function (row) { return row.name.toLowerCase().indexOf(query) >= 0; });
    matchType = "title";
    if (matched.length === 0) {
      matched = [];
      matchType = "body";
      for (var s = 0; s < rows.length && s < bodyScanMax && matched.length < limit; s++) {
        var text = "";
        try { text = String(notes[rows[s].index].plaintext() || ""); } catch (e) {}
        if (text.toLowerCase().indexOf(query) >= 0) {
          matched.push(rows[s]);
        }
      }
    }
  } else {
    matched = rows;
  }

  var results = [];
  for (var k = 0; k < matched.length && results.length < limit; k++) {
    var row = matched[k];
    var excerpt = "";
    try { excerpt = String(notes[row.index].plaintext() || "").slice(0, excerptChars); } catch (e) {}
    results.push({
      name: row.name,
      modified: row.date ? row.date.toISOString() : null,
      excerpt: excerpt,
    });
  }

  return JSON.stringify({
    ok: true,
    matchType: matchType,
    totalNotes: names.length,
    count: results.length,
    results: results,
  });
}
`;

function parseJxaJson(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { ok: false, error: "unexpected_response", raw };
  }
}

export async function createAppleNote(input: CreateNoteInput): Promise<Record<string, unknown>> {
  const title = input.title.trim();
  if (!title) return { ok: false, error: "empty_title" };
  try {
    const raw = await runJxa(CREATE_NOTE_JXA, [title, (input.body || "").trim(), (input.folder || "").trim()]);
    return parseJxaJson(raw);
  } catch (error) {
    return { ok: false, error: String((error as Error).message || error) };
  }
}

export async function searchAppleNotes(input: SearchNotesInput): Promise<Record<string, unknown>> {
  try {
    const raw = await runJxa(SEARCH_NOTES_JXA, [
      (input.query || "").trim(),
      String(input.limit ?? 10),
      String(input.excerptChars ?? 400),
    ], 30_000);
    return parseJxaJson(raw);
  } catch (error) {
    return { ok: false, error: String((error as Error).message || error) };
  }
}
