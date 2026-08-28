import { describe, expect, it } from "vitest";
import {
  buildSensorIngestCurl,
  buildSensorIngestHistoryItem,
  buildSensorIngestTestPayload,
  buildSafeResponseInspector,
  diagnosticsExportToJson,
  diagnosticsExportToText,
  redactedResponseBodyJson,
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
    const polluted = {
      ...EXPORT_INPUT,
      token: { ...EXPORT_INPUT.token, plaintext: PLAINTEXT } as any,
    };
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

// ---------------------------------------------------------------------------
// Fail-closed body redaction (recorded #1163 leftover).
//
// The module's `redactTokens` pass only ever matched the `vbt_` prefix, so a
// server response body echoing any OTHER secret shape — MAC, UUID, long hex,
// `sk-` key, env NAME=value pair, JWT, Bearer header — was exported verbatim.
// The envelope (tent identity, endpoints, token PREFIX) is deliberately NOT
// scrubbed by this class: it is the diagnostic payload growers are asked to
// share, and the fences below pin that it survives.
// ---------------------------------------------------------------------------

const BODY_SECRETS = {
  mac: "AA:BB:CC:DD:EE:FF",
  bareMac: "AABBCCDDEEFF",
  uuid: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
  hex64: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2",
  skKey: "sk-ABCDEFGHIJKLMNOPQRSTUV",
  envValue: "hunter2hunter2",
  jwt: "eyJhbGciOi.eyJzdWIiOi.SflKxwRJSM",
  bearer: "Bearer abcdef123456",
};

const SECRET_BODY = {
  device: BODY_SECRETS.mac,
  station: BODY_SECRETS.bareMac,
  row_id: BODY_SECRETS.uuid,
  digest: BODY_SECRETS.hex64,
  provider_key: BODY_SECRETS.skKey,
  env_line: `SUPABASE_SERVICE_ROLE_KEY="${BODY_SECRETS.envValue}"`,
  jwt: BODY_SECRETS.jwt,
  header: BODY_SECRETS.bearer,
};

function withBody(body: unknown) {
  return {
    ...EXPORT_INPUT,
    latest_test_result: {
      attempted_at: "2026-06-06T18:00:00Z",
      http_status: 200,
      classification: "ok" as const,
      headline: "HTTP 200",
      body,
    },
  };
}

function expectNoSecrets(out: string) {
  for (const [name, value] of Object.entries(BODY_SECRETS)) {
    expect(out, `leaked ${name}`).not.toContain(value);
  }
}

describe("fail-closed export body redaction", () => {
  it("JSON export scrubs every secret-value shape from the response body", () => {
    expectNoSecrets(diagnosticsExportToJson(withBody(SECRET_BODY)));
  });

  it("text export scrubs every secret-value shape from the response body", () => {
    expectNoSecrets(diagnosticsExportToText(withBody(SECRET_BODY)));
  });

  it("scrubs secrets nested deep inside the response body", () => {
    const nested = { a: { b: { c: [{ d: BODY_SECRETS.mac }, BODY_SECRETS.uuid] } } };
    expectNoSecrets(diagnosticsExportToJson(withBody(nested)));
  });

  it("scrubs secrets in a non-JSON (plain string) response body", () => {
    const text = `device ${BODY_SECRETS.mac} row ${BODY_SECRETS.uuid} key ${BODY_SECRETS.skKey}`;
    expectNoSecrets(diagnosticsExportToJson(withBody(text)));
  });

  it("redactedResponseBodyJson scrubs every secret-value shape", () => {
    expectNoSecrets(redactedResponseBodyJson(SECRET_BODY));
  });

  it("safe response inspector scrubs secrets in string previews", () => {
    const inspector = buildSafeResponseInspector({
      status: 200,
      classification: "ok",
      body: SECRET_BODY,
    });
    expectNoSecrets(JSON.stringify(inspector));
  });

  it("safe response inspector scrubs secrets in a plain-string body", () => {
    const inspector = buildSafeResponseInspector({
      status: 200,
      classification: "ok",
      body: `mac=${BODY_SECRETS.mac} uuid=${BODY_SECRETS.uuid}`,
    });
    expectNoSecrets(JSON.stringify(inspector));
  });

  it("keeps the diagnostic envelope readable — redaction is body-scoped", () => {
    const json = diagnosticsExportToJson(withBody(SECRET_BODY));
    expect(json).toContain("https://abc.supabase.co");
    expect(json).toContain("sensor-ingest-webhook");
    expect(json).toContain("tent-1");
    expect(json).toContain("vbt_AB12");
  });

  it("a circular body stays unusable — no throw, no clean dump", () => {
    const circular: Record<string, unknown> = { device: BODY_SECRETS.mac };
    circular.self = circular;
    let json = "";
    expect(() => {
      json = diagnosticsExportToJson(withBody(circular));
    }).not.toThrow();
    expectNoSecrets(json);
    expect(json).toContain("unavailable");
  });

  it("an unserializable (BigInt) body stays unusable — no throw", () => {
    let json = "";
    expect(() => {
      json = diagnosticsExportToJson(withBody({ n: BigInt(1), device: BODY_SECRETS.mac }));
    }).not.toThrow();
    expectNoSecrets(json);
  });

  it("a missing body never becomes a clean dump", () => {
    expect(() => diagnosticsExportToJson(withBody(undefined))).not.toThrow();
    expect(redactedResponseBodyJson(undefined)).toBe("null");
  });
});
