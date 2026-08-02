/**
 * Pure unit tests for the operator clipboard forwarding debug report.
 *
 * Safety contract under test:
 *  - Allow-list metric keys only
 *  - Secret-shaped substrings redacted via sanitizeReportText
 *  - safety flags always claim sanitized / no secrets / no write_action
 *  - No raw payload body or bridge tokens on the serialized payload
 */
import { describe, expect, it } from "vitest";
import {
  ALLOWED_METRIC_KEYS,
  buildSanitizedForwardingReport,
  serializeSanitizedForwardingReport,
} from "@/lib/ecowittForwardingReportExport";
import type { LocalForwardingStatus } from "@/lib/ecowittLocalForwardingStatus";

const NOW_ISO = "2026-08-02T12:00:00.000Z";

function status(over: Partial<LocalForwardingStatus> = {}): LocalForwardingStatus {
  return {
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
    last_forward_response_reason: null,
    last_forward_response_message: null,
    forward_success_count: 1,
    forward_failure_count: 0,
    forward_attempt_count: 1,
    forward_blocked_count: 0,
    retry_count: 0,
    last_retry_error: null,
    last_retry_at: null,
    last_retryable_status: null,
    max_retry_attempts: 3,
    recommended_next_step: "Check local listener",
    malformed_line_count: 0,
    generated_at: "2026-08-02T11:59:00.000Z",
    latest_metrics: {
      source: "live",
      vendor: "ecowitt",
      physical_gateway_evidence: true,
      captured_at: "2026-08-02T11:58:00.000Z",
      metric_keys: ["temp_f", "humidity_percent"],
    },
    ...over,
  };
}

