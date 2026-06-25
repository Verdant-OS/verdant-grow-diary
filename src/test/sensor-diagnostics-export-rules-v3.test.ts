import { describe, expect, it } from "vitest";
import {
  buildDiagnosticsShareModalState,
  buildSensorIngestNetworkDiagnostics,
} from "@/lib/sensorDiagnosticsExportRules";

const PLAINTEXT = "vbt_PLAINTEXT_DO_NOT_LEAK_abcdef1234";
const SUPABASE_INGEST = "https://abc.supabase.co/functions/v1/sensor-ingest-webhook";
const APP_HTTPS = "https://app.verdant.example";

describe("buildSensorIngestNetworkDiagnostics", () => {
  it("returns not_applicable for non-network HTTP responses", () => {
    const r = buildSensorIngestNetworkDiagnostics({
      ingestUrl: SUPABASE_INGEST,
      appOrigin: APP_HTTPS,
      httpStatus: 401,
      classification: "auth_problem",
    });
    expect(r.status).toBe("not_applicable");
    expect(r.safeSupportSummary).toBe("");
    expect(r.recommendedChecks).toEqual([]);
  });

  it("HTTP 0 + network_error returns a network diagnostics state with evidence", () => {
    const r = buildSensorIngestNetworkDiagnostics({
      ingestUrl: SUPABASE_INGEST,
      appOrigin: APP_HTTPS,
      httpStatus: 0,
      classification: "network_error",
      errorMessage: "Failed to fetch",
      requestMethod: "POST",
      hasActiveToken: true,
    });
    expect(r.status).not.toBe("not_applicable");
    expect(r.evidence.some((e) => e.includes("HTTP status: 0"))).toBe(true);
    expect(r.evidence.some((e) => e.includes("Failed to fetch"))).toBe(true);
    expect(r.evidence.some((e) => e.includes("bridge token present: yes"))).toBe(true);
    expect(r.safeSupportSummary).toContain("network diagnostics");
  });

  it("HTTPS app + HTTP ingest URL → likely_mixed_content", () => {
    const r = buildSensorIngestNetworkDiagnostics({
      ingestUrl: "http://example.com/functions/v1/sensor-ingest-webhook",
      appOrigin: APP_HTTPS,
      httpStatus: 0,
      classification: "network_error",
      errorMessage: "Failed to fetch",
    });
    expect(r.status).toBe("likely_mixed_content");
    expect(r.title).toMatch(/mixed-content/i);
  });

  it("cross-origin Failed to fetch → CORS/preflight recommendation", () => {
    const r = buildSensorIngestNetworkDiagnostics({
      ingestUrl: SUPABASE_INGEST,
      appOrigin: APP_HTTPS,
      httpStatus: 0,
      classification: "network_error",
      errorMessage: "Failed to fetch",
    });
    expect(r.status).toBe("likely_cors_or_preflight");
    expect(r.recommendedChecks.join("\n")).toMatch(/OPTIONS|CORS/);
  });

  it("localhost ingest URL from non-local origin → likely_endpoint_unreachable", () => {
    const r = buildSensorIngestNetworkDiagnostics({
      ingestUrl: "http://127.0.0.1:8080/ingest",
      appOrigin: APP_HTTPS,
      httpStatus: 0,
      classification: "network_error",
    });
    expect(r.status).toBe("likely_endpoint_unreachable");
    expect(r.recommendedChecks.join("\n")).toMatch(/reachable|firewall|listener/i);
  });

  it("missing/malformed URL → endpoint misconfigured", () => {
    const r = buildSensorIngestNetworkDiagnostics({
      ingestUrl: "not a url",
      appOrigin: APP_HTTPS,
      httpStatus: 0,
      classification: "network_error",
    });
    expect(r.status).toBe("likely_endpoint_misconfigured");

    const r2 = buildSensorIngestNetworkDiagnostics({
      ingestUrl: null,
      appOrigin: APP_HTTPS,
      httpStatus: 0,
      classification: "network_error",
    });
    expect(r2.status).toBe("likely_endpoint_misconfigured");
    expect(r2.resolvedEndpoint).toBe("<missing>");
  });

  it("never includes plaintext token in output, only boolean", () => {
    const r = buildSensorIngestNetworkDiagnostics({
      ingestUrl: `${SUPABASE_INGEST}?leak=${PLAINTEXT}`,
      appOrigin: APP_HTTPS,
      httpStatus: 0,
      classification: "network_error",
      errorMessage: `Failed to fetch ${PLAINTEXT}`,
      hasActiveToken: true,
    });
    const serialized = JSON.stringify(r);
    expect(serialized).not.toContain(PLAINTEXT);
    expect(r.safeSupportSummary).not.toContain(PLAINTEXT);
    expect(r.safeSupportSummary).toContain("bridge token present: yes");
  });

  it("share modal summary includes network diagnostics when applicable", () => {
    const network = buildSensorIngestNetworkDiagnostics({
      ingestUrl: SUPABASE_INGEST,
      appOrigin: APP_HTTPS,
      httpStatus: 0,
      classification: "network_error",
      errorMessage: "Failed to fetch",
    });
    const state = buildDiagnosticsShareModalState({
      bundleFilename: "bundle.zip",
      validationUi: {
        status: "no_test_yet",
        statusLabel: "No test yet",
        badgeTone: "muted",
        actionsDisabled: true,
        disabledReason: "Run a test",
        summary: { missing: [], invalid: [] },
      } as any,
      lastTestResult: { http_status: 0, classification: "network_error" },
      inspectorPlainText: null,
      networkDiagnostics: network,
    });
    expect(state.networkDiagnostics).toBe(network);
    expect(state.supportSummary).toContain("network diagnostics");
    expect(state.supportSummary).toContain("likely_cors_or_preflight");
  });

  it("share modal summary omits network diagnostics when not applicable", () => {
    const network = buildSensorIngestNetworkDiagnostics({
      ingestUrl: SUPABASE_INGEST,
      appOrigin: APP_HTTPS,
      httpStatus: 200,
      classification: "accepted",
    });
    const state = buildDiagnosticsShareModalState({
      bundleFilename: "bundle.zip",
      validationUi: {
        status: "ready",
        statusLabel: "Ready",
        badgeTone: "ready",
        actionsDisabled: false,
        disabledReason: null,
        summary: { missing: [], invalid: [] },
      } as any,
      lastTestResult: { http_status: 200, classification: "accepted" },
      inspectorPlainText: "ok",
      networkDiagnostics: network,
    });
    expect(state.supportSummary).not.toContain("network diagnostics");
  });
});
