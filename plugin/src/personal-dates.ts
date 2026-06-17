import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const PERSONAL_DATES_DAYS_MAX = 14;

export type PersonalDatesQuery = {
  date?: string;
  days?: number;
  includeNamedays?: boolean;
  includeBirthdays?: boolean;
};

export type ContactRecord = {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  nickname: string;
  birthday: string | null;
};

export type NamedayContactMatch = {
  name: string;
  firstName: string;
  matchedNameday: string;
};

export type BirthdayContact = {
  name: string;
  firstName: string;
  ageTurning?: number;
};

const MONTH_NAMES = [
  "",
  "Ιανουαρίου",
  "Φεβρουαρίου",
  "Μαρτίου",
  "Απριλίου",
  "Μαΐου",
  "Ιουνίου",
  "Ιουλίου",
  "Αυγούστου",
  "Σεπτεμβρίου",
  "Οκτωβρίου",
  "Νοεμβρίου",
  "Δεκεμβρίου",
];

const namedayMemoryCache = new Map<string, {
  names: string[];
  sourceUrl: string;
}>();

const CONTACTS_JXA = String.raw`
function text(value) {
  if (value === null || value === undefined) return "";
  return String(value);
}
function run() {
  var app = Application("Contacts");
  var people = app.people;
  var ids = people.id();
  var names = people.name();
  var firstNames = people.firstName();
  var lastNames = people.lastName();
  var nicknames = people.nickname();
  var birthdays = people.birthDate();
  var results = [];

  for (var i = 0; i < names.length; i += 1) {
    var birthday = birthdays[i];
    results.push({
      id: text(ids[i]),
      name: text(names[i]),
      firstName: text(firstNames[i]),
      lastName: text(lastNames[i]),
      nickname: text(nicknames[i]),
      birthday: birthday ? birthday.toISOString() : null
    });
  }

  return JSON.stringify({ ok: true, count: results.length, contacts: results });
}
`;

export function normalizeGreekName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("el-GR")
    .replace(/ς/g, "σ")
    .replace(/[^a-zα-ω0-9]+/gi, " ")
    .trim();
}