describe("buildSanitizedForwardingReport", () => {
  it("builds a happy-path report with fixed safety flags", () => {
    const report = buildSanitizedForwardingReport({
      status: status(),
      nowIso: NOW_ISO,
    });

    expect(report.report_type).toBe("verdant_ecowitt_forwarding_debug_report");
    expect(report.generated_by).toBe("verdant_operator_mode");
    expect(report.copied_at).toBe(NOW_ISO);
    expect(report.safety).toEqual({
      sanitized: true,
      raw_payload_included: false,
      secrets_included: false,
      write_action: false,
    });
    expect(report.bridge_status.forwarding_enabled).toBe(true);
    expect(report.bridge_status.forwarding_ready).toBe(true);
    expect(report.bridge_status.last_forward_status).toBe(200);
    expect(report.bridge_status.recommended_next_step).toBe("Check local listener");
    expect(report.latest_metrics.captured_at).toBe("2026-08-02T11:58:00.000Z");
    expect(report.latest_metrics.source).toBe("live");
    expect(report.latest_metrics.vendor).toBe("ecowitt");
    // Status-only path does not project numeric metrics (error report does).
    expect(report.latest_metrics.metrics).toEqual({});
  });

  it("prefer error-report metrics and allow-lists metric keys only", () => {
    const report = buildSanitizedForwardingReport({
      status: status(),
      errorReport: {
        recommended_next_step: "Retry after fixing tent_id",
        generated_at: "2026-08-02T11:57:00.000Z",
        malformed_line_count: 2,
        latest_metrics: {
          captured_at: "2026-08-02T11:56:00.000Z",
          source: "live",
          vendor: "ecowitt",
          metrics: {
            temp_f: 78.5,
            humidity_percent: 55,
            soil_moisture_pct: 32,
            co2_ppm: 900,
            // Unknown / internal keys must never appear.
            secret_metric: 1,
            raw_payload: { stationtype: "leak" },
            Authorization: "Bearer eyJabc.def.ghi",
          },
        },
      },
      nowIso: NOW_ISO,
    });

    expect(report.bridge_status.malformed_line_count).toBe(2);
    expect(report.bridge_status.generated_at).toBe("2026-08-02T11:57:00.000Z");
    expect(report.bridge_status.recommended_next_step).toBe("Retry after fixing tent_id");
    expect(report.latest_metrics.metrics).toEqual({
      temp_f: 78.5,
      humidity_percent: 55,
      soil_moisture_pct: 32,
      co2_ppm: 900,
    });
    for (const key of Object.keys(report.latest_metrics.metrics)) {
      expect(ALLOWED_METRIC_KEYS).toContain(key);
    }
    expect(report.latest_metrics.metrics).not.toHaveProperty("secret_metric");
    expect(report.latest_metrics.metrics).not.toHaveProperty("raw_payload");
    expect(report.latest_metrics.metrics).not.toHaveProperty("Authorization");
  });

  it("redacts secret-shaped substrings in free-form error fields", () => {
    const report = buildSanitizedForwardingReport({
      status: status({
        last_forward_error:
          "failed Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc123def.ghi456jkl with vbt_abc123TOKEN",
        last_retry_error: "PASSKEY missing service_role",
        recommended_next_step: null,
      }),
      nowIso: NOW_ISO,
    });

    expect(report.bridge_status.last_forward_error).not.toMatch(/Bearer\s+\S+/i);
    expect(report.bridge_status.last_forward_error).not.toMatch(/vbt_/);
    expect(report.bridge_status.last_forward_error).toContain("[REDACTED]");
    expect(report.bridge_status.last_retry_error).not.toMatch(/PASSKEY/i);
    expect(report.bridge_status.last_retry_error).not.toMatch(/service_role/i);
    expect(report.bridge_status.last_retry_error).toContain("[REDACTED]");
  });

  it("coerces non-finite numbers and non-string errors safely", () => {
    const report = buildSanitizedForwardingReport({
      status: status({
        retry_count: "3",
        max_retry_attempts: Number.NaN,
        last_forward_error: 404,
        last_forward_status: "200",
        // intentional garbage from a degraded listener — runtime coercion under test
      } as never),
      nowIso: NOW_ISO,
    });

    expect(report.bridge_status.retry_count).toBe(0);
    expect(report.bridge_status.max_retry_attempts).toBe(0);
    expect(report.bridge_status.last_forward_error).toBeNull();
    expect(report.bridge_status.last_forward_status).toBeNull();
  });

  it("prefers explicit recommendedNextStep over error report and status", () => {
    const report = buildSanitizedForwardingReport({
      status: status({ recommended_next_step: "from-status" }),
      errorReport: { recommended_next_step: "from-error" },
      recommendedNextStep: "from-arg",
      nowIso: NOW_ISO,
    });
    expect(report.bridge_status.recommended_next_step).toBe("from-arg");
  });

  it("drops non-finite metric values from the error-report path", () => {
    const report = buildSanitizedForwardingReport({
      status: status(),
      errorReport: {
        latest_metrics: {
          captured_at: "2026-08-02T11:56:00.000Z",
          source: "live",
          vendor: "ecowitt",
          metrics: {
            temp_f: Number.NaN,
            humidity_percent: "55" as unknown as number,
            soil_moisture_pct: 40,
          },
        },
      },
      nowIso: NOW_ISO,
    });
    expect(report.latest_metrics.metrics).toEqual({ soil_moisture_pct: 40 });
  });
});

describe("serializeSanitizedForwardingReport", () => {
  it("pretty-prints JSON without secret material or write_action true", () => {
    const report = buildSanitizedForwardingReport({
      status: status({
        last_forward_error:
          "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc123def.ghi456jkl",
      }),
      nowIso: NOW_ISO,
    });
    const text = serializeSanitizedForwardingReport(report);
    const parsed = JSON.parse(text);

    expect(text).toContain('"report_type": "verdant_ecowitt_forwarding_debug_report"');
    expect(parsed.safety.write_action).toBe(false);
    expect(parsed.safety.secrets_included).toBe(false);
    expect(parsed.safety.raw_payload_included).toBe(false);
    expect(text).not.toMatch(/Bearer\s+eyJ/);
    expect(text).not.toContain("bridge_token");
    expect(text).not.toContain("vbt_");
    // No raw payload body object — only the safety flag name is allowed.
    expect(parsed).not.toHaveProperty("raw_payload");
    expect(parsed.bridge_status).not.toHaveProperty("raw_payload");
    expect(parsed.latest_metrics).not.toHaveProperty("raw_payload");
    // Stable indentation (2 spaces).
    expect(text).toMatch(/\n {2}"report_type"/);
  });
});
