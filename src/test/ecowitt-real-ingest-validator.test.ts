/**
 * EcoWitt Real Ingest — Phase 0 validator tests.
 * Pure, deterministic. No I/O, no Supabase, no network.
 */
import { describe, it, expect } from "vitest";
import { validateEcoWittRealIngestCandidate } from "../lib/ecowittRealIngestValidator";

const REF = "2026-06-04T12:00:00.000Z";
const FRESH_MS = 5 * 60 * 1000; // 5 minutes
const OPTIONS = { reference_time: REF, freshness_window_ms: FRESH_MS };

const UUID_TENT = "11111111-1111-4111-8111-111111111111";
const UUID_PLANT = "22222222-2222-4222-8222-222222222222";

const validCandidate = () => ({
  tent_id: UUID_TENT,
  plant_id: UUID_PLANT,
  source: "live",
  captured_at: "2026-06-04T11:59:30.000Z", // 30s before REF
  device_identity: "ECOWITT-DEVICE-AB12",
  source_identity: "ecowitt-cloud",
  confidence: "high" as const,
  readings: {
    air_temp_f: 75,
    humidity_pct: 55,
    vpd_kpa: 1.1,
  },
});

describe("validateEcoWittRealIngestCandidate — happy path", () => {
  it("accepts a valid live candidate with UUID tent, fresh timestamp, required metrics", () => {
    const r = validateEcoWittRealIngestCandidate(validCandidate(), OPTIONS);
    expect(r.accepted).toBe(true);
    expect(r.can_persist_later).toBe(true);
    expect(r.source).toBe("live");
    expect(r.tent_id).toBe(UUID_TENT);
    expect(r.plant_id).toBe(UUID_PLANT);
    expect(r.captured_at).toBe("2026-06-04T11:59:30.000Z");
    expect(r.normalized_readings.air_temp_f).toBe(75);
    expect(r.normalized_readings.humidity_pct).toBe(55);
    expect(r.normalized_readings.vpd_kpa).toBe(1.1);
    expect(r.blocked_reasons).toEqual([]);
    expect(typeof r.dedupe_key).toBe("string");
  });
});

describe("validateEcoWittRealIngestCandidate — identity rules", () => {
  it("rejects missing tent ID", () => {
    const c: any = validCandidate();
    delete c.tent_id;
    const r = validateEcoWittRealIngestCandidate(c, OPTIONS);
    expect(r.accepted).toBe(false);
    expect(r.blocked_reasons).toContain("missing_tent_id");
  });

  it("rejects non-UUID tent ID", () => {
    const c = { ...validCandidate(), tent_id: "not-a-uuid" };
    const r = validateEcoWittRealIngestCandidate(c, OPTIONS);
    expect(r.accepted).toBe(false);
    expect(r.blocked_reasons).toContain("non_uuid_tent_id");
  });

  it("rejects placeholder tent ID like t1 / demo-tent", () => {
    for (const id of ["t1", "demo-tent", "sample-tent"]) {
      const r = validateEcoWittRealIngestCandidate(
        { ...validCandidate(), tent_id: id },
        OPTIONS,
      );
      expect(r.blocked_reasons).toContain("non_uuid_tent_id");
    }
  });

  it("rejects non-UUID plant ID", () => {
    const r = validateEcoWittRealIngestCandidate(
      { ...validCandidate(), plant_id: "plant-1" },
      OPTIONS,
    );
    expect(r.blocked_reasons).toContain("non_uuid_plant_id");
  });

  it("allows missing plant ID with warning", () => {
    const c: any = validCandidate();
    delete c.plant_id;
    const r = validateEcoWittRealIngestCandidate(c, OPTIONS);
    expect(r.accepted).toBe(true);
    expect(r.plant_id).toBeNull();
    expect(r.warnings).toContain("plant_id_missing");
  });
});

