import { describe, expect, it } from "vitest";
import {
  buildSensorIngestCurl,
  buildSensorIngestHistoryItem,
  buildSensorIngestTestPayload,
  diagnosticsExportToJson,
  diagnosticsExportToText,
} from "@/lib/sensorDiagnosticsExportRules";
import { classifySensorIngestTestResult } from "@/lib/sensorIngestTestResultRules";

const PLAINTEXT = "vbt_PLAINTEXT_DO_NOT_LEAK_abcdef1234";

const EXPORT_INPUT = {
  generated_at: "2026-06-06T18:00:00Z",
  supabase_url: "https://abc.supabase.co",
  ingest_url: "https://abc.supabase.co/functions/v1/sensor-ingest-webhook",
  tent_id: "tent-1",
  tent_name: "Veg Tent",
  token: {
    token_prefix: "vbt_AB12",
    name: "ecowitt-testbench",
    status: "active" as const,
    last_used_at: "2026-06-06T17:55:00Z",
    ingest_count: 42,
    expires_at: "2026-07-06T00:00:00Z",
  },
  env_match: [
    { key: "supabase_url" as const, ok: true, label: "App Supabase URL: https://abc.supabase.co" },
    { key: "ingest_url" as const, ok: true, label: "Ingest endpoint matches project" },
  ],
  latest_test_result: null,
};

describe("diagnostics export", () => {
  it("JSON includes Supabase URL, ingest URL, tent UUID, token prefix, last_used_at, ingest_count", () => {
    const json = diagnosticsExportToJson(EXPORT_INPUT);
    expect(json).toContain("https://abc.supabase.co");
    expect(json).toContain("sensor-ingest-webhook");
    expect(json).toContain("tent-1");
    expect(json).toContain("vbt_AB12");
    expect(json).toContain("2026-06-06T17:55:00Z");
    expect(json).toContain("42");
  });

  it("JSON excludes plaintext token even when polluted via cast", () => {
    const polluted = { ...EXPORT_INPUT, token: { ...EXPORT_INPUT.token, plaintext: PLAINTEXT } as any };
    const json = diagnosticsExportToJson(polluted);
    expect(json).not.toContain(PLAINTEXT);
    expect(json).not.toContain("plaintext");
  });

  it("text export excludes plaintext and includes env_match labels", () => {
    const text = diagnosticsExportToText(EXPORT_INPUT);
    expect(text).not.toContain(PLAINTEXT);
    expect(text).toContain("environment match:");
    expect(text).toContain("App Supabase URL");
    expect(text).toContain("vbt_AB12");
  });

  it("text export redacts any stray vbt_ token in body", () => {
    const text = diagnosticsExportToText({
      ...EXPORT_INPUT,
      latest_test_result: {
        attempted_at: "2026-06-06T18:00:00Z",
        http_status: 401,
        classification: "auth_problem",
        headline: "HTTP 401",
        body: { leaked: PLAINTEXT },
      },
    });
    expect(text).not.toContain(PLAINTEXT);
    expect(text).toContain("<redacted>");
  });
});

describe("buildSensorIngestCurl", () => {
  it("uses plaintext token when reveal is present", () => {
    const cmd = buildSensorIngestCurl({
      ingestUrl: "https://abc.supabase.co/functions/v1/sensor-ingest-webhook",
      tentId: "tent-1",
      bridgeTokenPlaintext: PLAINTEXT,
      idempotencyKey: "idem-1",
      capturedAtIso: "2026-06-06T18:00:00Z",
    });
    expect(cmd).toContain(`Authorization: Bearer ${PLAINTEXT}`);
    expect(cmd).toContain("Idempotency-Key: idem-1");
    expect(cmd).toContain('"tent_id":"tent-1"');
    expect(cmd).toContain('"source":"ecowitt"');
    expect(cmd).toContain('"vendor":"ecowitt_windows_testbench"');
    expect(cmd).toContain('"temp_f":77.4');
    expect(cmd).toContain('"device_id":"verdant-ui-ingest-test"');
  });

  it("uses placeholder when no reveal", () => {
    const cmd = buildSensorIngestCurl({
      ingestUrl: "https://abc.supabase.co/functions/v1/sensor-ingest-webhook",
      tentId: "tent-1",
      bridgeTokenPlaintext: null,
      idempotencyKey: "idem-1",
      capturedAtIso: "2026-06-06T18:00:00Z",
    });
    expect(cmd).not.toContain(PLAINTEXT);
    expect(cmd).toMatch(/Bearer <vbt_/);
  });
});

describe("buildSensorIngestTestPayload", () => {
  it("matches the operator-specified contract", () => {
    const p = buildSensorIngestTestPayload({ tentId: "t", capturedAtIso: "x" });
    expect(p.source).toBe("ecowitt");
    expect(p.vendor).toBe("ecowitt_windows_testbench");
    expect(p.metrics.temp_f).toBe(77.4);
    expect(p.metrics.soil_moisture_pct).toBe(33);
    expect(p.metrics.co2_ppm).toBe(721);
    expect(p.metadata.device_id).toBe("verdant-ui-ingest-test");
    expect(p.metadata.raw_payload.source).toBe("sensors_ui_test_button");
  });
});

describe("buildSensorIngestHistoryItem", () => {
  it("records timestamp, status, classification, and raw response body", () => {
    const classification = classifySensorIngestTestResult({
      status: 200,
      body: { ok: true, inserted: 1, skipped_duplicate: 0, rejected: [] },
    });
    const item = buildSensorIngestHistoryItem({
      attempted_at: "2026-06-06T18:00:00Z",
      request_url: "https://abc.supabase.co/functions/v1/sensor-ingest-webhook",
      idempotency_key: "idem-1",
      http_status: 200,
      body: { ok: true, inserted: 1, skipped_duplicate: 0, rejected: [] },
      classification,
    });
    expect(item.attempted_at).toBe("2026-06-06T18:00:00Z");
    expect(item.http_status).toBe(200);
    expect(item.classification).toBe("accepted");
    expect(item.inserted).toBe(1);
    expect(item.skipped_duplicate).toBe(0);
    expect(item.rejected_count).toBe(0);
    expect(item.body).toEqual({ ok: true, inserted: 1, skipped_duplicate: 0, rejected: [] });
  });

  it("does not store Authorization or plaintext token", () => {
    const classification = classifySensorIngestTestResult({ status: 401, body: {} });
    const item = buildSensorIngestHistoryItem({
      attempted_at: "2026-06-06T18:00:00Z",
      request_url: "https://abc.supabase.co/functions/v1/sensor-ingest-webhook",
      idempotency_key: "idem-1",
      http_status: 401,
      body: {},
      classification,
    });
    const serialized = JSON.stringify(item);
    expect(serialized).not.toMatch(/authorization/i);
    expect(serialized).not.toContain(PLAINTEXT);
  });
});
