import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const ELORUS_API_BASE = "https://api.elorus.com";
const ELORUS_API_VERSION = "v1.2";
const KEYCHAIN_ACCOUNT = "dorothy";
const KEYCHAIN_API_KEY_SERVICE = "com.dorothy.elorus.api-key";
const KEYCHAIN_ORGANIZATION_SERVICE = "com.dorothy.elorus.organization-id";
const PAGE_SIZE_MAX = 250;
const RECEIVABLE_SCAN_MAX = 1_000;

export const ELORUS_LIST_LIMIT_MAX = 100;
export const ELORUS_PAYMENT_LIMIT_MAX = 50;
export const ELORUS_IGNORED_RECEIVABLE_YEARS = [2023] as const;

export type ElorusCredentials = {
  apiKey: string;
  organizationId: string;
};

export type ElorusCredentialLoader = () => Promise<ElorusCredentials>;
export type ElorusFetch = typeof fetch;

export type ElorusReceivablesInput = {
  query?: string;
  limit?: number;
  includeIgnored2023?: boolean;
};

export type ElorusInvoicesInput = {
  query?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
};

export type ElorusEstimatesInput = ElorusInvoicesInput;

export type ElorusPaymentsInput = {
  query?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
};

type JsonRecord = Record<string, unknown>;

type ListResponse = {
  count?: number;
  next?: string | null;
  results?: unknown[];
};

function boundedInteger(value: number | undefined, fallback: number, maximum: number) {
  return Math.min(Math.max(Math.floor(value ?? fallback), 1), maximum);
}

function validateDate(value: string | undefined, field: string) {
  if (value === undefined) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`invalid_${field}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    throw new Error(`invalid_${field}`);
  }
  return value;
}

function asRecord(value: unknown): JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : 0;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : "elorus_unavailable";
  if (message.startsWith("invalid_")) return message;
  if (message === "elorus_credentials_missing") return message;
  if (message.startsWith("elorus_http_")) return message;
  return "elorus_unavailable";
}

function readOnlyFailure(error: unknown) {
  return {
    ok: false,
    readOnly: true,
    onDemand: true,
    automaticDelivery: false,
    error: safeError(error),
  };
}

async function readKeychainSecret(service: string) {
  try {
    const { stdout } = await execFileAsync("/usr/bin/security", [
      "find-generic-password",
      "-a",
      KEYCHAIN_ACCOUNT,
      "-s",
      service,
      "-w",
    ], {
      timeout: 5_000,
      maxBuffer: 16_384,
    });
    return stdout.trim();
  } catch {
    return "";
  }
}

export async function loadElorusCredentials(): Promise<ElorusCredentials> {
  const [apiKey, organizationId] = await Promise.all([
    readKeychainSecret(KEYCHAIN_API_KEY_SERVICE),
    readKeychainSecret(KEYCHAIN_ORGANIZATION_SERVICE),
  ]);
  if (!apiKey || !organizationId) throw new Error("elorus_credentials_missing");
  return { apiKey, organizationId };
}

async function elorusGet(
  path: string,
  params: URLSearchParams,
  fetchImpl: ElorusFetch,
  credentials: ElorusCredentials,
) {
  const url = new URL(`/${ELORUS_API_VERSION}/${path.replace(/^\/+/, "")}`, ELORUS_API_BASE);
  url.search = params.toString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);

  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Token ${credentials.apiKey}`,
        "X-Elorus-Organization": credentials.organizationId,
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`elorus_http_${response.status}`);
    return await response.json() as unknown;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchList(
  path: string,
  params: URLSearchParams,
  maximum: number,
  fetchImpl: ElorusFetch,
  credentials: ElorusCredentials,
) {
  const results: unknown[] = [];
  let page = 1;

  while (results.length < maximum) {
    const pageSize = Math.min(PAGE_SIZE_MAX, maximum - results.length);
    const pageParams = new URLSearchParams(params);
    pageParams.set("page", String(page));
    pageParams.set("page_size", String(pageSize));
    const body = asRecord(await elorusGet(path, pageParams, fetchImpl, credentials)) as ListResponse;
    const batch = Array.isArray(body.results) ? body.results : [];
    results.push(...batch.slice(0, maximum - results.length));
    if (!body.next || batch.length === 0 || results.length >= maximum) break;
    page += 1;
  }

  return results;
}

