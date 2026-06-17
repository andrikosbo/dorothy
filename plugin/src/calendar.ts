import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const CALENDAR_DAYS_MAX = 31;
export const CALENDAR_LIMIT_MAX = 50;

export type CalendarQuery = {
  days?: number;
  limit?: number;
  query?: string;
  includeInformational?: boolean;
};

export type CalendarEvent = {
  title: string;
  calendar: string;
  start: string | null;
  end: string | null;
  allDay: boolean;
  location: string;
  notes: string;
};

export type CreateCalendarEventInput = {
  title: string;
  startDate: string;
  endDate?: string;
  calendar?: string;
  notes?: string;
  url?: string;
};

const CREATE_EVENT_JXA = `
function run(argv) {
  var app = Application("Calendar");
  var title = argv[0];
  var start = new Date(argv[1]);
  var end = argv[2] ? new Date(argv[2]) : new Date(start.getTime() + 3600000);
  var calendarName = argv[3];
  var notes = argv[4];
  var url = argv[5];

  var calendars = calendarName ? app.calendars.whose({ name: calendarName }) : app.calendars();
  var calendar = null;
  for (var i = 0; i < calendars.length; i++) {
    try {
      if (calendars[i].writable()) {
        calendar = calendars[i];
        break;
      }
    } catch (error) {}
  }
  if (!calendar) return JSON.stringify({ ok: false, error: "calendar_not_found", calendar: calendarName });

  var props = { summary: title, startDate: start, endDate: end };
  if (notes) props.description = notes;
  if (url) props.url = url;
  var event = app.Event(props);
  calendar.events.push(event);

  return JSON.stringify({
    ok: true,
    title: event.summary(),
    calendar: calendar.name(),
    start: event.startDate().toISOString(),
    end: event.endDate().toISOString()
  });
}
`;

const UPCOMING_EVENTS_JXA = `
function run(argv) {
  var app = Application("Calendar");
  var days = Math.max(1, Math.min(Number(argv[0] || 7), ${CALENDAR_DAYS_MAX}));
  var limit = Math.max(1, Math.min(Number(argv[1] || 20), ${CALENDAR_LIMIT_MAX}));
  var query = String(argv[2] || "").toLowerCase();
  var includeInformational = argv[3] === "1";
  var start = new Date();
  var end = new Date(start.getTime() + days * 86400000);
  var results = [];
  var calendars = app.calendars();
  var informationalCalendars = {
    "promo plan calendar": true,
    "sociality.io - us - 2023": true,
    "moon/astro": true,
    "γιορτές": true,
    "ελληνικές γιορτές/αργίες": true
  };

  for (var i = 0; i < calendars.length; i++) {
    var calendar = calendars[i];
    var calendarName = "";
    try { calendarName = String(calendar.name() || ""); } catch (error) {}
    if (!includeInformational && informationalCalendars[calendarName.toLowerCase()]) continue;
    var events = [];
    try {
      events = calendar.events.whose({
        _and: [
          { startDate: { _greaterThanEquals: start } },
          { startDate: { _lessThan: end } }
        ]
      })();
    } catch (error) {
      continue;
    }

    for (var j = 0; j < events.length; j++) {
      var event = events[j];
      var title = "";
      var location = "";
      var notes = "";
      try { title = String(event.summary() || ""); } catch (error) {}
      try { location = String(event.location() || ""); } catch (error) {}
      try { notes = String(event.description() || ""); } catch (error) {}

      var haystack = (title + " " + location + " " + notes).toLowerCase();
      if (query && haystack.indexOf(query) < 0) continue;

      var startDate = null;
      var endDate = null;
      var allDay = false;
      try { startDate = event.startDate(); } catch (error) {}
      try { endDate = event.endDate(); } catch (error) {}
      try { allDay = Boolean(event.alldayEvent()); } catch (error) {}

      results.push({
        title: title || "(χωρίς τίτλο)",
        calendar: calendarName,
        start: startDate ? startDate.toISOString() : null,
        end: endDate ? endDate.toISOString() : null,
        allDay: allDay,
        location: location,
        notes: notes.slice(0, 500)
      });
    }
  }

  results.sort(function (a, b) {
    return String(a.start || "").localeCompare(String(b.start || ""));
  });

  return JSON.stringify({
    ok: true,
    readOnly: true,
    from: start.toISOString(),
    to: end.toISOString(),
    count: Math.min(results.length, limit),
    totalMatches: results.length,
    events: results.slice(0, limit)
  });
}
`;

