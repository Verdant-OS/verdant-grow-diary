import { describe, expect, it } from "vitest";
import {
  buildCanonicalSensorIngestUrl,
  buildNetworkDiagnosticsDownloadFilename,
  buildNetworkDiagnosticsExportJson,
  buildSensorDiagnosticsRunHistoryEntry,
  buildSensorDiagnosticsRunHistoryFilename,
  buildSensorIngestNetworkDiagnostics,
  buildSensorIngestVerifyCommands,
  sensorDiagnosticsRunHistoryToJson,
  trimSensorDiagnosticsRunHistory,
  VERIFY_COMMANDS_TOKEN_PLACEHOLDER,
  SENSOR_DIAGNOSTICS_RUN_HISTORY_MAX,
  type SensorDiagnosticsRunHistoryEntry,
} from "@/lib/sensorDiagnosticsExportRules";

const PLAINTEXT = "vbt_DO_NOT_LEAK_abcdef1234567890";
const SB = "https://abc.supabase.co";
const CANONICAL = "https://abc.supabase.co/functions/v1/sensor-ingest-webhook";
const APP = "https://app.verdant.example";

function mkDiag(over: { mismatch?: boolean; networkFail?: boolean } = {}) {
  return buildSensorIngestNetworkDiagnostics({
    ingestUrl: over.mismatch
      ? "https://other.supabase.co/functions/v1/sensor-ingest-webhook"
      : CANONICAL,
    appOrigin: APP,
    httpStatus: over.networkFail ? 0 : 200,
    classification: over.networkFail ? "network_error" : "accepted",
    supabaseUrl: SB,
    errorMessage: over.networkFail ? `Failed to fetch ${PLAINTEXT}` : null,
    hasActiveToken: true,
  });
}

// ---------------------------------------------------------------------------
// Diagnostics JSON export
// ---------------------------------------------------------------------------
describe("buildNetworkDiagnosticsExportJson", () => {
  it("includes canonical URL match and CORS observations", () => {
    const diag = mkDiag({ networkFail: true });
    const json = buildNetworkDiagnosticsExportJson({
      generatedAt: "2026-06-06T18:00:00Z",
      diagnostics: diag,
      lastTestResult: { http_status: 0, classification: "network_error" },
    });
    const parsed = JSON.parse(json);
    expect(parsed.generated_at).toBe("2026-06-06T18:00:00Z");
    expect(parsed.browser_origin).toBe(APP);
    expect(parsed.configured_ingest_url).toBe(CANONICAL);
    expect(parsed.expected_canonical_url).toBe(CANONICAL);
    expect(parsed.canonical_url_match).toBe("matches");
    expect(parsed.diagnostics_status).toBe("likely_cors_or_preflight");
    expect(Array.isArray(parsed.evidence)).toBe(true);
    expect(Array.isArray(parsed.recommended_checks)).toBe(true);
    expect(parsed.cors.options_headers).toBe("missing");
    expect(parsed.cors.post_headers).toBe("unknown");
    expect(parsed.cors.explanation).toMatch(/Browser blocked the response/);
    expect(parsed.last_test_result).toEqual({
      http_status: 0,
      classification: "network_error",
    });
  });

  it("excludes token, authorization, service_role, api_key, secret values", () => {
    const diag = mkDiag({ networkFail: true });
    const json = buildNetworkDiagnosticsExportJson({
      generatedAt: "2026-06-06T18:00:00Z",
      diagnostics: diag,
      lastTestResult: null,
    });
    expect(json).not.toContain(PLAINTEXT);
    expect(json).not.toMatch(/authorization/i);
    expect(json).not.toMatch(/service_role/i);
    expect(json).not.toMatch(/api[_-]?key/i);
    expect(json).not.toMatch(/anon[_-]?key/i);
    expect(json).not.toMatch(/password/i);
    expect(json).not.toMatch(/secret/i);
    expect(json).not.toMatch(/raw_payload/);
  });

  it("filename follows verdant-sensor-network-diagnostics-<timestamp>.json pattern", () => {
    const name = buildNetworkDiagnosticsDownloadFilename(
      new Date("2026-06-06T18:05:09Z"),
    );
    expect(name).toBe("verdant-sensor-network-diagnostics-20260606-180509.json");
  });
});

