/**
 * Unit tests for sensorReadingNormalizationRules.ts
 *
 * All tests are deterministic: time-dependent helpers receive a fixed `now`.
 * No I/O, no Supabase, no React.
 */
import { describe, it, expect } from "vitest";
import {
  NORMALIZED_READING_SOURCES,
  ACTIONABLE_SOURCES,
  NON_ALERTABLE_SOURCES,
  STALE_THRESHOLD_MS,
  isReadingStale,
  isLiveSource,
  isActionableSource,
  isNonAlertableSource,
  validateTelemetry,
  classifyReadingSource,
  hasAnyMetric,
  presentMetrics,
  type NormalizedReadingSource,
  type NormalizedSensorReading,
} from "@/lib/sensorReadingNormalizationRules";

// Fixed "now" for all deterministic time-based tests.
const FIXED_NOW = new Date("2025-06-15T12:00:00.000Z").getTime();

// ---------------------------------------------------------------------------
// Source constant completeness
// ---------------------------------------------------------------------------

describe("source constants", () => {
  it("NORMALIZED_READING_SOURCES contains all 6 sources", () => {
    expect(NORMALIZED_READING_SOURCES).toHaveLength(6);
    const expected: NormalizedReadingSource[] = [
      "live",
      "manual",
      "demo",
      "stale",
      "invalid",
      "imported",
    ];
    for (const s of expected) {
      expect(NORMALIZED_READING_SOURCES).toContain(s);
    }
  });

  it("ACTIONABLE_SOURCES contains live, manual, imported", () => {
    expect(ACTIONABLE_SOURCES).toContain("live");
    expect(ACTIONABLE_SOURCES).toContain("manual");
    expect(ACTIONABLE_SOURCES).toContain("imported");
    expect(ACTIONABLE_SOURCES).not.toContain("demo");
    expect(ACTIONABLE_SOURCES).not.toContain("stale");
    expect(ACTIONABLE_SOURCES).not.toContain("invalid");
  });

  it("NON_ALERTABLE_SOURCES contains demo, stale, invalid", () => {
    expect(NON_ALERTABLE_SOURCES).toContain("demo");
    expect(NON_ALERTABLE_SOURCES).toContain("stale");
    expect(NON_ALERTABLE_SOURCES).toContain("invalid");
    expect(NON_ALERTABLE_SOURCES).not.toContain("live");
    expect(NON_ALERTABLE_SOURCES).not.toContain("manual");
    expect(NON_ALERTABLE_SOURCES).not.toContain("imported");
  });

  it("ACTIONABLE and NON_ALERTABLE sets are disjoint", () => {
    for (const s of ACTIONABLE_SOURCES) {
      expect(NON_ALERTABLE_SOURCES).not.toContain(s);
    }
  });
});

// ---------------------------------------------------------------------------
// isReadingStale
// ---------------------------------------------------------------------------

