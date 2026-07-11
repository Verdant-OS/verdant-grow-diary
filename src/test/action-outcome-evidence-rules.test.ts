/**
 * Post-Action Outcome Analysis — sensor + diary evidence normalization.
 * Source doctrine: demo/stale/invalid/unknown never usable; manual stays
 * manual; csv stays csv; anomalies flagged; dedupe deterministic.
 */
import { describe, it, expect } from "vitest";
import {
  dedupeOutcomeMetrics,
  normalizeDiaryEvidence,
  normalizeSensorEvidence,
  type RawSensorReadingRow,
} from "@/lib/actionOutcomeEvidenceRules";

const ANALYSIS = "2026-07-11T12:00:00.000Z";
const TENT = "tent-1";

function row(overrides: Partial<RawSensorReadingRow> = {}): RawSensorReadingRow {
  return {
    tent_id: TENT,
    metric: "temperature_c",
    value: 25,
    captured_at: "2026-07-10T10:00:00.000Z",
    source: "live",
    quality: "ok",
    ...overrides,
  };
}

function normalize(rows: RawSensorReadingRow[]) {
  return normalizeSensorEvidence({ rows, actionTentId: TENT, analysisAt: ANALYSIS });
}

describe("sensor source doctrine", () => {
  it("valid live evidence is usable", () => {
    const r = normalize([row()]);
    expect(r.metrics).toHaveLength(1);
    expect(r.metrics[0].source).toBe("live");
  });

  it("valid manual evidence is usable and REMAINS manual", () => {
    const r = normalize([row({ source: "manual" })]);
    expect(r.metrics).toHaveLength(1);
    expect(r.metrics[0].source).toBe("manual");
  });

  it("valid csv evidence is usable and REMAINS csv (never relabeled live)", () => {
    const r = normalize([row({ source: "csv" })]);
    expect(r.metrics).toHaveLength(1);
    expect(r.metrics[0].source).toBe("csv");
  });

  it("demo evidence is unusable", () => {
    const r = normalize([row({ source: "demo" })]);
    expect(r.metrics).toHaveLength(0);
    expect(r.rejections[0].reason).toBe("unusable_source");
  });

  it("stale evidence is unusable", () => {
    const r = normalize([row({ source: "stale" })]);
    expect(r.metrics).toHaveLength(0);
  });

  it("invalid evidence is unusable", () => {
    const r = normalize([row({ source: "invalid" })]);
    expect(r.metrics).toHaveLength(0);
  });

  it("unknown source is unusable (fail closed)", () => {
    const r = normalize([row({ source: "pi_bridge_v2_totally_new" })]);
    expect(r.metrics).toHaveLength(0);
    expect(r.rejections[0].reason).toBe("unusable_source");
  });

  it("quality stale/invalid rows are excluded even from live sources", () => {
    expect(normalize([row({ quality: "stale" })]).metrics).toHaveLength(0);
    expect(normalize([row({ quality: "invalid" })]).metrics).toHaveLength(0);
  });
});

describe("unit + plausibility rules", () => {
  it("temperature converts C→F through the trusted rule", () => {
    const r = normalize([row({ value: 25 })]);
    expect(r.metrics[0].metric).toBe("temperature_f");
    expect(r.metrics[0].value).toBe(77);
  });

  it("implausible temperature_c (looks like °F) is rejected and flagged", () => {
    const r = normalize([row({ value: 82 })]); // 82°C is implausible — F/C anomaly
    expect(r.metrics).toHaveLength(0);
    expect(r.rejections[0].reason).toBe("implausible_value");
    expect(r.flags.join(" ")).toMatch(/implausible temperature_c/);
  });

  it("EC that looks like µS/cm normalizes to mS/cm through ecUnits", () => {
    const r = normalize([row({ metric: "ec", value: 1600 })]);
    expect(r.metrics).toHaveLength(1);
    expect(r.metrics[0].metric).toBe("soil_ec");
    expect(r.metrics[0].value).toBe(1.6);
    expect(r.flags.join(" ")).toMatch(/EC looked like µS\/cm/);
  });

  it("humidity stuck at 0 or 100 is flagged and excluded", () => {
    for (const v of [0, 100]) {
      const r = normalize([row({ metric: "humidity_pct", value: v })]);
      expect(r.metrics).toHaveLength(0);
      expect(r.flags.join(" ")).toMatch(/humidity stuck/);
    }
  });

  it("soil moisture stuck at 0 or 100 is flagged and excluded", () => {
    for (const v of [0, 100]) {
      const r = normalize([row({ metric: "soil_moisture_pct", value: v })]);
      expect(r.metrics).toHaveLength(0);
      expect(r.flags.join(" ")).toMatch(/soil moisture stuck/);
    }
  });

  it("implausible pH is flagged and excluded", () => {
    const r = normalize([row({ metric: "ph", value: 11.2 })]);
    expect(r.metrics).toHaveLength(0);
    expect(r.flags.join(" ")).toMatch(/implausible pH/);
  });

  it("future readings are rejected", () => {
    const r = normalize([row({ captured_at: "2026-07-12T00:00:00.000Z" })]);
    expect(r.metrics).toHaveLength(0);
    expect(r.rejections[0].reason).toBe("future_reading");
  });

  it("unparseable timestamps are excluded", () => {
    const r = normalize([row({ captured_at: "yesterday-ish" })]);
    expect(r.metrics).toHaveLength(0);
    expect(r.rejections[0].reason).toBe("invalid_timestamp");
  });

  it("unknown metric mappings become unusable", () => {
    const r = normalize([row({ metric: "leaf_wetness" })]);
    expect(r.metrics).toHaveLength(0);
    expect(r.rejections[0].reason).toBe("unknown_metric");
  });
});

