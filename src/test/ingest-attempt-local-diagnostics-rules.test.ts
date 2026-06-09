/**
 * ingestAttemptLocalDiagnosticsRules — import / aggregate / persist.
 */
import { describe, expect, it } from "vitest";
import {
  importRunnerReport,
  summarizeAttempts,
  persistAttempts,
  readAttemptsFromStorage,
  LOCAL_DIAGNOSTICS_STORAGE_KEY,
  type LocalIngestAttempt,
} from "@/lib/ingestAttemptLocalDiagnosticsRules";

const VALID_RUNNER_REPORT = JSON.stringify({
  status: "dry_run",
  classification: "dry_run",
  http_status: null,
  reasons: [],
  url: "https://example/functions/v1/sensor-ingest-webhook",
  tent_id: "00000000-0000-4000-8000-000000000000",
  plant_id: null,
  metric_keys: ["temp_f", "humidity_pct"],
  auth: "Bearer vbt_…(redacted, len=20)",
  transport: "mqtt_local_bridge",
  topic: "ecowitt/grow",
  note: "Nothing was stored",
});

describe("importRunnerReport", () => {
  it("imports a valid redacted runner report", () => {
    const r = importRunnerReport(VALID_RUNNER_REPORT);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.attempt.status).toBe("dry_run");
      expect(r.attempt.metricKeys).toEqual(["temp_f", "humidity_pct"]);
      expect(r.attempt.authPreview).toMatch(/redacted/);
    }
  });

  it("rejects malformed JSON", () => {
    const r = importRunnerReport("{not json");
    expect(r.ok).toBe(false);
    if (r.ok !== true) expect((r as { reason: string }).reason).toBe("invalid_json");
  });

  it("rejects invalid shape", () => {
    const r = importRunnerReport(JSON.stringify({ foo: "bar" }));
    expect(r.ok).toBe(false);
    if (r.ok !== true) expect((r as { reason: string }).reason).toBe("invalid_shape");
  });

  it("blocks report containing token-shaped values outside auth field", () => {
    const bad = JSON.stringify({
      status: "accepted",
      classification: "accepted",
      url: "https://x",
      reasons: [],
      note: "leaked vbt_ABCDEFGHIJK123456",
      auth: "Bearer vbt_…(redacted)",
    });
    const r = importRunnerReport(bad);
    expect(r.ok).toBe(false);
    if (r.ok !== true)
      expect((r as { reason: string }).reason).toBe("token_leak_blocked");
  });
});

describe("summarizeAttempts", () => {
  function mk(
    status: LocalIngestAttempt["status"],
    classification: LocalIngestAttempt["classification"],
    reasons: LocalIngestAttempt["reasons"] = [],
  ): LocalIngestAttempt {
    return {
      importedAt: new Date().toISOString(),
      status,
      classification,
      httpStatus: null,
      reasons,
      url: null,
      tentId: null,
      plantId: null,
      metricKeys: [],
      authPreview: "Bearer (none)",
      transport: "mqtt_local_bridge",
      topic: "ecowitt/grow",
    };
  }

  it("counts statuses", () => {
    const s = summarizeAttempts([
      mk("accepted", "accepted"),
      mk("rejected", "stale_reading", ["stale_timestamp"]),
      mk("dry_run", "dry_run"),
      mk("dry_run", "dry_run"),
      mk("network_error", "network_error", ["network_unreachable"]),
    ]);
    expect(s.total).toBe(5);
    expect(s.accepted).toBe(1);
    expect(s.rejected).toBe(1);
    expect(s.dryRun).toBe(2);
    expect(s.networkError).toBe(1);
  });

  it("derives last classification + provider from newest attempt", () => {
    const s = summarizeAttempts([
      mk("rejected", "stale_reading", ["stale_timestamp"]),
      mk("accepted", "accepted"),
    ]);
    expect(s.lastClassification).toBe("stale_reading");
    expect(s.lastRejectionReason).toBe("stale_timestamp");
    expect(s.lastProvider).toBe("ecowitt");
  });

  it("empty list returns zeros and nulls", () => {
    const s = summarizeAttempts([]);
    expect(s.total).toBe(0);
    expect(s.latest).toBeNull();
    expect(s.lastClassification).toBeNull();
  });
});

describe("persistAttempts / readAttemptsFromStorage", () => {
  it("round-trips attempts through fake storage", () => {
    const store = new Map<string, string>();
    const fakeStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
    };
    const r = importRunnerReport(VALID_RUNNER_REPORT);
    if (!r.ok) throw new Error("expected valid");
    persistAttempts(fakeStorage, [r.attempt]);
    expect(store.get(LOCAL_DIAGNOSTICS_STORAGE_KEY)).toBeTruthy();
    const back = readAttemptsFromStorage(fakeStorage);
    expect(back.length).toBe(1);
    expect(back[0].status).toBe("dry_run");
  });

  it("does not crash on null storage", () => {
    expect(readAttemptsFromStorage(null)).toEqual([]);
    expect(() => persistAttempts(null, [])).not.toThrow();
  });
});