describe("isReadingStale", () => {
  it("returns false for null capturedAt", () => {
    expect(isReadingStale(null, FIXED_NOW)).toBe(false);
  });

  it("returns false for unparseable timestamp", () => {
    expect(isReadingStale("not-a-date", FIXED_NOW)).toBe(false);
  });

  it("returns false for a fresh reading (within threshold)", () => {
    const freshTs = new Date(FIXED_NOW - 10 * 60 * 1000).toISOString();
    expect(isReadingStale(freshTs, FIXED_NOW)).toBe(false);
  });

  it("returns true for a reading exactly at the threshold boundary +1 ms", () => {
    const staleTs = new Date(FIXED_NOW - STALE_THRESHOLD_MS - 1).toISOString();
    expect(isReadingStale(staleTs, FIXED_NOW)).toBe(true);
  });

  it("returns false for a reading at exactly the threshold boundary", () => {
    const boundaryTs = new Date(FIXED_NOW - STALE_THRESHOLD_MS).toISOString();
    expect(isReadingStale(boundaryTs, FIXED_NOW)).toBe(false);
  });

  it("returns true for a very old reading", () => {
    const oldTs = new Date(FIXED_NOW - 2 * 60 * 60 * 1000).toISOString();
    expect(isReadingStale(oldTs, FIXED_NOW)).toBe(true);
  });

  it("respects a custom threshold", () => {
    const oneHourOld = new Date(FIXED_NOW - 60 * 60 * 1000).toISOString();
    expect(isReadingStale(oneHourOld, FIXED_NOW, 90 * 60 * 1000)).toBe(false);
    expect(isReadingStale(oneHourOld, FIXED_NOW, 30 * 60 * 1000)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Source helper predicates
// ---------------------------------------------------------------------------

describe("isLiveSource", () => {
  it("returns true only for live", () => {
    expect(isLiveSource("live")).toBe(true);
    for (const s of [
      "manual",
      "demo",
      "stale",
      "invalid",
      "imported",
    ] as NormalizedReadingSource[]) {
      expect(isLiveSource(s)).toBe(false);
    }
  });
});

describe("isActionableSource", () => {
  it("returns true for live, manual, imported", () => {
    expect(isActionableSource("live")).toBe(true);
    expect(isActionableSource("manual")).toBe(true);
    expect(isActionableSource("imported")).toBe(true);
  });

  it("returns false for demo, stale, invalid", () => {
    expect(isActionableSource("demo")).toBe(false);
    expect(isActionableSource("stale")).toBe(false);
    expect(isActionableSource("invalid")).toBe(false);
  });
});

describe("isNonAlertableSource", () => {
  it("returns true for demo, stale, invalid", () => {
    expect(isNonAlertableSource("demo")).toBe(true);
    expect(isNonAlertableSource("stale")).toBe(true);
    expect(isNonAlertableSource("invalid")).toBe(true);
  });

  it("returns false for live, manual, imported", () => {
    expect(isNonAlertableSource("live")).toBe(false);
    expect(isNonAlertableSource("manual")).toBe(false);
    expect(isNonAlertableSource("imported")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateTelemetry
// ---------------------------------------------------------------------------

const VALID_TS = new Date(FIXED_NOW - 5 * 60 * 1000).toISOString();

describe("validateTelemetry — happy paths", () => {
  it("accepts a minimal valid reading with one metric", () => {
    const result = validateTelemetry(
      { tent_id: "tent-1", captured_at: VALID_TS, temperature_c: 22.5 },
      FIXED_NOW,
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("accepts a full reading with all metrics", () => {
    const result = validateTelemetry(
      {
        tent_id: "tent-1",
        captured_at: VALID_TS,
        temperature_c: 25,
        humidity_pct: 60,
        vpd_kpa: 1.2,
        co2_ppm: 800,
        soil_moisture_pct: 55,
      },
      FIXED_NOW,
    );
    expect(result.valid).toBe(true);
  });

  it("accepts a partial reading missing CO₂ — missing CO₂ is not a risk", () => {
    const result = validateTelemetry(
      {
        tent_id: "tent-1",
        captured_at: VALID_TS,
        temperature_c: 24,
        humidity_pct: 65,
        // co2_ppm intentionally absent
      },
      FIXED_NOW,
    );
    expect(result.valid).toBe(true);
  });

  it("accepts boundary values at range edges", () => {
    const result = validateTelemetry(
      {
        tent_id: "tent-1",
        captured_at: VALID_TS,
        temperature_c: -10,
        humidity_pct: 0,
        vpd_kpa: 0,
        co2_ppm: 0,
        soil_moisture_pct: 100,
      },
      FIXED_NOW,
    );
    expect(result.valid).toBe(true);
  });
});

describe("validateTelemetry — invalid telemetry never returns healthy/live", () => {
  it("rejects missing tent_id", () => {
    const result = validateTelemetry({ captured_at: VALID_TS, temperature_c: 22 }, FIXED_NOW);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("tent_id"))).toBe(true);
  });

  it("rejects missing captured_at", () => {
    const result = validateTelemetry({ tent_id: "tent-1", temperature_c: 22 }, FIXED_NOW);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("captured_at"))).toBe(true);
  });

  it("rejects unparseable captured_at", () => {
    const result = validateTelemetry(
      { tent_id: "tent-1", captured_at: "not-a-date", temperature_c: 22 },
      FIXED_NOW,
    );
    expect(result.valid).toBe(false);
  });

  it("rejects captured_at more than 5 minutes in the future", () => {
    const futureTs = new Date(FIXED_NOW + 6 * 60 * 1000).toISOString();
    const result = validateTelemetry(
      { tent_id: "tent-1", captured_at: futureTs, temperature_c: 22 },
      FIXED_NOW,
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("future"))).toBe(true);
  });

  it("rejects a reading with no metric fields at all", () => {
    const result = validateTelemetry({ tent_id: "tent-1", captured_at: VALID_TS }, FIXED_NOW);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("at least one metric"))).toBe(true);
  });

  it("rejects temperature below plausible range", () => {
    const result = validateTelemetry(
      { tent_id: "tent-1", captured_at: VALID_TS, temperature_c: -50 },
      FIXED_NOW,
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("temperature_c"))).toBe(true);
  });

  it("rejects humidity above 100", () => {
    const result = validateTelemetry(
      { tent_id: "tent-1", captured_at: VALID_TS, humidity_pct: 110 },
      FIXED_NOW,
    );
    expect(result.valid).toBe(false);
  });

  it("rejects VPD above 5 kPa", () => {
    const result = validateTelemetry(
      { tent_id: "tent-1", captured_at: VALID_TS, vpd_kpa: 9.9 },
      FIXED_NOW,
    );
    expect(result.valid).toBe(false);
  });

  it("rejects CO₂ above 10 000 ppm", () => {
    const result = validateTelemetry(
      { tent_id: "tent-1", captured_at: VALID_TS, co2_ppm: 15000 },
      FIXED_NOW,
    );
    expect(result.valid).toBe(false);
  });

  it("rejects non-finite metric value", () => {
    const result = validateTelemetry(
      { tent_id: "tent-1", captured_at: VALID_TS, temperature_c: Infinity },
      FIXED_NOW,
    );
    expect(result.valid).toBe(false);
  });

  it("rejects NaN metric value", () => {
    const result = validateTelemetry(
      { tent_id: "tent-1", captured_at: VALID_TS, temperature_c: NaN },
      FIXED_NOW,
    );
    expect(result.valid).toBe(false);
  });

  it("collects multiple errors in one pass", () => {
    const result = validateTelemetry(
      {
        // no tent_id, no captured_at, out-of-range value
        temperature_c: -999,
      },
      FIXED_NOW,
    );
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// classifyReadingSource
// ---------------------------------------------------------------------------

describe("classifyReadingSource — invalid always wins", () => {
  it("returns invalid when is_invalid is true, regardless of other flags", () => {
    expect(
      classifyReadingSource({
        source_tag: "live",
        is_stale: false,
        is_invalid: true,
      }),
    ).toBe("invalid");

    expect(
      classifyReadingSource({
        source_tag: "manual",
        is_stale: true,
        is_invalid: true,
      }),
    ).toBe("invalid");
  });
});

describe("classifyReadingSource — stale wins over source tag", () => {
  it("returns stale when is_stale is true and is_invalid is false", () => {
    expect(
      classifyReadingSource({
        source_tag: "pi_bridge",
        is_stale: true,
        is_invalid: false,
      }),
    ).toBe("stale");
  });
});

describe("classifyReadingSource — source tag mapping", () => {
  it('maps "sim" to demo', () => {
    expect(classifyReadingSource({ source_tag: "sim", is_stale: false, is_invalid: false })).toBe(
      "demo",
    );
  });

  it('maps "demo" to demo', () => {
    expect(classifyReadingSource({ source_tag: "demo", is_stale: false, is_invalid: false })).toBe(
      "demo",
    );
  });

  it('maps "simulated" to demo', () => {
    expect(
      classifyReadingSource({
        source_tag: "simulated",
        is_stale: false,
        is_invalid: false,
      }),
    ).toBe("demo");
  });

  it('maps "manual" to manual', () => {
    expect(
      classifyReadingSource({
        source_tag: "manual",
        is_stale: false,
        is_invalid: false,
      }),
    ).toBe("manual");
  });

  it('maps "imported" to imported', () => {
    expect(
      classifyReadingSource({
        source_tag: "imported",
        is_stale: false,
        is_invalid: false,
      }),
    ).toBe("imported");
  });

  it('maps "csv" to imported', () => {
    expect(classifyReadingSource({ source_tag: "csv", is_stale: false, is_invalid: false })).toBe(
      "imported",
    );
  });

  it('maps "historical" to imported', () => {
    expect(
      classifyReadingSource({
        source_tag: "historical",
        is_stale: false,
        is_invalid: false,
      }),
    ).toBe("imported");
  });

  it("maps unknown tags to live (default hardware fallback)", () => {
    expect(
      classifyReadingSource({
        source_tag: "pi_bridge",
        is_stale: false,
        is_invalid: false,
      }),
    ).toBe("live");

    expect(
      classifyReadingSource({
        source_tag: "shelly_ht",
        is_stale: false,
        is_invalid: false,
      }),
    ).toBe("live");
  });

  it("source tag matching is case-insensitive", () => {
    expect(classifyReadingSource({ source_tag: "SIM", is_stale: false, is_invalid: false })).toBe(
      "demo",
    );
    expect(
      classifyReadingSource({
        source_tag: "MANUAL",
        is_stale: false,
        is_invalid: false,
      }),
    ).toBe("manual");
  });
});

// ---------------------------------------------------------------------------
// Partial reading helpers
// ---------------------------------------------------------------------------

type MetricFields = Pick<
  NormalizedSensorReading,
  "temperature_c" | "humidity_pct" | "vpd_kpa" | "co2_ppm" | "soil_moisture_pct"
>;

const allNull: MetricFields = {
  temperature_c: null,
  humidity_pct: null,
  vpd_kpa: null,
  co2_ppm: null,
  soil_moisture_pct: null,
};

describe("hasAnyMetric", () => {
  it("returns false when all metrics are null", () => {
    expect(hasAnyMetric(allNull)).toBe(false);
  });

  it("returns true when only temperature_c is present", () => {
    expect(hasAnyMetric({ ...allNull, temperature_c: 22 })).toBe(true);
  });

  it("returns true when only co2_ppm is present", () => {
    expect(hasAnyMetric({ ...allNull, co2_ppm: 900 })).toBe(true);
  });

  it("returns true when all metrics are present", () => {
    expect(
      hasAnyMetric({
        temperature_c: 25,
        humidity_pct: 60,
        vpd_kpa: 1.1,
        co2_ppm: 700,
        soil_moisture_pct: 55,
      }),
    ).toBe(true);
  });
});

describe("presentMetrics", () => {
  it("returns empty array when all metrics are null", () => {
    expect(presentMetrics(allNull)).toEqual([]);
  });

  it("returns only fields that have a value", () => {
    const present = presentMetrics({
      ...allNull,
      temperature_c: 24,
      humidity_pct: 65,
    });
    expect(present).toContain("temperature_c");
    expect(present).toContain("humidity_pct");
    expect(present).not.toContain("vpd_kpa");
    expect(present).not.toContain("co2_ppm");
    expect(present).not.toContain("soil_moisture_pct");
  });

  it("includes co2_ppm when present — absence is not an error", () => {
    const present = presentMetrics({ ...allNull, co2_ppm: 850 });
    expect(present).toEqual(["co2_ppm"]);
  });

  it("returns all 5 field names when all are non-null", () => {
    const present = presentMetrics({
      temperature_c: 25,
      humidity_pct: 60,
      vpd_kpa: 1.1,
      co2_ppm: 700,
      soil_moisture_pct: 55,
    });
    expect(present).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// raw_payload preservation invariant (type-level guard via compile test)
// ---------------------------------------------------------------------------

describe("raw_payload field", () => {
  it("accepts any value type for raw_payload without coercion", () => {
    const reading: NormalizedSensorReading = {
      id: "r-1",
      tent_id: "t-1",
      device_id: null,
      captured_at: VALID_TS,
      recorded_at: VALID_TS,
      source: "live",
      temperature_c: 22,
      humidity_pct: null,
      vpd_kpa: null,
      co2_ppm: null,
      soil_moisture_pct: null,
      raw_payload: { original: true, nested: { value: 42 } },
    };
    // raw_payload should be preserved exactly — not inspected, not transformed
    expect(reading.raw_payload).toEqual({ original: true, nested: { value: 42 } });
  });

  it("accepts null raw_payload", () => {
    const reading: NormalizedSensorReading = {
      id: "r-2",
      tent_id: "t-1",
      device_id: null,
      captured_at: VALID_TS,
      recorded_at: VALID_TS,
      source: "manual",
      temperature_c: 20,
      humidity_pct: null,
      vpd_kpa: null,
      co2_ppm: null,
      soil_moisture_pct: null,
      raw_payload: null,
    };
    expect(reading.raw_payload).toBeNull();
  });
});
