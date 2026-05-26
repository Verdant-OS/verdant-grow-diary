import { describe, it, expect } from "vitest";
import {
  type ReadingSource,
  type NormalizedSensorReading,
  ALL_READING_SOURCES,
  SOURCE_LABELS,
  STALE_THRESHOLD_MS,
  isTemperatureValid,
  isHumidityValid,
  isVpdValid,
  isCo2Valid,
  isSoilMoistureValid,
  isReadingTelemetryValid,
  isReadingStale,
  classifySource,
  normalizeSensorReading,
} from "./sensorReadingNormalizationRules";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOW = new Date("2026-01-15T12:00:00Z").getTime();
const FRESH_TS = new Date("2026-01-15T11:45:00Z").toISOString(); // 15 min ago
const STALE_TS = new Date("2026-01-15T11:00:00Z").toISOString(); // 60 min ago

const VALID_METRICS = {
  temperature_c: 24.5,
  humidity_pct: 65,
  vpd_kpa: 1.2,
  co2_ppm: 800,
  soil_moisture_pct: 45,
};

// ---------------------------------------------------------------------------
// Source Classification Exhaustiveness
// ---------------------------------------------------------------------------

describe("ReadingSource types", () => {
  it("ALL_READING_SOURCES contains exactly 6 entries", () => {
    expect(ALL_READING_SOURCES).toHaveLength(6);
  });

  it("every source has a label", () => {
    for (const src of ALL_READING_SOURCES) {
      expect(SOURCE_LABELS[src]).toBeTruthy();
    }
  });

  it("all source states are explicitly distinguishable", () => {
    const unique = new Set<ReadingSource>(ALL_READING_SOURCES);
    expect(unique.size).toBe(ALL_READING_SOURCES.length);
  });
});

// ---------------------------------------------------------------------------
// Validation Guards
// ---------------------------------------------------------------------------

describe("isTemperatureValid", () => {
  it("null is valid (missing is allowed)", () => {
    expect(isTemperatureValid(null)).toBe(true);
  });
  it("24.5 is valid", () => {
    expect(isTemperatureValid(24.5)).toBe(true);
  });
  it("-10 is valid (boundary)", () => {
    expect(isTemperatureValid(-10)).toBe(true);
  });
  it("60 is valid (boundary)", () => {
    expect(isTemperatureValid(60)).toBe(true);
  });
  it("-11 is invalid", () => {
    expect(isTemperatureValid(-11)).toBe(false);
  });
  it("61 is invalid", () => {
    expect(isTemperatureValid(61)).toBe(false);
  });
  it("NaN is invalid", () => {
    expect(isTemperatureValid(NaN)).toBe(false);
  });
  it("Infinity is invalid", () => {
    expect(isTemperatureValid(Infinity)).toBe(false);
  });
});

describe("isHumidityValid", () => {
  it("null is valid", () => {
    expect(isHumidityValid(null)).toBe(true);
  });
  it("65 is valid", () => {
    expect(isHumidityValid(65)).toBe(true);
  });
  it("0 is valid (boundary)", () => {
    expect(isHumidityValid(0)).toBe(true);
  });
  it("100 is valid (boundary)", () => {
    expect(isHumidityValid(100)).toBe(true);
  });
  it("-1 is invalid", () => {
    expect(isHumidityValid(-1)).toBe(false);
  });
  it("101 is invalid", () => {
    expect(isHumidityValid(101)).toBe(false);
  });
});

describe("isVpdValid", () => {
  it("null is valid", () => {
    expect(isVpdValid(null)).toBe(true);
  });
  it("1.2 is valid", () => {
    expect(isVpdValid(1.2)).toBe(true);
  });
  it("-0.1 is invalid", () => {
    expect(isVpdValid(-0.1)).toBe(false);
  });
  it("10.1 is invalid", () => {
    expect(isVpdValid(10.1)).toBe(false);
  });
});

describe("isCo2Valid", () => {
  it("null is valid (missing CO₂ does NOT create false risk)", () => {
    expect(isCo2Valid(null)).toBe(true);
  });
  it("800 is valid", () => {
    expect(isCo2Valid(800)).toBe(true);
  });
  it("-1 is invalid", () => {
    expect(isCo2Valid(-1)).toBe(false);
  });
  it("5001 is invalid", () => {
    expect(isCo2Valid(5001)).toBe(false);
  });
});