function normalizeInvoice(value: unknown) {
  const invoice = asRecord(value);
  const payable = asNumber(invoice.payable);
  const paid = asNumber(invoice.paid);
  return {
    id: asString(invoice.id),
    representation: asString(invoice.representation) || asString(invoice.sequence_flat),
    number: asString(invoice.number),
    status: asString(invoice.status),
    date: asString(invoice.date),
    dueDate: asString(invoice.due_date),
    clientId: asString(invoice.client),
    client: asString(invoice.client_display_name),
    vatNumber: asString(invoice.client_vat_number),
    currency: asString(invoice.currency_code) || "EUR",
    total: roundMoney(asNumber(invoice.total)),
    payable: roundMoney(payable),
    paid: roundMoney(paid),
    outstanding: roundMoney(Math.max(0, payable - paid)),
    permalink: asString(invoice.permalink),
  };
}

function normalizeEstimate(value: unknown) {
  const estimate = asRecord(value);
  return {
    id: asString(estimate.id),
    representation: asString(estimate.representation) || asString(estimate.sequence_flat),
    number: asString(estimate.number),
    status: asString(estimate.status),
    date: asString(estimate.date),
    validUntil: asString(estimate.valid_until) || asString(estimate.due_date),
    clientId: asString(estimate.client),
    client: asString(estimate.client_display_name),
    vatNumber: asString(estimate.client_vat_number),
    currency: asString(estimate.currency_code) || "EUR",
    total: roundMoney(asNumber(estimate.total)),
    permalink: asString(estimate.permalink),
  };
}

function baseListParams(input: ElorusInvoicesInput) {
  const params = new URLSearchParams({ ordering: "-date" });
  const query = input.query?.trim();
  if (query) params.set("search", query);
  if (input.status?.trim()) params.set("status", input.status.trim());
  const dateFrom = validateDate(input.dateFrom, "date_from");
  const dateTo = validateDate(input.dateTo, "date_to");
  if (dateFrom) params.set("period_from", dateFrom);
  if (dateTo) params.set("period_to", dateTo);
  return params;
}

export async function readElorusReceivables(
  input: ElorusReceivablesInput = {},
  fetchImpl: ElorusFetch = fetch,
  credentialLoader: ElorusCredentialLoader = loadElorusCredentials,
): Promise<Record<string, unknown>> {
  try {
    const credentials = await credentialLoader();
    if (!credentials.apiKey || !credentials.organizationId) throw new Error("elorus_credentials_missing");
    const params = new URLSearchParams({
      ordering: "-date",
      fpaid: "0",
      draft: "0",
      is_void: "0",
    });
    if (input.query?.trim()) params.set("search", input.query.trim());
    const raw = await fetchList("invoices/", params, RECEIVABLE_SCAN_MAX, fetchImpl, credentials);
    const excludedYears = input.includeIgnored2023 ? [] : [...ELORUS_IGNORED_RECEIVABLE_YEARS];
    const invoices = raw
      .map(normalizeInvoice)
      .filter((invoice) => invoice.outstanding > 0.005)
      .filter((invoice) => !["draft", "pending", "paid", "void"].includes(invoice.status))
      .filter((invoice) => !excludedYears.includes(Number(invoice.date.slice(0, 4)) as 2023));

    const totals = new Map<string, number>();
    const clients = new Map<string, {
      clientId: string;
      client: string;
      currency: string;
      invoiceCount: number;
      outstanding: number;
    }>();

    for (const invoice of invoices) {
      totals.set(invoice.currency, roundMoney((totals.get(invoice.currency) ?? 0) + invoice.outstanding));
      const key = `${invoice.clientId || invoice.client}\u0000${invoice.currency}`;
      const current = clients.get(key) ?? {
        clientId: invoice.clientId,
        client: invoice.client || "Άγνωστος πελάτης",
        currency: invoice.currency,
        invoiceCount: 0,
        outstanding: 0,
      };
      current.invoiceCount += 1;
      current.outstanding = roundMoney(current.outstanding + invoice.outstanding);
      clients.set(key, current);
    }

    const limit = boundedInteger(input.limit, 50, ELORUS_LIST_LIMIT_MAX);
    return {
      ok: true,
      readOnly: true,
      onDemand: true,
      automaticDelivery: false,
      policy: {
        excludedYears,
        includeIgnored2023: input.includeIgnored2023 === true,
      },
      count: invoices.length,
      totalsByCurrency: [...totals.entries()].map(([currency, outstanding]) => ({ currency, outstanding })),
      clients: [...clients.values()].sort((a, b) => b.outstanding - a.outstanding),
      invoices: invoices.slice(0, limit),
      truncated: invoices.length > limit,
    };
  } catch (error) {
    return readOnlyFailure(error);
  }
}