describe("scope + dedupe", () => {
  it("cross-tent readings are excluded", () => {
    const r = normalize([row({ tent_id: "tent-other" })]);
    expect(r.metrics).toHaveLength(0);
    expect(r.rejections[0].reason).toBe("wrong_tent");
  });

  it("an action without tent context cannot use tent telemetry", () => {
    const r = normalizeSensorEvidence({
      rows: [row()],
      actionTentId: null,
      analysisAt: ANALYSIS,
    });
    expect(r.metrics).toHaveLength(0);
    expect(r.rejections[0].reason).toBe("missing_tent");
  });

  it("tent-level readings carry plantId null (documented plant-context rule)", () => {
    const r = normalize([row()]);
    expect(r.metrics[0].plantId).toBeNull();
  });

  it("duplicate readings deduplicate deterministically", () => {
    const dup = row();
    const r = normalize([dup, { ...dup }, { ...dup, value: 25 }]);
    expect(r.metrics).toHaveLength(1);
    const again = normalize([{ ...dup, value: 25 }, dup, { ...dup }]);
    expect(JSON.stringify(r.metrics)).toBe(JSON.stringify(again.metrics));
  });

  it("dedupeOutcomeMetrics is order-independent", () => {
    const a = {
      metric: "vpd_kpa" as const,
      value: 1.2,
      capturedAt: "2026-07-10T10:00:00.000Z",
      source: "live" as const,
      confidence: "ok",
      tentId: TENT,
      plantId: null,
    };
    const b = { ...a, capturedAt: "2026-07-10T11:00:00.000Z" };
    expect(JSON.stringify(dedupeOutcomeMetrics([a, b]))).toBe(
      JSON.stringify(dedupeOutcomeMetrics([b, a])),
    );
  });
});

describe("diary evidence normalization", () => {
  const base = {
    event_type: "watering",
    occurred_at: "2026-07-10T13:00:00.000Z",
    note: "Watered 2L, slight runoff",
    grow_id: "grow-1",
    tent_id: TENT,
    plant_id: "plant-1",
  };

  it("relevant events normalize with trimmed notes and no raw payload", () => {
    const out = normalizeDiaryEvidence({
      rows: [{ ...base, note: "  padded  " }],
      actionGrowId: "grow-1",
      actionPlantId: "plant-1",
      analysisAt: ANALYSIS,
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({
      eventType: "watering",
      occurredAt: base.occurred_at,
      note: "padded",
      plantId: "plant-1",
      tentId: TENT,
      actionQueueId: null,
    });
  });

  it("cross-grow rows are excluded", () => {
    const out = normalizeDiaryEvidence({
      rows: [{ ...base, grow_id: "grow-other" }],
      actionGrowId: "grow-1",
      actionPlantId: null,
      analysisAt: ANALYSIS,
    });
    expect(out).toHaveLength(0);
  });

  it("wrong-plant rows are excluded when the action names a plant", () => {
    const out = normalizeDiaryEvidence({
      rows: [{ ...base, plant_id: "plant-other" }],
      actionGrowId: "grow-1",
      actionPlantId: "plant-1",
      analysisAt: ANALYSIS,
    });
    expect(out).toHaveLength(0);
  });

  it("soft-deleted and irrelevant event types are excluded", () => {
    const out = normalizeDiaryEvidence({
      rows: [
        { ...base, is_deleted: true },
        { ...base, event_type: "reminder" },
      ],
      actionGrowId: "grow-1",
      actionPlantId: null,
      analysisAt: ANALYSIS,
    });
    expect(out).toHaveLength(0);
  });

  it("output ordering is deterministic", () => {
    const rows = [
      { ...base, occurred_at: "2026-07-10T15:00:00.000Z", event_type: "feeding" },
      { ...base, occurred_at: "2026-07-10T13:00:00.000Z" },
    ];
    const a = normalizeDiaryEvidence({
      rows,
      actionGrowId: "grow-1",
      actionPlantId: null,
      analysisAt: ANALYSIS,
    });
    const b = normalizeDiaryEvidence({
      rows: [...rows].reverse(),
      actionGrowId: "grow-1",
      actionPlantId: null,
      analysisAt: ANALYSIS,
    });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a[0].occurredAt < a[1].occurredAt).toBe(true);
  });
});
