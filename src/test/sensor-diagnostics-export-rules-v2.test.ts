import { describe, expect, it } from "vitest";
import {
  buildDownloadFilename,
  buildHistoryExport,
  buildPowerShellIngestTestScript,
  buildRedactedPayloadPreview,
  buildSensorIngestHistoryItem,
  buildSensorIngestTestPayload,
  historyExportToJson,
} from "@/lib/sensorDiagnosticsExportRules";
import { classifySensorIngestTestResult } from "@/lib/sensorIngestTestResultRules";

const PLAINTEXT = "vbt_PLAINTEXT_DO_NOT_LEAK_abcdef1234";
const ENDPOINT = "https://abc.supabase.co/functions/v1/sensor-ingest-webhook";

describe("buildRedactedPayloadPreview", () => {
  it("pretty-prints the canonical payload", () => {
    const payload = buildSensorIngestTestPayload({
      tentId: "tent-1",
      capturedAtIso: "2026-06-06T18:00:00Z",
    });
    const out = buildRedactedPayloadPreview(payload);
    expect(out).toContain('"tent_id": "tent-1"');
    expect(out).toContain('"vendor": "ecowitt_windows_testbench"');
    expect(out).toContain('"temp_f": 77.4');
    expect(out).not.toMatch(/authorization/i);
  });

  it("redacts any stray vbt_ token defensively", () => {
    const out = buildRedactedPayloadPreview({ leaked: PLAINTEXT, ok: true });
    expect(out).not.toContain(PLAINTEXT);
    expect(out).toContain("<redacted>");
  });
});

describe("buildPowerShellIngestTestScript", () => {
  it("uses real token when reveal is present and includes canonical payload + idempotency key", () => {
    const cmd = buildPowerShellIngestTestScript({
      ingestUrl: ENDPOINT,
      tentId: "tent-1",
      bridgeTokenPlaintext: PLAINTEXT,
      idempotencyKey: "idem-ps-1",
      capturedAtIso: "2026-06-06T18:00:00Z",
    });
    expect(cmd).toContain("Invoke-RestMethod");
    expect(cmd).toContain(`Bearer ${PLAINTEXT}`);
    expect(cmd).toContain("Idempotency-Key");
    expect(cmd).toContain("idem-ps-1");
    expect(cmd).toContain(ENDPOINT);
    expect(cmd).toContain('"tent_id": "tent-1"');
    expect(cmd).toContain('"vendor": "ecowitt_windows_testbench"');
    expect(cmd).toContain('"temp_f": 77.4');
    expect(cmd).toContain("$headers = @{");
    expect(cmd).toContain("$body = @'");
  });

  it("uses placeholder when reveal is absent", () => {
    const cmd = buildPowerShellIngestTestScript({
      ingestUrl: ENDPOINT,
      tentId: "tent-1",
      bridgeTokenPlaintext: null,
      idempotencyKey: "idem-ps-1",
      capturedAtIso: "2026-06-06T18:00:00Z",
    });
    expect(cmd).not.toContain(PLAINTEXT);
    expect(cmd).toContain("Bearer <vbt_");
  });
});

describe("history export", () => {
  function makeItem(status: number) {
    const classification = classifySensorIngestTestResult({
      status,
      body: { ok: status === 200, inserted: 1, skipped_duplicate: 0, rejected: [] },
    });
    return buildSensorIngestHistoryItem({
      attempted_at: "2026-06-06T18:00:00Z",
      request_url: ENDPOINT,
      idempotency_key: "idem-h-1",
      http_status: status,
      body: { ok: status === 200, inserted: 1, leaked: PLAINTEXT },
      classification,
    });
  }

  it("includes generated_at, tent identity, endpoint, and items", () => {
    const exp = buildHistoryExport({
      generated_at: "2026-06-06T18:00:00Z",
      tent_id: "tent-1",
      tent_name: "Veg",
      ingest_url: ENDPOINT,
      items: [makeItem(200), makeItem(401)],
    });
    expect(exp.generated_at).toBe("2026-06-06T18:00:00Z");
    expect(exp.tent_id).toBe("tent-1");
    expect(exp.ingest_url).toBe(ENDPOINT);
    expect(exp.items).toHaveLength(2);
    expect(exp.items[0].http_status).toBe(200);
  });

  it("JSON export contains raw body fields and redacts stray plaintext tokens", () => {
    const json = historyExportToJson({
      generated_at: "2026-06-06T18:00:00Z",
      tent_id: "tent-1",
      tent_name: "Veg",
      ingest_url: ENDPOINT,
      items: [makeItem(200)],
    });
    expect(json).toContain('"http_status": 200');
    expect(json).toContain('"idempotency_key"');
    expect(json).toContain('"body"');
    expect(json).not.toContain(PLAINTEXT);
    expect(json).not.toMatch(/authorization/i);
  });
});