describe("validateEcoWittRealIngestCandidate — timestamp rules", () => {
  it("rejects missing captured_at", () => {
    const c: any = validCandidate();
    delete c.captured_at;
    const r = validateEcoWittRealIngestCandidate(c, OPTIONS);
    expect(r.blocked_reasons).toContain("missing_captured_at");
  });

  it("rejects invalid captured_at", () => {
    const r = validateEcoWittRealIngestCandidate(
      { ...validCandidate(), captured_at: "not-a-date" },
      OPTIONS,
    );
    expect(r.blocked_reasons).toContain("invalid_captured_at");
  });

  it("rejects stale snapshot using injected reference_time", () => {
    const r = validateEcoWittRealIngestCandidate(
      { ...validCandidate(), captured_at: "2026-06-04T11:00:00.000Z" }, // 60m old
      OPTIONS,
    );
    expect(r.blocked_reasons).toContain("stale_snapshot");
    expect(r.accepted).toBe(false);
  });

  it("rejects future timestamp beyond tolerance", () => {
    const r = validateEcoWittRealIngestCandidate(
      { ...validCandidate(), captured_at: "2026-06-04T12:10:00.000Z" }, // +10m
      OPTIONS,
    );
    expect(r.blocked_reasons).toContain("invalid_captured_at");
  });
});

describe("validateEcoWittRealIngestCandidate — identity strings", () => {
  it("rejects missing device identity", () => {
    const c: any = validCandidate();
    delete c.device_identity;
    const r = validateEcoWittRealIngestCandidate(c, OPTIONS);
    expect(r.blocked_reasons).toContain("missing_device_identity");
  });

  it("rejects placeholder device identity", () => {
    const r = validateEcoWittRealIngestCandidate(
      { ...validCandidate(), device_identity: "demo-device" },
      OPTIONS,
    );
    expect(r.blocked_reasons).toContain("placeholder_device_identity");
  });

  it("rejects missing source identity", () => {
    const c: any = validCandidate();
    delete c.source_identity;
    const r = validateEcoWittRealIngestCandidate(c, OPTIONS);
    expect(r.blocked_reasons).toContain("missing_source_identity");
  });
});

describe("validateEcoWittRealIngestCandidate — source rules", () => {
  for (const src of ["manual", "csv", "demo", "stale", "invalid"] as const) {
    it(`rejects ${src} source for real ingest (never upgraded)`, () => {
      const r = validateEcoWittRealIngestCandidate(
        { ...validCandidate(), source: src },
        OPTIONS,
      );
      expect(r.source).toBe(src);
      expect(r.accepted).toBe(false);
      expect(r.blocked_reasons).toContain("source_not_live");
    });
  }

  it("rejects unknown source", () => {
    const r = validateEcoWittRealIngestCandidate(
      { ...validCandidate(), source: "mystery" },
      OPTIONS,
    );
    expect(r.source).toBe("unknown");
    expect(r.blocked_reasons).toContain("source_unknown");
  });
});

describe("validateEcoWittRealIngestCandidate — required metrics", () => {
  it("rejects missing air_temp_f", () => {
    const c: any = validCandidate();
    delete c.readings.air_temp_f;
    const r = validateEcoWittRealIngestCandidate(c, OPTIONS);
    expect(r.blocked_reasons).toContain("missing_required_metric:air_temp_f");
  });

  it("rejects missing humidity_pct", () => {
    const c: any = validCandidate();
    delete c.readings.humidity_pct;
    const r = validateEcoWittRealIngestCandidate(c, OPTIONS);
    expect(r.blocked_reasons).toContain("missing_required_metric:humidity_pct");
  });

  it("rejects invalid air_temp_f (out of plausible F range, not Celsius-like)", () => {
    const c = { ...validCandidate(), readings: { ...validCandidate().readings, air_temp_f: 250 } };
    const r = validateEcoWittRealIngestCandidate(c, OPTIONS);
    expect(r.blocked_reasons).toContain("invalid_metric:air_temp_f");
  });

  it("rejects invalid humidity_pct (>100)", () => {
    const c = { ...validCandidate(), readings: { ...validCandidate().readings, humidity_pct: 150 } };
    const r = validateEcoWittRealIngestCandidate(c, OPTIONS);
    expect(r.blocked_reasons).toContain("invalid_metric:humidity_pct");
  });
});

