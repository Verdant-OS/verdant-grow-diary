/**
 * Dedicated tests for /operator/ecowitt-bridge-debug:
 *  - Page renders the full-screen debug panel using sanitized
 *    view-model data only — never tokens, ingest URLs, raw payloads,
 *    Authorization headers, PASSKEY, .env values, service_role, or JWTs.
 *  - "Refresh bridge status" performs GET-only fetches to localhost,
 *    never POSTs, never triggers forwarding, never calls Supabase.
 *  - Page reuses the existing widget/view-model/helpers (no duplicated
 *    rule tables in JSX).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import EcowittBridgeDebug from "@/pages/EcowittBridgeDebug";

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

const LEAKY_STATUS = {
  ok: true,
  forwarding_enabled: true,
  forwarding_ready: true,
  ingest_url_configured: true,
  bridge_token_configured: true,
  tent_id_configured: true,
  tent_id_valid: true,
  last_forward_status: 400,
  last_forward_error: "http_400",
  last_forward_response_error: "insert_failed",
  last_forward_response_classification: "storage_insert_failed",
  last_forward_response_reason: "insert_source_constraint_failed",
  last_forward_response_message:
    "vbt_LEAKEDTOKENABCDEFGHIJ Authorization: Bearer eyJaaaaaaaaa.eyJbbbbbbbbb.signaturecccccccccc PASSKEY=DEVSECRET",
  // Belt-and-braces leak surface (must never reach DOM).
  ingest_url: "https://example.supabase.co/functions/v1/sensor-ingest-webhook",
  ingest_url_masked: "https://exa****.supabase.co/****/sensor-ingest-webhook",
  bridge_token: "vbt_REALTOKENMUSTNOTLEAK",
  bridge_token_preview: "vbt_REAL****LEAK",
  authorization: "Bearer vbt_REALTOKENMUSTNOTLEAK",
  raw_payload: { PASSKEY: "DEVSECRET", model: "GW1100A" },
  raw_request_body: "PASSKEY=DEVSECRET&tempf=72",
  raw_response_body: "service_role used; constraint sensor_readings_source_check violated",
  passkey: "DEVSECRET",
  forward_success_count: 0,
  forward_failure_count: 5,
  forward_attempt_count: 5,
  forward_blocked_count: 0,
  retry_count: 2,
  last_retry_error: "http_503",
  last_retry_at: "2026-06-17T05:40:30Z",
  last_retryable_status: 503,
  max_retry_attempts: 2,
};