describe("buildDownloadFilename", () => {
  it("produces deterministic UTC-timestamped names", () => {
    const d = new Date(Date.UTC(2026, 5, 6, 18, 0, 0));
    expect(buildDownloadFilename("verdant-sensor-diagnostics", "json", d)).toBe(
      "verdant-sensor-diagnostics-20260606-180000.json",
    );
    expect(buildDownloadFilename("verdant-sensor-diagnostics", "txt", d)).toBe(
      "verdant-sensor-diagnostics-20260606-180000.txt",
    );
  });

  it("strips unsafe characters from the prefix", () => {
    const d = new Date(Date.UTC(2026, 0, 1, 0, 0, 0));
    expect(buildDownloadFilename("hack/../etc passwd", "json", d)).toBe(
      "hack-etc-passwd-20260101-000000.json",
    );
  });
});

// ---------------------------------------------------------------------------
// Fail-closed body redaction (recorded #1163 leftover) — payload preview and
// run-history bodies. Same secret-value class as the other export/redact
// paths; the `vbt_`-prefix-only pass let every other shape through.
// ---------------------------------------------------------------------------

const V2_SECRETS = {
  mac: "AA:BB:CC:DD:EE:FF",
  uuid: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
  hex64: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2",
  skKey: "sk-ABCDEFGHIJKLMNOPQRSTUV",
  envValue: "hunter2hunter2",
};

const V2_BODY = {
  device: V2_SECRETS.mac,
  row_id: V2_SECRETS.uuid,
  digest: V2_SECRETS.hex64,
  provider_key: V2_SECRETS.skKey,
  env_line: `SUPABASE_SERVICE_ROLE_KEY="${V2_SECRETS.envValue}"`,
};

function expectNoV2Secrets(out: string) {
  for (const [name, value] of Object.entries(V2_SECRETS)) {
    expect(out, `leaked ${name}`).not.toContain(value);
  }
}

describe("fail-closed payload preview and history body redaction", () => {
  it("payload preview scrubs every secret-value shape", () => {
    expectNoV2Secrets(buildRedactedPayloadPreview(V2_BODY));
  });

  it("payload preview survives a circular payload without throwing", () => {
    const circular: Record<string, unknown> = { device: V2_SECRETS.mac };
    circular.self = circular;
    let out = "";
    expect(() => {
      out = buildRedactedPayloadPreview(circular);
    }).not.toThrow();
    expectNoV2Secrets(out);
  });

  it("payload preview survives an undefined payload without throwing", () => {
    expect(() => buildRedactedPayloadPreview(undefined)).not.toThrow();
  });

  it("history JSON export scrubs secrets in item bodies", () => {
    const json = historyExportToJson({
      generated_at: "2026-06-06T18:00:00Z",
      tent_id: "tent-1",
      tent_name: "Veg",
      ingest_url: ENDPOINT,
      items: [
        buildSensorIngestHistoryItem({
          attempted_at: "2026-06-06T18:00:00Z",
          request_url: ENDPOINT,
          idempotency_key: "idem-1",
          http_status: 200,
          body: V2_BODY,
          classification: classifySensorIngestTestResult({ status: 200, body: V2_BODY }),
        }),
      ],
    });
    expectNoV2Secrets(json);
    expect(json).toContain('"http_status": 200');
    expect(json).toContain("tent-1");
  });
});