describe("isSoilMoistureValid", () => {
  it("null is valid", () => {
    expect(isSoilMoistureValid(null)).toBe(true);
  });
  it("45 is valid", () => {
    expect(isSoilMoistureValid(45)).toBe(true);
  });
  it("-1 is invalid", () => {
    expect(isSoilMoistureValid(-1)).toBe(false);
  });
  it("101 is invalid", () => {
    expect(isSoilMoistureValid(101)).toBe(false);
  });
});

describe("isReadingTelemetryValid", () => {
  it("all valid metrics pass", () => {
    expect(isReadingTelemetryValid(VALID_METRICS)).toBe(true);
  });

  it("all null metrics pass (partial reading)", () => {
    expect(
      isReadingTelemetryValid({
        temperature_c: null,
        humidity_pct: null,
        vpd_kpa: null,
        co2_ppm: null,
        soil_moisture_pct: null,
      }),
    ).toBe(true);
  });

  it("one invalid metric fails the whole reading", () => {
    expect(isReadingTelemetryValid({ ...VALID_METRICS, temperature_c: 100 })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Stale Detection
// ---------------------------------------------------------------------------

describe("isReadingStale", () => {
  it("fresh reading is not stale", () => {
    expect(isReadingStale(FRESH_TS, NOW)).toBe(false);
  });

  it("old reading is stale", () => {
    expect(isReadingStale(STALE_TS, NOW)).toBe(true);
  });

  it("exactly at threshold is not stale", () => {
    const exactThreshold = new Date(NOW - STALE_THRESHOLD_MS).toISOString();
    expect(isReadingStale(exactThreshold, NOW)).toBe(false);
  });

  it("1ms past threshold is stale", () => {
    const justPast = new Date(NOW - STALE_THRESHOLD_MS - 1).toISOString();
    expect(isReadingStale(justPast, NOW)).toBe(true);
  });

  it("unparseable timestamp is treated as stale", () => {
    expect(isReadingStale("not-a-date", NOW)).toBe(true);
  });

  it("custom threshold works", () => {
    const fiveMinAgo = new Date(NOW - 5 * 60 * 1000).toISOString();
    // Not stale with 30min threshold
    expect(isReadingStale(fiveMinAgo, NOW, STALE_THRESHOLD_MS)).toBe(false);
    // Stale with 1min threshold
    expect(isReadingStale(fiveMinAgo, NOW, 60 * 1000)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Source Classification
// ---------------------------------------------------------------------------

describe("classifySource", () => {
  it("valid live + fresh → live", () => {
    expect(
      classifySource({
        declaredSource: "live",
        capturedAt: FRESH_TS,
        metrics: VALID_METRICS,
        now: NOW,
      }),
    ).toBe("live");
  });

  it("valid live + stale → stale", () => {
    expect(
      classifySource({
        declaredSource: "live",
        capturedAt: STALE_TS,
        metrics: VALID_METRICS,
        now: NOW,
      }),
    ).toBe("stale");
  });

  it("manual source remains manual even if stale", () => {
    expect(
      classifySource({
        declaredSource: "manual",
        capturedAt: STALE_TS,
        metrics: VALID_METRICS,
        now: NOW,
      }),
    ).toBe("manual");
  });

  it("demo source remains demo", () => {
    expect(
      classifySource({
        declaredSource: "demo",
        capturedAt: FRESH_TS,
        metrics: VALID_METRICS,
        now: NOW,
      }),
    ).toBe("demo");
  });

  it("imported source remains imported", () => {
    expect(
      classifySource({
        declaredSource: "imported",
        capturedAt: STALE_TS,
        metrics: VALID_METRICS,
        now: NOW,
      }),
    ).toBe("imported");
  });

  it("invalid telemetry ALWAYS returns invalid regardless of declared source", () => {
    const invalidMetrics = { ...VALID_METRICS, temperature_c: 999 };
    expect(
      classifySource({
        declaredSource: "live",
        capturedAt: FRESH_TS,
        metrics: invalidMetrics,
        now: NOW,
      }),
    ).toBe("invalid");
    expect(
      classifySource({
        declaredSource: "manual",
        capturedAt: FRESH_TS,
        metrics: invalidMetrics,
        now: NOW,
      }),
    ).toBe("invalid");
  });

  it("unknown declared source → invalid", () => {
    expect(
      classifySource({
        declaredSource: "unknown_device",
        capturedAt: FRESH_TS,
        metrics: VALID_METRICS,
        now: NOW,
      }),
    ).toBe("invalid");
  });
});

// ---------------------------------------------------------------------------
// Normalization Entry Point
// ---------------------------------------------------------------------------

describe("normalizeSensorReading", () => {
  it("produces a fully classified reading from valid live input", () => {
    const result = normalizeSensorReading(
      {
        captured_at: FRESH_TS,
        source: "live",
        ...VALID_METRICS,
        raw_payload: { device: "shelly-ht-01", firmware: "1.2.3" },
      },
      NOW,
    );

    expect(result.source).toBe("live");
    expect(result.captured_at).toBe(FRESH_TS);
    expect(result.temperature_c).toBe(24.5);
    expect(result.humidity_pct).toBe(65);
    expect(result.vpd_kpa).toBe(1.2);
    expect(result.co2_ppm).toBe(800);
    expect(result.soil_moisture_pct).toBe(45);
    expect(result.raw_payload).toEqual({
      device: "shelly-ht-01",
      firmware: "1.2.3",
    });
  });

  it("supports partial readings (only temp + humidity)", () => {
    const result = normalizeSensorReading(
      {
        captured_at: FRESH_TS,
        source: "live",
        temperature_c: 22.0,
        humidity_pct: 55,
        raw_payload: { partial: true },
      },
      NOW,
    );

    expect(result.source).toBe("live");
    expect(result.temperature_c).toBe(22.0);
    expect(result.humidity_pct).toBe(55);
    expect(result.vpd_kpa).toBeNull();
    expect(result.co2_ppm).toBeNull();
    expect(result.soil_moisture_pct).toBeNull();
  });

  it("missing CO₂ does NOT create false risk (source stays live)", () => {
    const result = normalizeSensorReading(
      {
        captured_at: FRESH_TS,
        source: "live",
        temperature_c: 24.0,
        humidity_pct: 60,
        vpd_kpa: 1.1,
        co2_ppm: null,
        soil_moisture_pct: 40,
      },
      NOW,
    );

    expect(result.source).toBe("live");
    expect(result.co2_ppm).toBeNull();
  });

  it("invalid telemetry never returns healthy/live state", () => {
    const result = normalizeSensorReading(
      {
        captured_at: FRESH_TS,
        source: "live",
        temperature_c: 999, // invalid
        humidity_pct: 65,
        vpd_kpa: 1.2,
        co2_ppm: 800,
        soil_moisture_pct: 45,
      },
      NOW,
    );

    expect(result.source).toBe("invalid");
  });

  it("preserves raw_payload verbatim", () => {
    const payload = { raw: "data", nested: { a: 1 } };
    const result = normalizeSensorReading(
      {
        captured_at: FRESH_TS,
        source: "manual",
        temperature_c: 22,
        raw_payload: payload,
      },
      NOW,
    );

    expect(result.raw_payload).toEqual(payload);
    // raw_payload is passed through verbatim — same reference is expected
    expect(result.raw_payload).toBe(payload);
  });

  it("defaults raw_payload to null when not provided", () => {
    const result = normalizeSensorReading(
      {
        captured_at: FRESH_TS,
        source: "manual",
        temperature_c: 22,
      },
      NOW,
    );

    expect(result.raw_payload).toBeNull();
  });

  it("stale live reading is classified as stale", () => {
    const result = normalizeSensorReading(
      {
        captured_at: STALE_TS,
        source: "live",
        ...VALID_METRICS,
      },
      NOW,
    );

    expect(result.source).toBe("stale");
  });

  it("demo source is preserved as-is", () => {
    const result = normalizeSensorReading(
      {
        captured_at: FRESH_TS,
        source: "demo",
        temperature_c: 25,
        humidity_pct: 60,
      },
      NOW,
    );

    expect(result.source).toBe("demo");
  });

  it("imported source is preserved even when reading is old", () => {
    const result = normalizeSensorReading(
      {
        captured_at: STALE_TS,
        source: "imported",
        ...VALID_METRICS,
      },
      NOW,
    );

    expect(result.source).toBe("imported");
  });

  it("returns correct NormalizedSensorReading shape", () => {
    const result: NormalizedSensorReading = normalizeSensorReading(
      {
        captured_at: FRESH_TS,
        source: "live",
        ...VALID_METRICS,
      },
      NOW,
    );

    // Verify all required fields exist
    expect(result).toHaveProperty("captured_at");
    expect(result).toHaveProperty("source");
    expect(result).toHaveProperty("temperature_c");
    expect(result).toHaveProperty("humidity_pct");
    expect(result).toHaveProperty("vpd_kpa");
    expect(result).toHaveProperty("co2_ppm");
    expect(result).toHaveProperty("soil_moisture_pct");
    expect(result).toHaveProperty("raw_payload");
  });
});