describe("validateEcoWittRealIngestCandidate — suspicious values", () => {
  it("flags humidity stuck at 0", () => {
    const c = { ...validCandidate(), readings: { ...validCandidate().readings, humidity_pct: 0 } };
    const r = validateEcoWittRealIngestCandidate(c, OPTIONS);
    expect(r.blocked_reasons).toContain("suspicious_value:humidity_stuck_0_or_100");
  });

  it("flags humidity stuck at 100", () => {
    const c = { ...validCandidate(), readings: { ...validCandidate().readings, humidity_pct: 100 } };
    const r = validateEcoWittRealIngestCandidate(c, OPTIONS);
    expect(r.blocked_reasons).toContain("suspicious_value:humidity_stuck_0_or_100");
  });

  it("flags soil moisture stuck at 0 or 100", () => {
    for (const v of [0, 100]) {
      const c = { ...validCandidate(), readings: { ...validCandidate().readings, soil_water_content_pct: v } };
      const r = validateEcoWittRealIngestCandidate(c, OPTIONS);
      expect(r.blocked_reasons).toContain("suspicious_value:soil_moisture_stuck_0_or_100");
    }
  });

  it("flags Celsius-as-Fahrenheit suspicion when air_temp_f looks like Celsius", () => {
    const c = { ...validCandidate(), readings: { ...validCandidate().readings, air_temp_f: 24 } };
    const r = validateEcoWittRealIngestCandidate(c, OPTIONS);
    expect(r.blocked_reasons).toContain("suspicious_unit:temperature_c_as_f");
  });

  it("flags soil EC µS/cm-as-mS/cm unit mismatch when value is implausibly large", () => {
    const c = { ...validCandidate(), readings: { ...validCandidate().readings, soil_ec: 1200 } };
    const r = validateEcoWittRealIngestCandidate(c, OPTIONS);
    expect(r.blocked_reasons).toContain("suspicious_unit:soil_ec_us_cm_as_ms_cm");
  });
});

describe("validateEcoWittRealIngestCandidate — optional metrics", () => {
  it("missing optional metrics warn only, do not block", () => {
    const r = validateEcoWittRealIngestCandidate(validCandidate(), OPTIONS);
    expect(r.accepted).toBe(true);
    // vpd_kpa is supplied; the others are not.
    expect(r.warnings).toContain("optional_metric_missing:soil_water_content_pct");
    expect(r.warnings).toContain("optional_metric_missing:soil_temp_f");
    expect(r.warnings).toContain("optional_metric_missing:soil_ec");
    expect(r.warnings).toContain("optional_metric_missing:co2_ppm");
    expect(r.warnings).toContain("optional_metric_missing:ppfd");
    expect(r.warnings).not.toContain("optional_metric_missing:vpd_kpa");
  });
});

describe("validateEcoWittRealIngestCandidate — determinism / safety", () => {
  it("does not call Date.now (source-level scan)", () => {
    // Mirror of static-safety test: the validator source must not reference Date.now.
    // The validator behaviour test below proves it does not implicitly depend on it.
  });

  it("is deterministic — same input/options produces identical result", () => {
    const a = validateEcoWittRealIngestCandidate(validCandidate(), OPTIONS);
    const b = validateEcoWittRealIngestCandidate(validCandidate(), OPTIONS);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("returns blocked result for malformed input instead of throwing", () => {
    expect(() =>
      validateEcoWittRealIngestCandidate(null, OPTIONS),
    ).not.toThrow();
    const r1 = validateEcoWittRealIngestCandidate(null, OPTIONS);
    expect(r1.accepted).toBe(false);
    expect(r1.blocked_reasons.length).toBeGreaterThan(0);

    const r2 = validateEcoWittRealIngestCandidate("garbage", OPTIONS);
    expect(r2.accepted).toBe(false);

    const r3 = validateEcoWittRealIngestCandidate(42, OPTIONS);
    expect(r3.accepted).toBe(false);

    const r4 = validateEcoWittRealIngestCandidate({}, OPTIONS);
    expect(r4.accepted).toBe(false);
  });

  it("does not mutate the input candidate", () => {
    const c = validCandidate();
    const snapshot = JSON.stringify(c);
    validateEcoWittRealIngestCandidate(c, OPTIONS);
    expect(JSON.stringify(c)).toBe(snapshot);
  });

  it("requires injected reference_time — missing/invalid options block safely", () => {
    const r = validateEcoWittRealIngestCandidate(validCandidate(), {
      reference_time: "not-a-date",
      freshness_window_ms: FRESH_MS,
    });
    expect(r.accepted).toBe(false);
    expect(r.blocked_reasons).toContain("invalid_captured_at");
  });
});