function mockFetch(returnValue: unknown) {
  const fn = vi.fn(async (_url: string, _init?: RequestInit) => ({
    ok: true,
    status: 200,
    json: async () => returnValue,
    text: async () => JSON.stringify(returnValue),
  }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/operator/ecowitt-bridge-debug"]}>
      <EcowittBridgeDebug />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("EcowittBridgeDebug page", () => {
  it("renders dedicated debug chrome with both sections and reuses the widget", async () => {
    mockFetch(LEAKY_STATUS);
    renderPage();
    expect(screen.getByTestId("ecowitt-bridge-debug-page")).toBeInTheDocument();
    expect(screen.getByText(/EcoWitt Bridge Debug/i)).toBeInTheDocument();
    expect(
      screen.getByTestId("ecowitt-bridge-debug-forwarding-status-section"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("ecowitt-bridge-debug-forwarding-error-report-section"),
    ).toBeInTheDocument();
    // Reuses the widget (refresh + copy buttons come from it).
    expect(
      await screen.findByTestId("ecowitt-local-forwarding-refresh"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("ecowitt-local-forwarding-copy-report"),
    ).toBeInTheDocument();
  });

  it("never renders bridge tokens, ingest URLs, Authorization, PASSKEY, raw payloads, service_role, or JWTs", async () => {
    mockFetch(LEAKY_STATUS);
    const { container } = renderPage();
    await waitFor(() =>
      expect(
        screen.getByTestId("ecowitt-local-forwarding-headline"),
      ).toBeInTheDocument(),
    );
    const text = container.textContent ?? "";
    // Secrets and leak vectors must never appear in rendered DOM.
    expect(text).not.toMatch(/vbt_[A-Za-z0-9_-]{6,}/);
    expect(text).not.toMatch(/vbt_REAL/);
    expect(text).not.toMatch(/Bearer\s+[A-Za-z0-9._-]{6,}/i);
    expect(text).not.toMatch(/eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}/);
    expect(text).not.toMatch(/PASSKEY/i);
    expect(text).not.toMatch(/DEVSECRET/);
    expect(text).not.toMatch(/REALTOKENMUSTNOTLEAK/);
    expect(text).not.toMatch(/raw_payload/i);
    expect(text).not.toMatch(/raw_request_body|raw_response_body/i);
    expect(text).not.toMatch(/service_role/i);
    // Ingest URL must not be rendered (the only allowed localhost URLs
    // are the bridge debug endpoints, which are not ingest URLs).
    expect(text).not.toMatch(/example\.supabase\.co/);
    expect(text).not.toMatch(/sensor-ingest-webhook/);
    expect(text).not.toMatch(/exa\*+/); // masked ingest preview
  });

  it("refresh performs localhost GET only — no POST, no Supabase, no forwarding trigger", async () => {
    const fn = mockFetch(LEAKY_STATUS);
    renderPage();
    const btn = await screen.findByTestId("ecowitt-local-forwarding-refresh");
    const before = fn.mock.calls.length;
    fireEvent.click(btn);
    await waitFor(() => expect(fn.mock.calls.length).toBeGreaterThan(before));
    for (const call of fn.mock.calls) {
      const [url, init] = call as unknown as [string, RequestInit | undefined];
      // Localhost-only.
      expect(url).toMatch(/^http:\/\/localhost:8787\//);
      // GET-only (default method, or explicit GET).
      expect((init?.method ?? "GET").toUpperCase()).toBe("GET");
      // No body — never triggers forwarding.
      expect(init?.body).toBeUndefined();
      // No Supabase / no remote service.
      expect(url).not.toMatch(/supabase/i);
      expect(url).not.toMatch(/functions\/v1/);
    }
  });

  it("refresh updates banner + rows after refreshed data returns", async () => {
    // First call: healthy. Second call: failed.
    const HEALTHY = { ...LEAKY_STATUS, last_forward_status: 200, last_forward_error: null, last_forward_response_error: null, last_forward_response_classification: null, last_forward_response_reason: null, forward_failure_count: 0 };
    let call = 0;
    const fn = vi.fn(async () => {
      call += 1;
      const body = call === 1 ? HEALTHY : LEAKY_STATUS;
      return {
        ok: true,
        status: 200,
        json: async () => body,
        text: async () => JSON.stringify(body),
      };
    });
    vi.stubGlobal("fetch", fn);
    renderPage();
    await waitFor(() =>
      expect(screen.queryByTestId("ecowitt-local-forwarding-banner")).toBeNull(),
    );
    fireEvent.click(screen.getByTestId("ecowitt-local-forwarding-refresh"));
    await waitFor(() =>
      expect(screen.getByTestId("ecowitt-local-forwarding-banner")).toBeInTheDocument(),
    );
    expect(
      screen.getByTestId("ecowitt-local-forwarding-banner-classification"),
    ).toHaveTextContent("storage_insert_failed");
  });

  it("handles offline/fetch failure with neutral copy and no leakage", async () => {
    const fn = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    vi.stubGlobal("fetch", fn);
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId("ecowitt-local-forwarding-headline")).toHaveTextContent(
        /not reachable on localhost:8787/i,
      ),
    );
    expect(screen.queryByTestId("ecowitt-local-forwarding-banner")).toBeNull();
  });
});