// ---------------------------------------------------------------------------
// Verify commands
// ---------------------------------------------------------------------------
describe("buildSensorIngestVerifyCommands", () => {
  it("OPTIONS command uses canonical ingest URL and required preflight headers", () => {
    const v = buildSensorIngestVerifyCommands({
      ingestUrl: CANONICAL,
      appOrigin: APP,
    });
    expect(v.available).toBe(true);
    expect(v.options).toContain(`'${CANONICAL}'`);
    expect(v.options).toMatch(/-X OPTIONS/);
    expect(v.options).toContain(`Origin: ${APP}`);
    expect(v.options).toContain("Access-Control-Request-Method: POST");
    expect(v.options).toContain(
      "Access-Control-Request-Headers: authorization, x-client-info, apikey, content-type",
    );
  });

  it("POST command uses placeholder token only and never a real token", () => {
    const v = buildSensorIngestVerifyCommands({
      ingestUrl: CANONICAL,
      appOrigin: APP,
    });
    expect(v.post).toContain(`Bearer ${VERIFY_COMMANDS_TOKEN_PLACEHOLDER}`);
    expect(v.post).not.toContain(PLAINTEXT);
    expect(v.post).toMatch(/-X POST/);
    expect(v.post).toContain(`'${CANONICAL}'`);
    expect(v.post).toContain('"tent_id":"<TENT_ID>"');
  });

  it("note warns operators not to paste real tokens", () => {
    const v = buildSensorIngestVerifyCommands({
      ingestUrl: CANONICAL,
      appOrigin: APP,
    });
    expect(v.note).toMatch(/Do not paste real tokens/i);
  });

  it("returns available=false when canonical URL is unavailable", () => {
    const v = buildSensorIngestVerifyCommands({
      ingestUrl: null,
      appOrigin: APP,
    });
    expect(v.available).toBe(false);
    expect(v.options).toBe("");
    expect(v.post).toBe("");
  });

  it("does not embed real bridge token even if poisoned input is passed", () => {
    const v = buildSensorIngestVerifyCommands({
      ingestUrl: `${CANONICAL}?leak=${PLAINTEXT}`,
      appOrigin: APP,
    });
    expect(v.options).not.toContain(PLAINTEXT);
    expect(v.post).not.toContain(PLAINTEXT);
    expect(v.options).toContain("<redacted>");
  });

  it("derives canonical URL from supabase URL via buildCanonicalSensorIngestUrl", () => {
    const url = buildCanonicalSensorIngestUrl(SB);
    expect(url).toBe(CANONICAL);
    const v = buildSensorIngestVerifyCommands({
      ingestUrl: url,
      appOrigin: APP,
    });
    expect(v.options).toContain(CANONICAL);
  });
});

// ---------------------------------------------------------------------------
// Run history
// ---------------------------------------------------------------------------
describe("sensor diagnostics run history", () => {
  it("entry captures timestamp/status/classification/canonical match/CORS state", () => {
    const diag = mkDiag({ networkFail: true });
    const entry = buildSensorDiagnosticsRunHistoryEntry({
      attemptedAt: "2026-06-06T18:00:00Z",
      httpStatus: 0,
      classification: "network_error",
      diagnostics: diag,
    });
    expect(entry).toEqual({
      attempted_at: "2026-06-06T18:00:00Z",
      http_status: 0,
      classification: "network_error",
      canonical_url_match: "matches",
      diagnostics_status: "likely_cors_or_preflight",
      cors_options: "missing",
      cors_post: "unknown",
    });
  });

  it("trims to last 10 entries by default (newest-first input preserved)", () => {
    const mk = (i: number): SensorDiagnosticsRunHistoryEntry => ({
      attempted_at: `2026-06-06T18:00:${String(i).padStart(2, "0")}Z`,
      http_status: 200,
      classification: "accepted",
      canonical_url_match: "matches",
      diagnostics_status: "not_applicable",
      cors_options: "unknown",
      cors_post: "unknown",
    });
    const input = Array.from({ length: 15 }, (_, i) => mk(15 - i));
    const trimmed = trimSensorDiagnosticsRunHistory(input);
    expect(trimmed).toHaveLength(SENSOR_DIAGNOSTICS_RUN_HISTORY_MAX);
    expect(trimmed[0].attempted_at).toBe(input[0].attempted_at);
    expect(trimmed[9].attempted_at).toBe(input[9].attempted_at);
  });

  it("clear-history is just an empty array — trim handles []", () => {
    expect(trimSensorDiagnosticsRunHistory([])).toEqual([]);
  });

  it("history JSON export is redacted and excludes tokens/secrets", () => {
    const diag = mkDiag({ networkFail: true });
    const entry = buildSensorDiagnosticsRunHistoryEntry({
      attemptedAt: "2026-06-06T18:00:00Z",
      httpStatus: 0,
      classification: "network_error",
      diagnostics: diag,
    });
    const json = sensorDiagnosticsRunHistoryToJson(
      [entry],
      "2026-06-06T18:00:00Z",
    );
    expect(json).not.toContain(PLAINTEXT);
    expect(json).not.toMatch(/authorization/i);
    expect(json).not.toMatch(/service_role/i);
    const parsed = JSON.parse(json);
    expect(parsed.count).toBe(1);
    expect(parsed.entries[0].diagnostics_status).toBe(
      "likely_cors_or_preflight",
    );
  });

  it("history filename follows expected pattern", () => {
    expect(
      buildSensorDiagnosticsRunHistoryFilename(new Date("2026-06-06T18:05:09Z")),
    ).toBe("verdant-sensor-network-diagnostics-history-20260606-180509.json");
  });
});
