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
