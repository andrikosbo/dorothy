import { describe, expect, it } from "vitest";
import { isRelevantCalendarEvent, type CalendarEvent } from "./calendar.js";

function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    title: "Client call",
    calendar: "Work",
    start: "2026-06-12T09:00:00.000Z",
    end: "2026-06-12T10:00:00.000Z",
    allDay: false,
    location: "",
    notes: "",
    ...overrides,
  };
}

describe("calendar relevance", () => {
  it.each([
    "Promo Plan Calendar",
    "Γιορτές",
    "Ελληνικές γιορτές/αργίες",
    "Moon/Astro",
    "Sociality.io - US - 2023",
  ])("filters informational calendar %s", calendar => {
    expect(isRelevantCalendarEvent(event({ calendar }))).toBe(false);
  });

  it("filters promotional all-day theme events outside known calendars", () => {
    expect(isRelevantCalendarEvent(event({
      title: "Red Rose Day",
      calendar: "Imported",
      allDay: true,
      notes: "Celebrate and share pleasant news. Video: https://bit.ly/example",
    }))).toBe(false);
  });

  it("keeps real appointments and actionable calendars", () => {
    expect(isRelevantCalendarEvent(event())).toBe(true);
    expect(isRelevantCalendarEvent(event({
      title: "Ανανέωση ασφάλειας",
      calendar: "Renewals",
      allDay: true,
    }))).toBe(true);
  });
});
