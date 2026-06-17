import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import EcowittLocalForwardingStatusWidget from "@/components/EcowittLocalForwardingStatusWidget";

const toastSpy = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastSpy }),
}));

const READY_STATUS = {
  ok: true,
  forwarding_enabled: true,
  forwarding_ready: true,
  ingest_url_configured: true,
  bridge_token_configured: true,
  tent_id_configured: true,
  tent_id_valid: true,
  last_forward_status: 200,
  last_forward_error: null,
  last_forward_response_error: null,
  last_forward_response_classification: null,
  last_forward_response_message: null,
  forward_success_count: 3,
  forward_failure_count: 1,
  forward_attempt_count: 4,
  forward_blocked_count: 0,
  retry_count: 2,
  last_retry_error: "http_503",
  last_retry_at: "2026-06-17T05:40:30Z",
  last_retryable_status: 503,
  max_retry_attempts: 2,
};

const FAILED_STATUS = {
  ...READY_STATUS,
  last_forward_status: 400,
  last_forward_error: "http_400",
  last_forward_response_error: "invalid_payload",
  last_forward_response_classification: "payload_shape_mismatch",
};

const ERROR_REPORT = {
  ok: true,
  generated_at: "2026-06-17T05:40:30Z",
  forwarding_enabled: true,
  forwarding_ready: true,
  ingest_url_configured: true,
  bridge_token_configured: true,
  tent_id_configured: true,
  tent_id_valid: true,
  last_forward_status: 400,
  last_forward_error: "http_400",
  last_forward_response_error: "invalid_payload",
  last_forward_response_classification: "payload_shape_mismatch",
  last_forward_response_message: "tent_id required (uuid)",
  retry_count: 0,
  last_retry_error: null,
  max_retry_attempts: 2,
  recommended_next_step: "Confirm the forwarded payload includes tent_id …",
  latest_metrics: { source: "live", vendor: "ecowitt_windows_testbench", metrics: {}, captured_at: null },
  malformed_line_count: 0,
};

