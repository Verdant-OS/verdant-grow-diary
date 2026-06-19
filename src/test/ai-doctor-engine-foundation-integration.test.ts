/**
 * AI Doctor Engine — Phase 1 Foundation integration tests.
 *
 * Verifies the compiler → executor flow end-to-end with mixed inputs,
 * per-metric snapshot coverage, deterministic staleness boundaries,
 * and the compatibility wrapper.
 *
 * Pure, deterministic. No Supabase, no model calls, no writes.
 */
import { describe, expect, it } from "vitest";
import {
  compileAiDoctorContextFromRows,
  compileAiDoctorContextPayloadFromRows,
  executeAiDoctorEngine,
  type AiDoctorMetricKey,
  type AiDoctorSensorSource,
  type CompileAiDoctorContextPayloadFromRowsInput,
} from "@/lib/aiDoctorEnginePhase1Foundation";

const NOW = new Date("2026-06-04T12:00:00Z");
const iso = (offsetMs: number) => new Date(NOW.getTime() - offsetMs).toISOString();

function basePlant(): CompileAiDoctorContextPayloadFromRowsInput {
  return {
    plant: {
      id: "p1",
      name: "Plant A",
      strain: "Blue Dream",
      stage: "veg",
      medium: "soil",
      pot_size: "7gal",
      tent_id: "t1",
      grow_id: "g1",
    },
    grow: { id: "g1" },
    tent: { id: "t1" },
    logs: [],
    photos: [],
    sensorReadings: [],
    now: NOW,
  };
}

// ---------------------------------------------------------------------------
// Integration: compiler → executor
// ---------------------------------------------------------------------------

