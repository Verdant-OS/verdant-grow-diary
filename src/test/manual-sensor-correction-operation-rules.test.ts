import { describe, expect, it } from "vitest";
import { buildManualCorrectionOperation } from "@/lib/manualSensorCorrectionOperationRules";
import type { ManualCorrectionContext } from "@/lib/manualSensorCorrectionContext";
import type { ManualReadingMetric } from "@/lib/sensorReadingManualEntryRules";

const operationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const tentId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const tempId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const humidityId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const observedAt = "2026-09-16T08:00:00.123456+00:00";
function context(): ManualCorrectionContext {
  return {
    tentId,
    originalCapturedAt: observedAt,
    originalReadingIds: { temperature_c: tempId, humidity_pct: humidityId },
    originalValues: { temperature_c: 25, humidity_pct: 55 },
  };
}
function build(
  correction = context(),
  metrics: readonly ManualReadingMetric[] = [
    { metric: "temperature_c", value: 24 },
    { metric: "humidity_pct", value: 60 },
  ],
) {
  return buildManualCorrectionOperation({ operationId, correction, metrics });
}

describe("manual correction operation identity and observation contract", () => {
  it("preserves the historical observation timestamp including database precision", () => {
    const result = build();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.operation.observedAt).toBe(observedAt);
    expect(result.operation.source).toBe("manual");
    expect(result.operation.operationId).toBe(operationId);
    expect(result.operation.tentId).toBe(tentId);
    expect(result.operation.changes).toEqual([
      { metric: "humidity_pct", originalReadingId: humidityId, expectedValue: 55, value: 60 },
      { metric: "temperature_c", originalReadingId: tempId, expectedValue: 25, value: 24 },
    ]);
  });

  it("produces the identical retry operation for reordered metric inputs", () => {
    const metrics: ManualReadingMetric[] = [
      { metric: "temperature_c", value: 24 },
      { metric: "humidity_pct", value: 60 },
    ];
    expect(build(context(), metrics).ok).toBe(true);
    expect(build(context(), metrics)).toEqual(build(context(), [...metrics].reverse()));
    expect(JSON.stringify(build(context(), metrics))).toBe(
      JSON.stringify(build(context(), metrics)),
    );
  });

  it("copies its input so later form edits cannot mutate a claimed operation", () => {
    const original = context();
    const metrics: ManualReadingMetric[] = [{ metric: "temperature_c", value: 24 }];
    const result = build(original, metrics);
    expect(result.ok).toBe(true);
    const before = JSON.stringify(result);
    original.originalValues.temperature_c = 30;
    original.originalReadingIds.temperature_c = humidityId;
    metrics[0].value = 29;
    expect(JSON.stringify(result)).toBe(before);
  });

  it("does not create replacement observations for unchanged metrics", () => {
    const result = build(context(), [
      { metric: "temperature_c", value: 25 },
      { metric: "humidity_pct", value: 60 },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.operation.changes).toHaveLength(1);
    expect(result.operation.changes[0].metric).toBe("humidity_pct");
    expect(result.operation.originals).toHaveLength(2);
  });

  it("retains an explicit addition without inventing an original reading ID", () => {
    const result = build(context(), [{ metric: "soil_moisture_pct", value: 35 }]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.operation.changes).toEqual([
      { metric: "soil_moisture_pct", originalReadingId: null, expectedValue: null, value: 35 },
    ]);
    expect(result.operation.observedAt).toBe(observedAt);
    expect(result.operation.originals).toHaveLength(2);
  });

  it("ignores extra URL-context fields rather than carrying credentials or changing provenance", () => {
    const original = {
      ...context(),
      user_id: "untrusted",
      raw_payload: { token: "fixture" },
      source: "live",
    };
    const result = build(original);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.operation.source).toBe("manual");
    expect(JSON.stringify(result)).not.toMatch(/untrusted|raw_payload|fixture|live/);
  });

  it.each([null, undefined])("rejects a missing operation input: %s", (input) => {
    expect(buildManualCorrectionOperation(input)).toEqual({
      ok: false,
      reason: "invalid_identity",
    });
  });

  it("rejects an invalid supplied operation identity", () => {
    expect(
      buildManualCorrectionOperation({
        operationId: "new-on-every-retry",
        correction: context(),
        metrics: [],
      }),
    ).toEqual({ ok: false, reason: "invalid_identity" });
  });

  it.each(["", "not-a-date", "2026-02-30T08:00:00Z", "2026-09-16"])(
    "rejects an invalid or ambiguous observation time: %s",
    (time) => {
      expect(build({ ...context(), originalCapturedAt: time })).toEqual({
        ok: false,
        reason: "invalid_observation",
      });
    },
  );

  it("rejects a missing tent", () => {
    expect(build({ ...context(), tentId: "" })).toEqual({ ok: false, reason: "invalid_identity" });
  });

  it("rejects correction without an original anchor", () => {
    expect(build({ ...context(), originalReadingIds: {}, originalValues: {} })).toEqual({
      ok: false,
      reason: "invalid_originals",
    });
  });

  it("rejects a supplied old value with no corresponding reading reference", () => {
    const original = context();
    delete original.originalReadingIds.temperature_c;
    expect(build(original)).toEqual({ ok: false, reason: "invalid_originals" });
  });

  it("rejects an original ID with no expected value", () => {
    const original = context();
    delete original.originalValues.temperature_c;
    expect(build(original)).toEqual({ ok: false, reason: "invalid_originals" });
  });

  it("rejects two metrics claiming the same original ID", () => {
    const original = context();
    original.originalReadingIds.humidity_pct = tempId;
    expect(build(original)).toEqual({ ok: false, reason: "invalid_originals" });
  });

  it.each([NaN, Infinity, -Infinity])("rejects non-finite metric value %s", (value) => {
    expect(build(context(), [{ metric: "temperature_c", value }])).toEqual({
      ok: false,
      reason: "invalid_metrics",
    });
  });

  it("rejects repeated metrics instead of picking an arbitrary winner", () => {
    expect(
      build(context(), [
        { metric: "temperature_c", value: 24 },
        { metric: "temperature_c", value: 26 },
      ]),
    ).toEqual({ ok: false, reason: "invalid_metrics" });
  });

  it("rejects unknown metrics rather than including unrecognized evidence", () => {
    expect(
      build(context(), [{ metric: "unknown" as ManualReadingMetric["metric"], value: 2 }]),
    ).toEqual({ ok: false, reason: "invalid_metrics" });
  });

  it("rejects derived metrics rather than relabeling them as entered manual evidence", () => {
    expect(build(context(), [{ metric: "vpd_kpa", value: 1.2, derived: true }])).toEqual({
      ok: false,
      reason: "invalid_metrics",
    });
  });

  it.each<{ metrics: ManualReadingMetric[] }>([
    { metrics: [] },
    { metrics: [{ metric: "temperature_c", value: 25 }] },
  ])("rejects a no-op submission", ({ metrics }) => {
    expect(build(context(), metrics)).toEqual({ ok: false, reason: "no_changes" });
  });
});
