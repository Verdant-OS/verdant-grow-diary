/**
 * Tests for reviewManualSensorSnapshot — pure rules, deterministic staleness,
 * safety invariants (source: manual, never live).
 */
import { describe, it, expect } from "vitest";
import { reviewManualSensorSnapshot } from "@/lib/sensorSnapshotReviewRules";

const NOW = new Date("2026-07-09T12:00:00.000Z");
const RECENT = "2026-07-09T11:55:00.000Z";

const VALID_INPUT = {
  tempF: 75,
  humidity: 55,
  vpdKpa: 1.1,
  co2Ppm: 800,
  soilWaterContent: 35,
  reservoirEc: 1.4,
  reservoirPh: 6.0,
  capturedAt: RECENT,
  tentId: "tent-1",
  plantId: "plant-1",
} as const;

describe("reviewManualSensorSnapshot · happy path", () => {
  it("passes with high confidence when all fields are valid", () => {
    const r = reviewManualSensorSnapshot(VALID_INPUT, { now: NOW });
    expect(r.canSave).toBe(true);
    expect(r.source).toBe("manual");
    expect(r.confidence).toBe("high");
    expect(r.findings.filter((f) => f.severity !== "ok")).toHaveLength(0);
    expect(r.normalizedPreview.tempF).toBe(75);
    expect(r.normalizedPreview.tentId).toBe("tent-1");
  });

  it("always reports source: manual (never live)", () => {
    const r = reviewManualSensorSnapshot(VALID_INPUT, { now: NOW });
    // TypeScript already narrows to "manual", but assert at runtime too.
    expect(r.source).toBe("manual");
    // JSON view must not contain the string "live"
    expect(JSON.stringify(r)).not.toMatch(/"live"/);
  });
});

describe("reviewManualSensorSnapshot · blockers", () => {
  it.each([
    ["humidity_out_of_range", { humidity: 120 }],
    ["soil_water_content_out_of_range", { soilWaterContent: 150 }],
    ["co2_negative", { co2Ppm: -1 }],
    ["vpd_negative", { vpdKpa: -0.1 }],
    ["ppfd_negative", { ppfd: -1 }],
    ["ppfd_out_of_range", { ppfd: 9999 }],
    ["reservoir_ph_out_of_range", { reservoirPh: 15 }],
    ["reservoir_ec_negative", { reservoirEc: -0.1 }],
    ["soil_ec_negative", { soilEc: -0.1 }],
  ])("emits blocker %s", (key, patch) => {
    const r = reviewManualSensorSnapshot(
      { ...VALID_INPUT, ...patch },
      { now: NOW },
    );
    const found = r.findings.find((f) => f.key === key);
    expect(found?.severity).toBe("blocker");
    expect(r.canSave).toBe(false);
  });

  it("blocks when tentId is missing", () => {
    const r = reviewManualSensorSnapshot(
      { ...VALID_INPUT, tentId: null },
      { now: NOW },
    );
    expect(r.findings.some((f) => f.key === "tent_missing" && f.severity === "blocker")).toBe(true);
    expect(r.canSave).toBe(false);
  });

  it("blocks when capturedAt is missing, invalid, in the future, or > 24h old", () => {
    const missing = reviewManualSensorSnapshot({ ...VALID_INPUT, capturedAt: null }, { now: NOW });
    expect(missing.findings.some((f) => f.key === "captured_at_missing")).toBe(true);

    const invalid = reviewManualSensorSnapshot({ ...VALID_INPUT, capturedAt: "not-a-date" }, { now: NOW });
    expect(invalid.findings.some((f) => f.key === "captured_at_invalid")).toBe(true);

    const future = reviewManualSensorSnapshot(
      { ...VALID_INPUT, capturedAt: "2026-07-10T00:00:00.000Z" },
      { now: NOW },
    );
    expect(future.findings.some((f) => f.key === "captured_at_future" && f.severity === "blocker")).toBe(true);

    const tooOld = reviewManualSensorSnapshot(
      { ...VALID_INPUT, capturedAt: "2026-07-07T00:00:00.000Z" },
      { now: NOW },
    );
    expect(tooOld.findings.some((f) => f.key === "captured_at_too_old" && f.severity === "blocker")).toBe(true);
  });

  it("blocks when no metrics are entered", () => {
    const r = reviewManualSensorSnapshot(
      { tentId: "tent-1", capturedAt: RECENT },
      { now: NOW },
    );
    expect(r.findings.some((f) => f.key === "no_metrics" && f.severity === "blocker")).toBe(true);
    expect(r.canSave).toBe(false);
  });
});

