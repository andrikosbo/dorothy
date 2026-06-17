import { describe, expect, it } from "vitest";
import {
  birthdaysForDate,
  matchNamedayContacts,
  normalizeGreekName,
  parseNamedayHtml,
  type ContactRecord,
} from "./personal-dates.js";

function contact(overrides: Partial<ContactRecord> = {}): ContactRecord {
  return {
    id: "contact-1",
    name: "Ονούφριος Δοκιμή",
    firstName: "Ονούφριος",
    lastName: "Δοκιμή",
    nickname: "",
    birthday: null,
    ...overrides,
  };
}

describe("personal dates", () => {
  it("parses namedays from the eortologio page structure", () => {
    const html = `
      <div class = "name">
        <a href="/pote_giortazei/Ονούφριος">Ονούφριος</a>,
        <a href="/pote_giortazei/Ονούφρης">Ονούφρης</a>,
        <a href="/pote_giortazei/Ονουφρία">Ονουφρία</a> *
      </div>
    `;
    expect(parseNamedayHtml(html)).toEqual(["Ονούφριος", "Ονούφρης", "Ονουφρία"]);
  });

  it("normalizes Greek accents and final sigma for matching", () => {
    expect(normalizeGreekName("  Ονούφριος ")).toBe("ονουφριοσ");
    expect(normalizeGreekName("ΟΝΟΥΦΡΙΟΣ")).toBe("ονουφριοσ");
  });

  it("matches exact first names and nicknames without substring guesses", () => {
    const contacts = [
      contact(),
      contact({
        id: "contact-2",
        name: "Ντίνα Παράδειγμα",
        firstName: "Κωνσταντίνα",
        nickname: "Ονουφρία",
      }),
      contact({
        id: "contact-3",
        name: "Ηλίας Άλλος",
        firstName: "Ηλίας",
      }),
      contact({
        id: "contact-4",
        name: "Ονούφριος Δοκιμή",
        firstName: "Ονούφριος",
      }),
    ];
    expect(matchNamedayContacts(
      ["Ονούφριος", "Ονουφρία", "Λία"],
      contacts,
    )).toEqual([
      {
        name: "Ντίνα Παράδειγμα",
        firstName: "Κωνσταντίνα",
        matchedNameday: "Ονουφρία",
      },
      {
        name: "Ονούφριος Δοκιμή",
        firstName: "Ονούφριος",
        matchedNameday: "Ονούφριος",
      },
    ]);
  });

  it("finds birthdays by local month/day and reports age only for real years", () => {
    const contacts = [
      contact({
        id: "birthday-1",
        name: "Άννα Δοκιμή",
        firstName: "Άννα",
        birthday: "1985-06-12T09:00:00.000Z",
      }),
      contact({
        id: "birthday-2",
        name: "Χωρίς Έτος",
        firstName: "Χωρίς",
        birthday: "1604-06-12T09:00:00.000Z",
      }),
    ];

    expect(birthdaysForDate(contacts, new Date(2026, 5, 12))).toEqual([
      { name: "Άννα Δοκιμή", firstName: "Άννα", ageTurning: 41 },
      { name: "Χωρίς Έτος", firstName: "Χωρίς" },
    ]);
  });
});