export async function readElorusInvoices(
  input: ElorusInvoicesInput = {},
  fetchImpl: ElorusFetch = fetch,
  credentialLoader: ElorusCredentialLoader = loadElorusCredentials,
): Promise<Record<string, unknown>> {
  try {
    const credentials = await credentialLoader();
    if (!credentials.apiKey || !credentials.organizationId) throw new Error("elorus_credentials_missing");
    const limit = boundedInteger(input.limit, 20, ELORUS_LIST_LIMIT_MAX);
    const items = await fetchList("invoices/", baseListParams(input), limit, fetchImpl, credentials);
    return {
      ok: true,
      readOnly: true,
      onDemand: true,
      automaticDelivery: false,
      count: items.length,
      invoices: items.map(normalizeInvoice),
    };
  } catch (error) {
    return readOnlyFailure(error);
  }
}

export async function readElorusEstimates(
  input: ElorusEstimatesInput = {},
  fetchImpl: ElorusFetch = fetch,
  credentialLoader: ElorusCredentialLoader = loadElorusCredentials,
): Promise<Record<string, unknown>> {
  try {
    const credentials = await credentialLoader();
    if (!credentials.apiKey || !credentials.organizationId) throw new Error("elorus_credentials_missing");
    const limit = boundedInteger(input.limit, 20, ELORUS_LIST_LIMIT_MAX);
    const items = await fetchList("estimates/", baseListParams(input), limit, fetchImpl, credentials);
    return {
      ok: true,
      readOnly: true,
      onDemand: true,
      automaticDelivery: false,
      count: items.length,
      estimates: items.map(normalizeEstimate),
    };
  } catch (error) {
    return readOnlyFailure(error);
  }
}

export async function readElorusPayments(
  input: ElorusPaymentsInput = {},
  fetchImpl: ElorusFetch = fetch,
  credentialLoader: ElorusCredentialLoader = loadElorusCredentials,
): Promise<Record<string, unknown>> {
  try {
    const credentials = await credentialLoader();
    if (!credentials.apiKey || !credentials.organizationId) throw new Error("elorus_credentials_missing");
    const limit = boundedInteger(input.limit, 20, ELORUS_PAYMENT_LIMIT_MAX);
    const params = new URLSearchParams({
      ordering: "-date",
      transaction_type: "ip",
    });
    const dateFrom = validateDate(input.dateFrom, "date_from");
    const dateTo = validateDate(input.dateTo, "date_to");
    if (dateFrom) params.set("period_from", dateFrom);
    if (dateTo) params.set("period_to", dateTo);

    const raw = await fetchList("cashreceipts/", params, ELORUS_PAYMENT_LIMIT_MAX, fetchImpl, credentials);
    const contactIds = [...new Set(raw.map((item) => asString(asRecord(item).contact)).filter(Boolean))];
    const contactNames = new Map<string, string>();
    await Promise.all(contactIds.map(async (contactId) => {
      try {
        const contact = asRecord(await elorusGet(`contacts/${encodeURIComponent(contactId)}/`, new URLSearchParams(), fetchImpl, credentials));
        contactNames.set(contactId, asString(contact.display_name));
      } catch {
        contactNames.set(contactId, "");
      }
    }));

    const query = input.query?.trim().toLocaleLowerCase("el-GR");
    const payments = raw.map((value) => {
      const receipt = asRecord(value);
      const contactId = asString(receipt.contact);
      return {
        id: asString(receipt.id),
        title: asString(receipt.title),
        date: asString(receipt.date),
        status: asString(receipt.status),
        contactId,
        contact: contactNames.get(contactId) || "Άγνωστος πελάτης",
        currency: asString(receipt.currency_code) || "EUR",
        amount: roundMoney(asNumber(receipt.amount)),
        invoicePayments: Array.isArray(receipt.invoice_payments) ? receipt.invoice_payments : [],
      };
    }).filter((payment) => !query
      || `${payment.contact} ${payment.title}`.toLocaleLowerCase("el-GR").includes(query));

    return {
      ok: true,
      readOnly: true,
      onDemand: true,
      automaticDelivery: false,
      count: Math.min(payments.length, limit),
      payments: payments.slice(0, limit),
      truncated: payments.length > limit,
    };
  } catch (error) {
    return readOnlyFailure(error);
  }
}
