import { describe, expect, it, vi } from "vitest";
import {
  readElorusEstimates,
  readElorusInvoices,
  readElorusPayments,
  readElorusReceivables,
} from "./elorus.js";

const credentials = async () => ({
  apiKey: "test-api-key",
  organizationId: "test-organization",
});

function listResponse(results: unknown[], next: string | null = null) {
  return new Response(JSON.stringify({ count: results.length, next, results }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

const currentInvoice = {
  id: "current",
  representation: "ΤΠΥ-2026-1",
  status: "overdue",
  date: "2026-05-01",
  due_date: "2026-05-31",
  client: "client-current",
  client_display_name: "Current Client",
  currency_code: "EUR",
  total: "124.00",
  payable: "124.00",
  paid: "24.00",
};

const ignoredInvoice = {
  ...currentInvoice,
  id: "old",
  representation: "ΤΠΥ-2023-1",
  date: "2023-04-10",
  client: "client-old",
  client_display_name: "Old Client",
  payable: "200.00",
  paid: "0.00",
};

describe("Elorus read-only integration", () => {
  it("fails closed when credentials are missing", async () => {
    const fetchMock = vi.fn();
    await expect(readElorusInvoices({}, fetchMock, async () => {
      throw new Error("elorus_credentials_missing");
    })).resolves.toMatchObject({
      ok: false,
      readOnly: true,
      error: "elorus_credentials_missing",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses GET with the required authentication headers and bounded list parameters", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      listResponse([currentInvoice]));

    const result = await readElorusInvoices({
      dateFrom: "2026-01-01",
      dateTo: "2026-12-31",
      limit: 999,
    }, fetchMock, credentials);

    expect(result).toMatchObject({ ok: true, count: 1 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/v1.2/invoices/");
    expect(String(url)).toContain("period_from=2026-01-01");
    expect(String(url)).toContain("page_size=100");
    expect(init?.method).toBe("GET");
    expect(new Headers(init?.headers).get("authorization")).toBe("Token test-api-key");
    expect(new Headers(init?.headers).get("x-elorus-organization")).toBe("test-organization");
  });

  it("rejects impossible dates before making an API request", async () => {
    const fetchMock = vi.fn();
    const result = await readElorusInvoices({ dateFrom: "2026-02-31" }, fetchMock, credentials);

    expect(result).toMatchObject({ ok: false, error: "invalid_date_from" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("excludes outstanding 2023 invoices from the default receivables view", async () => {
    const fetchMock = vi.fn(async () => listResponse([currentInvoice, ignoredInvoice]));
    const result = await readElorusReceivables({}, fetchMock, credentials);

    expect(result).toMatchObject({
      ok: true,
      count: 1,
      policy: { excludedYears: [2023], includeIgnored2023: false },
      totalsByCurrency: [{ currency: "EUR", outstanding: 100 }],
    });
    expect(result.clients).toEqual([expect.objectContaining({ client: "Current Client", outstanding: 100 })]);
    expect(JSON.stringify(result)).not.toContain("Old Client");
  });

  it("includes 2023 receivables only when explicitly requested", async () => {
    const fetchMock = vi.fn(async () => listResponse([currentInvoice, ignoredInvoice]));
    const result = await readElorusReceivables({ includeIgnored2023: true }, fetchMock, credentials);

    expect(result).toMatchObject({
      ok: true,
      count: 2,
      policy: { excludedYears: [], includeIgnored2023: true },
      totalsByCurrency: [{ currency: "EUR", outstanding: 300 }],
    });
    expect(JSON.stringify(result)).toContain("Old Client");
  });

  it("keeps receivable totals separate by currency", async () => {
    const fetchMock = vi.fn(async () => listResponse([
      currentInvoice,
      { ...currentInvoice, id: "usd", client: "client-usd", currency_code: "USD", payable: "50", paid: "0" },
    ]));
    const result = await readElorusReceivables({}, fetchMock, credentials);

    expect(result.totalsByCurrency).toEqual([
      { currency: "EUR", outstanding: 100 },
      { currency: "USD", outstanding: 50 },
    ]);
  });

  it("queries estimates without applying the receivables exclusion policy", async () => {
    const fetchMock = vi.fn(async () => listResponse([{
      ...ignoredInvoice,
      status: "accepted",
    }]));
    const result = await readElorusEstimates({ dateFrom: "2023-01-01", dateTo: "2023-12-31" }, fetchMock, credentials);

    expect(result).toMatchObject({ ok: true, count: 1 });
    expect(JSON.stringify(result)).toContain("Old Client");
  });

  it("resolves payment contact names and filters locally", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/contacts/contact-1/")) {
        return new Response(JSON.stringify({ id: "contact-1", display_name: "Example Client" }), { status: 200 });
      }
      return listResponse([{
        id: "receipt-1",
        transaction_type: "ip",
        title: "Payment",
        date: "2026-06-10",
        contact: "contact-1",
        currency_code: "EUR",
        amount: "80.50",
        invoice_payments: [],
        status: "active",
      }]);
    });

    const result = await readElorusPayments({ query: "example" }, fetchMock, credentials);

    expect(result).toMatchObject({
      ok: true,
      count: 1,
      payments: [{ contact: "Example Client", amount: 80.5 }],
    });
    expect(String(fetchMock.mock.calls[0][0])).toContain("transaction_type=ip");
  });
});