export function parseNamedayHtml(html: string): string[] {
  const names: string[] = [];
  const blocks = html.matchAll(/<div\s+class\s*=\s*["']name["'][^>]*>([\s\S]*?)<\/div>/gi);

  for (const block of blocks) {
    const text = decodeHtml(block[1])
      .replace(/<br\s*\/?>/gi, ",")
      .replace(/<[^>]+>/g, "")
      .replace(/\*/g, "")
      .replace(/\s+/g, " ")
      .trim();

    for (const name of text.split(/[,·]/)) {
      const clean = name.replace(/^["'\s]+|["'\s]+$/g, "").trim();
      if (clean && clean !== "-") names.push(clean);
    }
  }

  return uniqueByNormalizedName(names);
}

export function matchNamedayContacts(
  namedays: string[],
  contacts: ContactRecord[],
): NamedayContactMatch[] {
  const namedayMap = new Map(namedays.map(name => [normalizeGreekName(name), name]));
  const matches = new Map<string, NamedayContactMatch>();

  for (const contact of contacts) {
    const candidates = contactNameCandidates(contact);
    for (const candidate of candidates) {
      const matchedNameday = namedayMap.get(normalizeGreekName(candidate));
      if (!matchedNameday) continue;
      const key = [
        normalizeGreekName(contact.name || contact.firstName || candidate),
        normalizeGreekName(matchedNameday),
      ].join(":");
      matches.set(key, {
        name: contact.name || candidate,
        firstName: contact.firstName || candidate,
        matchedNameday,
      });
      break;
    }
  }

  return [...matches.values()].sort((a, b) => a.name.localeCompare(b.name, "el"));
}

export function birthdaysForDate(
  contacts: ContactRecord[],
  target: Date,
): BirthdayContact[] {
  const month = target.getMonth();
  const day = target.getDate();
  const year = target.getFullYear();
  const matches: BirthdayContact[] = [];

  for (const contact of contacts) {
    if (!contact.birthday) continue;
    const birthday = new Date(contact.birthday);
    if (Number.isNaN(birthday.getTime())) continue;
    if (birthday.getMonth() !== month || birthday.getDate() !== day) continue;

    const birthYear = birthday.getFullYear();
    const ageTurning = birthYear >= 1900 && birthYear <= year
      ? year - birthYear
      : undefined;
    matches.push({
      name: contact.name || contact.firstName || "Άγνωστη επαφή",
      firstName: contact.firstName || contact.name || "",
      ...(ageTurning !== undefined ? { ageTurning } : {}),
    });
  }

  const deduplicated = new Map<string, BirthdayContact>();
  for (const match of matches) {
    const key = `${normalizeGreekName(match.name)}:${match.ageTurning ?? "unknown"}`;
    if (!deduplicated.has(key)) deduplicated.set(key, match);
  }
  return [...deduplicated.values()].sort((a, b) => a.name.localeCompare(b.name, "el"));
}

export async function readPersonalDates(
  input: PersonalDatesQuery,
): Promise<Record<string, unknown>> {
  const start = parseDateInput(input.date);
  if (!start) {
    return {
      ok: false,
      readOnly: true,
      error: "invalid_date",
      expected: "YYYY-MM-DD",
    };
  }

  const days = Math.max(1, Math.min(
    PERSONAL_DATES_DAYS_MAX,
    Math.floor(input.days ?? 1),
  ));
  const includeNamedays = input.includeNamedays !== false;
  const includeBirthdays = input.includeBirthdays !== false;

  let contacts: ContactRecord[] = [];
  let contactsError = "";
  if (includeNamedays || includeBirthdays) {
    try {
      contacts = await readContacts();
    } catch (error) {
      contactsError = String((error as Error).message || error);
    }
  }

  const dates = Array.from({ length: days }, (_, index) => addDays(start, index));
  const namedayResults = includeNamedays
    ? await mapWithConcurrency(dates, 3, date => readNamedays(date))
    : dates.map(() => ({
      names: [] as string[],
      sourceUrl: "",
      sourceStatus: "disabled",
      cached: false,
    }));

  const results = dates.map((date, index) => {
    const nameday = namedayResults[index];
    const namedayContacts = contacts.length
      ? matchNamedayContacts(nameday.names, contacts)
      : [];
    const birthdays = includeBirthdays && contacts.length
      ? birthdaysForDate(contacts, date)
      : [];

    return {
      date: formatDateKey(date),
      weekday: date.toLocaleDateString("el-GR", { weekday: "long" }),
      namedays: {
        names: nameday.names,
        contacts: namedayContacts,
        source: "eortologio.net",
        sourceUrl: nameday.sourceUrl,
        sourceStatus: nameday.sourceStatus,
        cached: nameday.cached,
      },
      birthdays,
    };
  });

  return {
    ok: !contactsError || !includeBirthdays,
    readOnly: true,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    from: formatDateKey(start),
    days,
    contactsScanned: contacts.length,
    contactsWithBirthdays: contacts.filter(contact => contact.birthday).length,
    ...(contactsError ? { contactsError } : {}),
    totals: {
      namedayNames: results.reduce((sum, item) => sum + item.namedays.names.length, 0),
      namedayContacts: results.reduce((sum, item) => sum + item.namedays.contacts.length, 0),
      birthdays: results.reduce((sum, item) => sum + item.birthdays.length, 0),
    },
    dates: results,
  };
}

async function readContacts(): Promise<ContactRecord[]> {
  const { stdout } = await execFileAsync(
    "osascript",
    ["-l", "JavaScript", "-e", CONTACTS_JXA],
    { timeout: 20_000, maxBuffer: 4 * 1024 * 1024 },
  );
  const parsed = JSON.parse(stdout.trim()) as {
    ok: boolean;
    contacts?: ContactRecord[];
  };
  if (!parsed.ok) throw new Error("contacts_read_failed");
  return parsed.contacts || [];
}

async function readNamedays(date: Date): Promise<{
  names: string[];
  sourceUrl: string;
  sourceStatus: string;
  cached: boolean;
}> {
  const key = formatDateKey(date);
  const sourceUrl = namedaySourceUrl(date);

  try {
    const response = await fetch(sourceUrl, {
      headers: {
        "User-Agent": "Dorothy Personal Assistant/0.5 (+local private use)",
        "Accept-Language": "el-GR,el;q=0.9,en;q=0.5",
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`nameday_http_${response.status}`);
    const html = await response.text();
    const names = parseNamedayHtml(html);
    if (!names.length && !html.includes("class = \"name\"") && !html.includes("class=\"name\"")) {
      throw new Error("nameday_page_format_changed");
    }

    namedayMemoryCache.set(key, {
      sourceUrl,
      names,
    });

    return { names, sourceUrl, sourceStatus: "online", cached: false };
  } catch (error) {
    const cached = namedayMemoryCache.get(key);
    if (cached) {
      return {
        names: cached.names,
        sourceUrl: cached.sourceUrl,
        sourceStatus: `memory_cache_fallback:${String((error as Error).message || error)}`,
        cached: true,
      };
    }
    return {
      names: [],
      sourceUrl,
      sourceStatus: `unavailable:${String((error as Error).message || error)}`,
      cached: false,
    };
  }
}

function contactNameCandidates(contact: ContactRecord): string[] {
  const values = [contact.firstName, contact.nickname];
  const candidates: string[] = [];
  for (const value of values) {
    const clean = value.trim();
    if (!clean) continue;
    candidates.push(clean);
    for (const part of clean.split(/[\s/-]+/)) {
      if (part.length >= 3) candidates.push(part);
    }
  }
  return uniqueByNormalizedName(candidates);
}

function uniqueByNormalizedName(values: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const value of values) {
    const key = normalizeGreekName(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(value);
  }
  return unique;
}

function parseDateInput(value?: string): Date | null {
  if (!value) {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) return null;
  return date;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function formatDateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function namedaySourceUrl(date: Date): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const monthName = MONTH_NAMES[month];
  return `https://www.eortologio.net/year/${year}/month/${String(month).padStart(2, "0")}/day/${String(day).padStart(2, "0")}/${day}_${encodeURIComponent(monthName)}`;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)));
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index]);
    }
  }

  await Promise.all(Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  ));
  return results;
}