function mockFetchOnce(map: Record<string, unknown | "throw" | { httpStatus: number }>) {
  const fn = vi.fn(async (url: string) => {
    const entry = map[url] ?? map["*"];
    if (entry === "throw") throw new TypeError("fetch failed");
    if (entry && typeof entry === "object" && "httpStatus" in (entry as object)) {
      const s = (entry as { httpStatus: number }).httpStatus;
      return { ok: false, status: s, json: async () => ({}), text: async () => "" };
    }
    return {
      ok: true,
      status: 200,
      json: async () => entry,
      text: async () => JSON.stringify(entry),
    };
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

beforeEach(() => {
  toastSpy.mockReset();
  vi.unstubAllGlobals();
});

describe("EcowittLocalForwardingStatusWidget", () => {
  it("renders offline state when localhost fetch fails", async () => {
    mockFetchOnce({ "*": "throw" });
    render(<EcowittLocalForwardingStatusWidget />);
    await waitFor(() => {
      expect(screen.getByTestId("ecowitt-local-forwarding-headline")).toHaveTextContent(
        /not reachable on localhost:8787/i,
      );
    });
  });

  it("renders last_forward_status, classification, and retry_count when ready", async () => {
    mockFetchOnce({ "http://localhost:8787/debug/forwarding-status": FAILED_STATUS });
    render(<EcowittLocalForwardingStatusWidget />);
    await waitFor(() => {
      expect(
        screen.getByTestId("ecowitt-local-forwarding-row-last_forward_status"),
      ).toHaveTextContent("400");
    });
    expect(
      screen.getByTestId(
        "ecowitt-local-forwarding-row-last_forward_response_classification",
      ),
    ).toHaveTextContent("payload_shape_mismatch");
    expect(screen.getByTestId("ecowitt-local-forwarding-row-retry_count")).toHaveTextContent(
      "2 / max 2",
    );
  });

  it("renders link to /debug/forwarding-error-report", async () => {
    mockFetchOnce({ "*": READY_STATUS });
    render(<EcowittLocalForwardingStatusWidget />);
    const link = await screen.findByTestId("ecowitt-local-forwarding-report-link");
    expect(link).toHaveAttribute(
      "href",
      "http://localhost:8787/debug/forwarding-error-report",
    );
  });

  it("copy button writes allow-listed sanitized report with top-level header + safety + bridge_status + latest_metrics", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    mockFetchOnce({
      "http://localhost:8787/debug/forwarding-status": FAILED_STATUS,
      "http://localhost:8787/debug/forwarding-error-report": ERROR_REPORT,
    });
    render(<EcowittLocalForwardingStatusWidget autoFetch={false} />);
    fireEvent.click(screen.getByTestId("ecowitt-local-forwarding-copy-report"));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const written = (writeText.mock.calls[0] as unknown as [string])[0];
    const parsed = JSON.parse(written);
    expect(parsed.report_type).toBe("verdant_ecowitt_forwarding_debug_report");
    expect(parsed.generated_by).toBe("verdant_operator_mode");
    expect(typeof parsed.copied_at).toBe("string");
    expect(parsed.safety).toEqual({
      sanitized: true,
      raw_payload_included: false,
      secrets_included: false,
      write_action: false,
    });
    // Allow-listed bridge_status fields only.
    expect(Object.keys(parsed.bridge_status).sort()).toEqual(
      [
        "forwarding_enabled",
        "forwarding_ready",
        "generated_at",
        "last_forward_error",
        "last_forward_response_classification",
        "last_forward_response_error",
        "last_forward_response_reason",
        "last_forward_status",
        "last_retry_error",
        "malformed_line_count",
        "max_retry_attempts",
        "recommended_next_step",
        "retry_count",
      ].sort(),
    );
    expect(parsed.bridge_status.last_forward_status).toBe(400);
    expect(parsed.bridge_status.last_forward_response_classification).toBe(
      "payload_shape_mismatch",
    );
    expect(parsed.latest_metrics).toBeDefined();
    expect(Object.keys(parsed.latest_metrics).sort()).toEqual(
      ["captured_at", "metrics", "source", "vendor"].sort(),
    );
    // No disallowed top-level fields.
    expect(Object.keys(parsed).sort()).toEqual(
      [
        "bridge_status",
        "copied_at",
        "generated_by",
        "latest_metrics",
        "report_type",
        "safety",
      ].sort(),
    );
    // Disallowed leakage paths must not appear anywhere in the serialized output.
    expect(written).not.toContain("ingest_url");
    expect(written).not.toContain("bridge_token");
    expect(written).not.toContain("authorization");
    expect(written).not.toMatch(/PASSKEY/i);
    expect(written).not.toContain("raw_payload");
    expect(written).not.toMatch(/\.env/);
    expect(written).not.toMatch(/service_role/i);
    expect(written).not.toMatch(/eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}/);
  });

  it("never copies token-like / Authorization / PASSKEY / raw_payload / .env content", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const leakyReport = {
      ...ERROR_REPORT,
      // Belt-and-braces: simulate listener regression that leaks secrets.
      last_forward_response_message:
        "bad token vbt_AAAAAAAAAAAAAAAAAAAAAAA in Authorization: Bearer eyJabcdefghij.eyJabcdefghij.signatureabcdefghij",
      authorization: "Bearer vbt_REALTOKENMUSTNOTLEAK",
      raw_payload: { PASSKEY: "DEVICESECRET" },
      passkey: "DEVICESECRET",
    };
    mockFetchOnce({
      "http://localhost:8787/debug/forwarding-error-report": leakyReport,
    });
    render(<EcowittLocalForwardingStatusWidget autoFetch={false} />);
    fireEvent.click(screen.getByTestId("ecowitt-local-forwarding-copy-report"));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    const written = (writeText.mock.calls[0] as unknown as [string])[0];
    expect(written).not.toMatch(/vbt_[A-Za-z0-9_-]{6,}/);
    expect(written).not.toMatch(/Bearer\s+[A-Za-z0-9._-]{6,}/i);
    expect(written).not.toMatch(/eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}/);
    expect(written).not.toMatch(/PASSKEY/i);
    expect(written).not.toMatch(/DEVICESECRET/);
    expect(written).not.toMatch(/REALTOKENMUSTNOTLEAK/);
    // raw_payload key must be redacted (key kept, value replaced)
    expect(written).not.toContain('"DEVICESECRET"');
  });

  it("shows safe offline message when copy fetch fails", async () => {
    mockFetchOnce({ "*": "throw" });
    render(<EcowittLocalForwardingStatusWidget autoFetch={false} />);
    fireEvent.click(screen.getByTestId("ecowitt-local-forwarding-copy-report"));
    await waitFor(() => expect(toastSpy).toHaveBeenCalled());
    const call = toastSpy.mock.calls[0][0];
    expect(call.description).toMatch(/not reachable|Start the listener/i);
  });

  it("widget never triggers POST / mutation / forwarding / Supabase calls", async () => {
    const fn = mockFetchOnce({ "*": READY_STATUS });
    render(<EcowittLocalForwardingStatusWidget />);
    await waitFor(() => expect(fn).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId("ecowitt-local-forwarding-refresh"));
    await waitFor(() => expect(fn.mock.calls.length).toBeGreaterThanOrEqual(2));
    for (const call of fn.mock.calls) {
      const [url, init] = call as unknown as [string, RequestInit | undefined];
      expect(url.startsWith("http://localhost:8787/")).toBe(true);
      // No method override → defaults to GET
      expect(init?.method ?? "GET").toBe("GET");
      // No bodies on these requests
      expect(init?.body).toBeUndefined();
    }
  });

  it("shows banner on failed forwarding status with status/classification/reason and next step", async () => {
    const failedWithReason = {
      ...FAILED_STATUS,
      last_forward_response_reason: "insert_source_constraint_failed",
      recommended_next_step:
        "Confirm the stored canonical source remap to \"live\" is deployed.",
      generated_at: "2026-06-17T05:40:30Z",
      malformed_line_count: 0,
      latest_metrics: {
        source: "live",
        vendor: "ecowitt_windows_testbench",
        captured_at: "2026-06-17T05:39:00Z",
        metrics: { temperature_c: 22.1, humidity_pct: 55 },
      },
    };
    mockFetchOnce({ "http://localhost:8787/debug/forwarding-status": failedWithReason });
    render(<EcowittLocalForwardingStatusWidget />);
    const banner = await screen.findByTestId("ecowitt-local-forwarding-banner");
    expect(banner).toHaveTextContent("EcoWitt ingest needs attention");
    expect(screen.getByTestId("ecowitt-local-forwarding-banner-status")).toHaveTextContent("400");
    expect(
      screen.getByTestId("ecowitt-local-forwarding-banner-classification"),
    ).toHaveTextContent("payload_shape_mismatch");
    expect(
      screen.getByTestId("ecowitt-local-forwarding-banner-reason"),
    ).toHaveTextContent("insert_source_constraint_failed");
    expect(
      screen.getByTestId("ecowitt-local-forwarding-banner-next-step"),
    ).toHaveTextContent(/stored canonical source remap/i);
    expect(
      screen.getByTestId("ecowitt-local-forwarding-banner-report-link"),
    ).toHaveAttribute("href", "http://localhost:8787/debug/forwarding-error-report");
  });

  it("banner is hidden when forwarding succeeded (no failures)", async () => {
    const okStatus = {
      ...READY_STATUS,
      last_forward_status: 200,
      last_forward_error: null,
      last_forward_response_error: null,
      last_forward_response_classification: null,
      forward_failure_count: 0,
    };
    mockFetchOnce({ "http://localhost:8787/debug/forwarding-status": okStatus });
    render(<EcowittLocalForwardingStatusWidget />);
    await waitFor(() =>
      expect(screen.getByTestId("ecowitt-local-forwarding-headline")).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("ecowitt-local-forwarding-banner")).toBeNull();
  });

  it("banner is hidden in offline state (neutral copy only)", async () => {
    mockFetchOnce({ "*": "throw" });
    render(<EcowittLocalForwardingStatusWidget />);
    await waitFor(() =>
      expect(screen.getByTestId("ecowitt-local-forwarding-headline")).toHaveTextContent(
        /not reachable on localhost:8787/i,
      ),
    );
    expect(screen.queryByTestId("ecowitt-local-forwarding-banner")).toBeNull();
  });

  it("banner never renders bridge token / Authorization / PASSKEY content even if status leaks", async () => {
    const leakyStatus = {
      ...FAILED_STATUS,
      last_forward_response_reason:
        "insert_failed vbt_LEAKEDTOKENABCDEFGHIJ Authorization: Bearer eyJabcdefghij.eyJabcdefghij.signatureabc PASSKEY=SECRET",
      recommended_next_step:
        "Bearer vbt_REALTOKENMUSTNOTLEAK in PASSKEY: DEVICESECRET",
    };
    mockFetchOnce({ "http://localhost:8787/debug/forwarding-status": leakyStatus });
    render(<EcowittLocalForwardingStatusWidget />);
    const banner = await screen.findByTestId("ecowitt-local-forwarding-banner");
    const text = banner.textContent ?? "";
    expect(text).not.toMatch(/vbt_[A-Za-z0-9_-]{6,}/);
    expect(text).not.toMatch(/Bearer\s+[A-Za-z0-9._-]{6,}/i);
    expect(text).not.toMatch(/eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}/);
    expect(text).not.toMatch(/PASSKEY/i);
  });
});