describe("reviewManualSensorSnapshot · warnings (suspicious but allowed)", () => {
  it("flags humidity stuck at rail (0 or 100)", () => {
    for (const humidity of [0, 100]) {
      const r = reviewManualSensorSnapshot({ ...VALID_INPUT, humidity }, { now: NOW });
      expect(r.canSave).toBe(true);
      expect(r.findings.some((f) => f.key === "humidity_stuck_rail" && f.severity === "warning")).toBe(true);
      expect(r.confidence).toBe("low");
    }
  });

  it("flags soil water content stuck at rail (0 or 100)", () => {
    const r = reviewManualSensorSnapshot({ ...VALID_INPUT, soilWaterContent: 0 }, { now: NOW });
    expect(r.findings.some((f) => f.key === "soil_water_content_stuck_rail")).toBe(true);
  });

  it("flags °F field with a °C-looking value (unit mismatch)", () => {
    const r = reviewManualSensorSnapshot({ ...VALID_INPUT, tempF: 22 }, { now: NOW });
    const w = r.findings.find((f) => f.key === "temp_f_looks_like_celsius");
    expect(w?.severity).toBe("warning");
    expect(r.confidence).toBe("low");
  });

  it("flags high VPD, atypical reservoir EC/pH, high PPFD, 90-min stale", () => {
    const r = reviewManualSensorSnapshot(
      {
        ...VALID_INPUT,
        vpdKpa: 3.0,
        reservoirEc: 5.5,
        reservoirPh: 4.2,
        ppfd: 1800,
        capturedAt: "2026-07-09T10:30:00.000Z", // 90 min before NOW
      },
      { now: NOW },
    );
    const keys = r.findings.map((f) => f.key);
    expect(keys).toEqual(expect.arrayContaining([
      "vpd_high",
      "reservoir_ec_atypical",
      "reservoir_ph_atypical",
      "ppfd_high",
      "captured_at_stale",
    ]));
    expect(r.canSave).toBe(true);
  });
});

describe("reviewManualSensorSnapshot · determinism + normalizedPreview", () => {
  it("returns identical output for identical input (including finding order)", () => {
    const a = reviewManualSensorSnapshot(VALID_INPUT, { now: NOW });
    const b = reviewManualSensorSnapshot(VALID_INPUT, { now: NOW });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("normalizedPreview echoes coerced fields and never invents missing ones", () => {
    const r = reviewManualSensorSnapshot(
      {
        tempF: "70",
        humidity: "50",
        capturedAt: RECENT,
        tentId: "tent-9",
      },
      { now: NOW },
    );
    expect(r.normalizedPreview.tempF).toBe(70);
    expect(r.normalizedPreview.humidity).toBe(50);
    expect(r.normalizedPreview.co2Ppm).toBeNull();
    expect(r.normalizedPreview.ppfd).toBeNull();
    expect(r.normalizedPreview.tentId).toBe("tent-9");
    expect(r.normalizedPreview.plantId).toBeNull();
  });

  it("auto-derives a VPD preview from temp + RH but marks it as ok/derived (not silently persisted)", () => {
    const r = reviewManualSensorSnapshot(
      { tempF: 75, humidity: 55, capturedAt: RECENT, tentId: "tent-1" },
      { now: NOW },
    );
    expect(r.normalizedPreview.vpdKpa).not.toBeNull();
    const derived = r.findings.find((f) => f.key === "vpd_derived_preview");
    expect(derived?.severity).toBe("ok");
  });
});
