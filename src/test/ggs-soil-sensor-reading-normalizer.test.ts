/**
 * ggs-soil-sensor-reading-normalizer — pure helper tests.
 */
import { describe, it, expect } from "vitest";
import {
  GGS_SOIL_SENSOR_PROVIDER,
  GGS_SOIL_STALE_MS,
  normalizeGgsSoilSensorReading,
} from "@/lib/ggsSoilSensorReadingNormalizer";

const NOW = new Date("2026-06-17T12:00:00.000Z");
const FRESH = "2026-06-17T11:59:30.000Z";
const STALE = new Date(NOW.getTime() - GGS_SOIL_STALE_MS - 60_000).toISOString();

describe("normalizeGgsSoilSensorReading — happy path", () => {
  it("maps a valid snake_case payload to canonical soil metrics", () => {
    const r = normalizeGgsSoilSensorReading(
      {
        captured_at: FRESH,
        tent_id: "tent-1",
        soil_moisture: 42,
        soil_temp_c: 22.5,
        soil_ec: 1.8,
        transport: "mqtt",
      },
      { now: NOW },
    );
    expect(r.provider).toBe(GGS_SOIL_SENSOR_PROVIDER);
    expect(r.source).toBe("live");
    expect(r.status).toBe("accepted");
    expect(r.confidence).toBe("high");
    expect(r.readings).toEqual({
      soil_moisture_pct: 42,
      soil_temp_c: 22.5,
      ec: 1.8,
    });
    expect(r.tent_id).toBe("tent-1");
    expect(r.captured_at).toBe(FRESH);
  });

  it("accepts camelCase aliases", () => {
    const r = normalizeGgsSoilSensorReading(
      {
        capturedAt: FRESH,
        tentId: "tent-2",
        soilWaterContent: 38,
        soilTemperatureC: 21,
        soilEc: 1.2,
      },
      { now: NOW },
    );
    expect(r.source).toBe("live");
    expect(r.tent_id).toBe("tent-2");
    expect(r.readings.soil_moisture_pct).toBe(38);
    expect(r.readings.soil_temp_c).toBe(21);
    expect(r.readings.ec).toBe(1.2);
  });

  it("accepts vwc alias for soil moisture", () => {
    const r = normalizeGgsSoilSensorReading(
      { captured_at: FRESH, tent_id: "t", vwc: 30, soil_temp_c: 20, ec: 1 },
      { now: NOW },
    );
    expect(r.readings.soil_moisture_pct).toBe(30);
  });
});

describe("normalizeGgsSoilSensorReading — source rules", () => {
  it("manual entry forces source = manual regardless of timestamp", () => {
    const r = normalizeGgsSoilSensorReading(
      { captured_at: FRESH, tent_id: "t", soil_moisture: 40, soil_temp_c: 20, soil_ec: 1.5 },
      { now: NOW, manualEntry: true },
    );
    expect(r.source).toBe("manual");
    expect(r.transport).toBe("manual");
  });

  it("missing/unknown declared source never becomes live", () => {
    const r = normalizeGgsSoilSensorReading(
      { captured_at: FRESH, tent_id: "t", soil_moisture: 40 },
      { now: NOW, declaredSource: "mystery_vendor" },
    );
    expect(r.source).toBe("invalid");
    expect(r.warnings).toContain("unknown_source");
  });

  it("stale captured_at classifies as stale", () => {
    const r = normalizeGgsSoilSensorReading(
      { captured_at: STALE, tent_id: "t", soil_moisture: 40, soil_temp_c: 20 },
      { now: NOW },
    );
    expect(r.source).toBe("stale");
    expect(r.status).toBe("degraded");
    expect(r.confidence).toBe("low");
  });

  it("missing tent_id is rejected", () => {
    const r = normalizeGgsSoilSensorReading(
      { captured_at: FRESH, soil_moisture: 40, soil_temp_c: 20, soil_ec: 1 },
      { now: NOW },
    );
    expect(r.source).toBe("invalid");
    expect(r.warnings).toContain("tent_id_missing");
  });
});

describe("normalizeGgsSoilSensorReading — bad data is never healthy", () => {
  it("rejects NaN values", () => {
    const r = normalizeGgsSoilSensorReading(
      { captured_at: FRESH, tent_id: "t", soil_moisture: Number.NaN },
      { now: NOW },
    );
    expect(r.readings.soil_moisture_pct).toBeUndefined();
    expect(r.warnings).toContain("non_finite_value");
  });

  it("rejects Infinity values", () => {
    const r = normalizeGgsSoilSensorReading(
      { captured_at: FRESH, tent_id: "t", soil_ec: Number.POSITIVE_INFINITY },
      { now: NOW },
    );
    expect(r.readings.ec).toBeUndefined();
    expect(r.warnings).toContain("non_finite_value");
  });

  it("flags µS/cm leaking as mS/cm (EC unit mismatch)", () => {
    const r = normalizeGgsSoilSensorReading(
      { captured_at: FRESH, tent_id: "t", soil_moisture: 40, soil_ec: 1450 },
      { now: NOW },
    );
    expect(r.readings.ec).toBeUndefined();
    expect(r.warnings).toContain("soil_ec_unit_mismatch_suspected");
  });

  it("does not silently clamp out-of-range soil moisture", () => {
    const r = normalizeGgsSoilSensorReading(
      { captured_at: FRESH, tent_id: "t", soil_moisture: 150, soil_temp_c: 20 },
      { now: NOW },
    );
    expect(r.readings.soil_moisture_pct).toBeUndefined();
    expect(r.warnings).toContain("soil_water_content_out_of_range");
  });

  it("non-object payload is invalid", () => {
    const r = normalizeGgsSoilSensorReading("not-an-object", { now: NOW });
    expect(r.source).toBe("invalid");
    expect(r.warnings).toContain("payload_not_object");
  });
});

describe("normalizeGgsSoilSensorReading — raw_payload preservation", () => {
  it("preserves raw_payload verbatim for audit", () => {
    const input = { captured_at: FRESH, tent_id: "t", soil_moisture: 40, soil_temp_c: 20, soil_ec: 1, secret_field: "x" };
    const r = normalizeGgsSoilSensorReading(input, { now: NOW });
    expect(r.raw_payload).toBe(input);
  });
});