describe("integration: compileAiDoctorContextPayloadFromRows → executeAiDoctorEngine", () => {
  it("strong context yields high confidence, low risk, and no action queue suggestion", async () => {
    const ctx = compileAiDoctorContextPayloadFromRows({
      ...basePlant(),
      logs: [{ occurred_at: iso(60_000), event_type: "watering", source: "manual" }],
      photos: [{ captured_at: iso(120_000) }],
      sensorReadings: [
        { metric: "temperature_c", value: 23, captured_at: iso(60_000), source: "live" },
      ],
    });
    const r = await executeAiDoctorEngine({ context: ctx });
    expect(ctx.context_trust_level).toBe("high");
    expect(r.confidence).toBe("high");
    expect(r.risk_level).toBe("low");
    expect(r.action_queue_suggestion).toBeNull();
  });

  it("partial context (no photo, no valid sensor) yields medium/low and missing_information reflects gaps", async () => {
    const ctx = compileAiDoctorContextPayloadFromRows({
      ...basePlant(),
      logs: [{ occurred_at: iso(60_000), event_type: "feeding", source: "manual" }],
    });
    const r = await executeAiDoctorEngine({ context: ctx });
    expect(["medium", "low"]).toContain(ctx.context_trust_level);
    expect(r.missing_information).toContain("recent photo (14d)");
    expect(r.missing_information).toContain("recent trustworthy sensor reading (7d)");
    expect(r.action_queue_suggestion).toBeNull();
  });

  it("invalid/stale telemetry raises caution without inventing healthy state", async () => {
    const ctx = compileAiDoctorContextPayloadFromRows({
      ...basePlant(),
      logs: [{ occurred_at: iso(60_000), event_type: "watering", source: "manual" }],
      photos: [{ captured_at: iso(120_000) }],
      sensorReadings: [
        { metric: "temperature_c", value: 23, captured_at: iso(60_000), source: "live" },
        { metric: "vpd_kpa", value: 99, captured_at: iso(60_000), source: "invalid" },
      ],
    });
    const r = await executeAiDoctorEngine({ context: ctx });
    expect(r.risk_level).toBe("medium");
    expect(r.action_queue_suggestion).not.toBeNull();
    expect(r.action_queue_suggestion!.approval_required).toBe(true);
    const vpd = ctx.sensor_summary.find((m) => m.metric === "vpd_kpa")!;
    expect(vpd.latest_value).toBeNull();
    expect(vpd.is_invalid).toBe(true);
  });

  it("medium/high risk with sufficient context emits approval-required, non-executable suggestion", async () => {
    const ctx = compileAiDoctorContextPayloadFromRows({
      ...basePlant(),
      logs: [{ occurred_at: iso(60_000), event_type: "watering", source: "manual" }],
      photos: [{ captured_at: iso(120_000) }],
      sensorReadings: [
        { metric: "temperature_c", value: 23, captured_at: iso(60_000), source: "live" },
        { metric: "humidity_pct", value: 0, captured_at: iso(60_000), source: "stale" },
      ],
    });
    const r = await executeAiDoctorEngine({ context: ctx });
    const s = r.action_queue_suggestion!;
    expect(s.approval_required).toBe(true);
    expect(["medium", "high"]).toContain(s.risk_level);
    const text = `${s.title} ${s.rationale}`.toLowerCase();
    expect(text).not.toMatch(/\b(turn on|turn off|execute|run command|set humidifier|set fan|api call)\b/);
  });

  it("low confidence never emits an action_queue_suggestion even when telemetry is degraded", async () => {
    const ctx = compileAiDoctorContextPayloadFromRows({
      ...basePlant(),
      sensorReadings: [
        { metric: "vpd_kpa", value: 99, captured_at: iso(60_000), source: "invalid" },
        { metric: "humidity_pct", value: 0, captured_at: iso(60_000), source: "stale" },
      ],
    });
    const r = await executeAiDoctorEngine({ context: ctx });
    expect(r.confidence).toBe("low");
    expect(r.action_queue_suggestion).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Per-metric sensor-summary coverage
// ---------------------------------------------------------------------------

const ALL_METRICS: readonly { metric: AiDoctorMetricKey; sample: number }[] = [
  { metric: "temperature_c", sample: 23 },
  { metric: "humidity_pct", sample: 55 },
  { metric: "vpd_kpa", sample: 1.1 },
  { metric: "co2_ppm", sample: 800 },
  { metric: "soil_moisture_pct", sample: 45 },
  { metric: "soil_ec_ms_cm", sample: 1.8 },
  { metric: "ppfd_umol", sample: 600 },
  { metric: "reservoir_ph", sample: 6.0 },
  { metric: "reservoir_ec_ms_cm", sample: 1.4 },
];

describe("sensor_summary: per-metric coverage", () => {
  for (const { metric, sample } of ALL_METRICS) {
    it(`${metric}: live latest reading preserves value, source, timestamp`, () => {
      const capturedAt = iso(60_000);
      const ctx = compileAiDoctorContextPayloadFromRows({
        ...basePlant(),
        sensorReadings: [{ metric, value: sample, captured_at: capturedAt, source: "live" }],
      });
      const snap = ctx.sensor_summary.find((m) => m.metric === metric)!;
      expect(snap.latest_value).toBe(sample);
      expect(snap.latest_source).toBe("live");
      expect(snap.latest_captured_at).toBe(capturedAt);
      expect(snap.is_stale).toBe(false);
      expect(snap.is_invalid).toBe(false);
      expect(snap.is_degraded).toBe(false);
      expect(snap.sample_count_7d).toBe(1);
    });

    it(`${metric}: when absent, snapshot fields are null and counts zero (never invented)`, () => {
      const ctx = compileAiDoctorContextPayloadFromRows({ ...basePlant() });
      const snap = ctx.sensor_summary.find((m) => m.metric === metric)!;
      expect(snap.latest_value).toBeNull();
      expect(snap.latest_source).toBeNull();
      expect(snap.latest_captured_at).toBeNull();
      expect(snap.sample_count_7d).toBe(0);
    });

    it(`${metric}: invalid reading never becomes the latest healthy value`, () => {
      const ctx = compileAiDoctorContextPayloadFromRows({
        ...basePlant(),
        sensorReadings: [{ metric, value: sample, captured_at: iso(60_000), source: "invalid" }],
      });
      const snap = ctx.sensor_summary.find((m) => m.metric === metric)!;
      expect(snap.is_invalid).toBe(true);
      expect(snap.latest_value).toBeNull();
      expect(snap.is_degraded).toBe(true);
    });

    it(`${metric}: stale-source reading is flagged stale + degraded`, () => {
      const ctx = compileAiDoctorContextPayloadFromRows({
        ...basePlant(),
        sensorReadings: [{ metric, value: sample, captured_at: iso(60_000), source: "stale" }],
      });
      const snap = ctx.sensor_summary.find((m) => m.metric === metric)!;
      expect(snap.is_stale).toBe(true);
      expect(snap.is_degraded).toBe(true);
    });
  }

  it("source separation: live/manual/csv/demo/stale/invalid are never merged for a single metric", () => {
    const allSources: AiDoctorSensorSource[] = ["live", "manual", "csv", "demo", "stale", "invalid"];
    const ctx = compileAiDoctorContextPayloadFromRows({
      ...basePlant(),
      sensorReadings: allSources.map((source) => ({
        metric: "vpd_kpa" as const,
        value: 1.0,
        captured_at: iso(60_000),
        source,
      })),
    });
    const expected = allSources.map((source) => ({ source, reading_count_7d: 1 }));
    expect(ctx.source_breakdown).toEqual(expected);
  });
});

// ---------------------------------------------------------------------------
// Staleness boundary (6h)
// ---------------------------------------------------------------------------

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

describe("staleness boundary at 6h (deterministic, fixed now)", () => {
  it("exactly 6h old live reading is NOT stale (rule: age > 6h ⇒ stale; 6h boundary is fresh)", () => {
    const ctx = compileAiDoctorContextPayloadFromRows({
      ...basePlant(),
      sensorReadings: [
        { metric: "temperature_c", value: 22, captured_at: iso(SIX_HOURS_MS), source: "live" },
      ],
    });
    const snap = ctx.sensor_summary.find((m) => m.metric === "temperature_c")!;
    expect(snap.is_stale).toBe(false);
    expect(snap.is_degraded).toBe(false);
  });

  it("just under 6h old live reading is fresh", () => {
    const ctx = compileAiDoctorContextPayloadFromRows({
      ...basePlant(),
      sensorReadings: [
        { metric: "temperature_c", value: 22, captured_at: iso(SIX_HOURS_MS - 1000), source: "live" },
      ],
    });
    const snap = ctx.sensor_summary.find((m) => m.metric === "temperature_c")!;
    expect(snap.is_stale).toBe(false);
    expect(snap.is_degraded).toBe(false);
  });

  it("just over 6h old live reading is stale/degraded", () => {
    const ctx = compileAiDoctorContextPayloadFromRows({
      ...basePlant(),
      sensorReadings: [
        { metric: "temperature_c", value: 22, captured_at: iso(SIX_HOURS_MS + 1000), source: "live" },
      ],
    });
    const snap = ctx.sensor_summary.find((m) => m.metric === "temperature_c")!;
    expect(snap.is_stale).toBe(true);
    expect(snap.is_degraded).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Compatibility wrapper
// ---------------------------------------------------------------------------

describe("compileAiDoctorContextFromRows (compatibility wrapper)", () => {
  it("returns the exact same payload as compileAiDoctorContextPayloadFromRows for the same input", () => {
    const input: CompileAiDoctorContextPayloadFromRowsInput = {
      ...basePlant(),
      logs: [{ occurred_at: iso(60_000), event_type: "watering", source: "manual" }],
      photos: [{ captured_at: iso(120_000) }],
      sensorReadings: [
        { metric: "temperature_c", value: 23, captured_at: iso(60_000), source: "live" },
        { metric: "vpd_kpa", value: 99, captured_at: iso(60_000), source: "invalid" },
      ],
    };
    const viaWrapper = compileAiDoctorContextFromRows(input);
    const viaCanonical = compileAiDoctorContextPayloadFromRows(input);
    expect(viaWrapper).toEqual(viaCanonical);
  });
});