export async function readUpcomingCalendarEvents(input: CalendarQuery): Promise<Record<string, unknown>> {
  const days = Math.max(1, Math.min(CALENDAR_DAYS_MAX, Math.floor(input.days ?? 7)));
  const limit = Math.max(1, Math.min(CALENDAR_LIMIT_MAX, Math.floor(input.limit ?? 20)));

  try {
    const { stdout } = await execFileAsync(
      "osascript",
      ["-l", "JavaScript", "-e", UPCOMING_EVENTS_JXA, "--",
        String(days),
        String(CALENDAR_LIMIT_MAX),
        (input.query || "").trim(),
        input.includeInformational ? "1" : "0",
      ],
      { timeout: 45_000, maxBuffer: 1024 * 1024 },
    );
    const raw = JSON.parse(stdout.trim()) as {
      ok: boolean;
      readOnly: boolean;
      from: string;
      to: string;
      events?: CalendarEvent[];
    };
    const allEvents = raw.events || [];
    const events = input.includeInformational
      ? allEvents
      : allEvents.filter(event => isRelevantCalendarEvent(event));

    return {
      ...raw,
      count: Math.min(events.length, limit),
      totalMatches: events.length,
      filteredNoiseCount: Math.max(0, allEvents.length - events.length),
      includeInformational: input.includeInformational === true,
      events: events.slice(0, limit),
    };
  } catch (error) {
    return { ok: false, readOnly: true, error: String((error as Error).message || error) };
  }
}

const INFORMATIONAL_CALENDARS = new Set([
  "promo plan calendar",
  "sociality.io - us - 2023",
  "moon/astro",
  "γιορτές",
  "ελληνικές γιορτές/αργίες",
]);

export function isRelevantCalendarEvent(event: CalendarEvent): boolean {
  const calendar = event.calendar.trim().toLocaleLowerCase("el-GR");
  if (INFORMATIONAL_CALENDARS.has(calendar)) return false;

  const title = event.title.trim().toLocaleLowerCase("el-GR");
  const notes = event.notes.trim().toLocaleLowerCase("el-GR");
  const promotionalThemeDay = event.allDay
    && /\b(?:international|world|national)?\s*[a-z][a-z '&-]{2,}\sday\b/i.test(title)
    && /(share|celebrat|awareness|pleasant news|video|bit\.ly|social media)/i.test(notes);

  return !promotionalThemeDay;
}

export async function createCalendarEvent(input: CreateCalendarEventInput): Promise<Record<string, unknown>> {
  const title = input.title.trim();
  if (!title) return { ok: false, error: "empty_title" };
  if (!input.startDate || Number.isNaN(new Date(input.startDate).getTime())) {
    return { ok: false, error: "invalid_start_date" };
  }
  if (input.endDate && Number.isNaN(new Date(input.endDate).getTime())) {
    return { ok: false, error: "invalid_end_date" };
  }

  try {
    const { stdout } = await execFileAsync(
      "osascript",
      ["-l", "JavaScript", "-e", CREATE_EVENT_JXA, "--",
        title,
        input.startDate,
        input.endDate || "",
        (input.calendar || "").trim(),
        (input.notes || "").trim(),
        (input.url || "").trim(),
      ],
      { timeout: 20_000, maxBuffer: 1024 * 1024 },
    );
    return JSON.parse(stdout.trim()) as Record<string, unknown>;
  } catch (error) {
    return { ok: false, error: String((error as Error).message || error) };
  }
}
