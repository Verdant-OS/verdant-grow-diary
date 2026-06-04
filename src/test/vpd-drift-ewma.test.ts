/**
 * VPD EWMA drift + AI Doctor wiring tests.
 *
 * Covers pure helper behavior, AI Doctor context surfacing, and static
 * safety: no Action Queue writes, no device control, no service_role,
 * no leak of custom user bands into bridge/ingest code paths.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  evaluateVpdDriftEwma,
  buildVpdDriftAiContext,
} from "@/lib/vpdDriftRules";
import { mapSensorReadingToAiDoctorContext } from "@/lib/aiDoctorSensorContextRules";

const ROOT = resolve(__dirname, "../..");
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");

const baseReading = {
  captured_at: "2026-06-04T12:00:00Z",
  source: "live" as const,
  temperature_c: 24,
  humidity_pct: 55,
  vpd_kpa: 1.1,
  co2_ppm: null,
  soil_moisture_pct: null,
  ppfd_umol_m2s: null,
};

function makeReadings(values: number[]) {
  return values.map((v, i) => ({
    capturedAt: `2026-06-04T${String(i).padStart(2, "0")}:00:00Z`,
    value: v,
  }));
}

const FLOWER_BAND = { lowKpa: 1.0, highKpa: 1.5 };

describe("evaluateVpdDriftEwma", () => {
  it("returns insufficient when there are fewer than minReadings samples", () => {
    const r = evaluateVpdDriftEwma({
      readings: makeReadings([1.2, 1.2, 1.2]),
      band: FLOWER_BAND,
    });
    expect(r.classification).toBe("insufficient");
    expect(r.sampleCount).toBe(3);
  });

  it("returns insufficient when no band is supplied (no leak into bridge paths)", () => {
    const r = evaluateVpdDriftEwma({
      readings: makeReadings([1.2, 1.2, 1.2, 1.2, 1.2, 1.2, 1.2]),
      band: null,
    });
    expect(r.classification).toBe("insufficient");
  });

  it("returns sustained_high for clearly-above-band readings", () => {
    const r = evaluateVpdDriftEwma({
      readings: makeReadings([1.8, 1.85, 1.9, 1.95, 2.0, 2.0, 2.0, 2.0]),
      band: FLOWER_BAND,
    });
    expect(r.classification).toBe("sustained_high");
    expect(r.ewmaKpa).not.toBeNull();
    expect((r.ewmaKpa as number) > FLOWER_BAND.highKpa).toBe(true);
  });

  it("returns sustained_low for clearly-below-band readings", () => {
    const r = evaluateVpdDriftEwma({
      readings: makeReadings([0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6]),
      band: FLOWER_BAND,
    });
    expect(r.classification).toBe("sustained_low");
    expect((r.ewmaKpa as number) < FLOWER_BAND.lowKpa).toBe(true);
  });

  it("returns in_band when EWMA settles inside the target band", () => {
    const r = evaluateVpdDriftEwma({
      readings: makeReadings([1.2, 1.25, 1.2, 1.22, 1.2, 1.21, 1.2]),
      band: FLOWER_BAND,
    });
    expect(r.classification).toBe("in_band");
  });

  it("filters non-finite values and orders by capturedAt", () => {
    const r = evaluateVpdDriftEwma({
      readings: [
        { capturedAt: "z", value: NaN },
        { capturedAt: "b", value: 1.2 },
        { capturedAt: "a", value: 1.2 },
        { capturedAt: "c", value: Infinity },
        { capturedAt: "d", value: 1.2 },
        { capturedAt: "e", value: 1.2 },
        { capturedAt: "f", value: 1.2 },
        { capturedAt: "g", value: 1.2 },
      ],
      band: FLOWER_BAND,
    });
    expect(r.sampleCount).toBe(6);
    expect(r.classification).toBe("in_band");
  });
});

describe("buildVpdDriftAiContext", () => {
  it("includes the no-Action-Queue safety note for every classification", () => {
    for (const cls of ["insufficient", "in_band", "sustained_high", "sustained_low"] as const) {
      const ctx = buildVpdDriftAiContext({
        classification: cls,
        ewmaKpa: 1.2,
        sampleCount: 10,
        lowKpa: 1.0,
        highKpa: 1.5,
      });
      expect(ctx.safetyNotes.some((n) => /Action Queue/.test(n))).toBe(true);
      expect(ctx.safetyNotes.some((n) => /nutrient|irrigation|equipment/i.test(n))).toBe(true);
    }
  });

  it("only suggests a review for sustained drift", () => {
    expect(
      buildVpdDriftAiContext({
        classification: "in_band",
        ewmaKpa: 1.2, sampleCount: 10, lowKpa: 1, highKpa: 1.5,
      }).suggestReview,
    ).toBe(false);
    expect(
      buildVpdDriftAiContext({
        classification: "insufficient",
        ewmaKpa: null, sampleCount: 2, lowKpa: 1, highKpa: 1.5,
      }).suggestReview,
    ).toBe(false);
    expect(
      buildVpdDriftAiContext({
        classification: "sustained_high",
        ewmaKpa: 1.8, sampleCount: 10, lowKpa: 1, highKpa: 1.5,
      }).suggestReview,
    ).toBe(true);
    expect(
      buildVpdDriftAiContext({
        classification: "sustained_low",
        ewmaKpa: 0.6, sampleCount: 10, lowKpa: 1, highKpa: 1.5,
      }).suggestReview,
    ).toBe(true);
  });
});

describe("mapSensorReadingToAiDoctorContext — VPD drift wiring", () => {
  it("omits vpdDrift when no drift input is provided (back-compat)", () => {
    const ctx = mapSensorReadingToAiDoctorContext(baseReading);
    expect(ctx.vpdDrift).toBeUndefined();
  });

  it("surfaces vpdDrift fields when drift input is provided", () => {
    const ctx = mapSensorReadingToAiDoctorContext(baseReading, {
      vpdDrift: {
        classification: "sustained_high",
        ewmaKpa: 1.8,
        sampleCount: 10,
        lowKpa: 1.0,
        highKpa: 1.5,
      },
    });
    expect(ctx.vpdDrift).toBeDefined();
    expect(ctx.vpdDrift!.classification).toBe("sustained_high");
    expect(ctx.vpdDrift!.suggestReview).toBe(true);
    expect(ctx.safetyNotes.some((n) => /Action Queue/.test(n))).toBe(true);
  });

  it("never introduces an action_queue/device-control surface from drift", () => {
    const ctx = mapSensorReadingToAiDoctorContext(baseReading, {
      vpdDrift: {
        classification: "sustained_low",
        ewmaKpa: 0.6,
        sampleCount: 12,
        lowKpa: 1.0,
        highKpa: 1.5,
      },
    });
    const blob = JSON.stringify(ctx);
    expect(blob).not.toMatch(/action_queue/i);
    expect(blob).not.toMatch(/device_command|autopilot|relay|actuator/i);
    expect(blob).not.toMatch(/service_role/);
  });
});

// ---------------------------------------------------------------------------
// Static safety scans
// ---------------------------------------------------------------------------

describe("Static safety — vpdDriftRules + AI Doctor wiring", () => {
  const VPD_DRIFT = read("src/lib/vpdDriftRules.ts");
  const AI_CTX = read("src/lib/aiDoctorSensorContextRules.ts");

  it("vpdDriftRules.ts performs no I/O, no Supabase, no automation", () => {
    expect(VPD_DRIFT).not.toMatch(/service_role/);
    expect(VPD_DRIFT).not.toMatch(/@\/integrations\/supabase/);
    expect(VPD_DRIFT).not.toMatch(/\bfetch\s*\(/);
    expect(VPD_DRIFT).not.toMatch(/functions\.invoke/);
    expect(VPD_DRIFT).not.toMatch(/\.from\(['"](action_queue|alerts|sensor_readings)['"]\)/);
    expect(VPD_DRIFT).not.toMatch(/device_command|autopilot|\brelay\b|\bactuator\b/i);
  });

  it("aiDoctorSensorContextRules.ts stays pure and never writes action_queue", () => {
    expect(AI_CTX).not.toMatch(/service_role/);
    expect(AI_CTX).not.toMatch(/@\/integrations\/supabase/);
    expect(AI_CTX).not.toMatch(/\.from\(['"](action_queue|alerts|sensor_readings)['"]\)/);
    expect(AI_CTX).not.toMatch(/functions\.invoke/);
  });

  it("no ingest/bridge edge function fetches vpd_targets or custom user bands", () => {
    const fnDir = resolve(ROOT, "supabase/functions");
    const offenders: string[] = [];
    function walk(d: string) {
      let entries: string[] = [];
      try {
        entries = readdirSync(d);
      } catch {
        return;
      }
      for (const name of entries) {
        const p = join(d, name);
        let s;
        try {
          s = statSync(p);
        } catch {
          continue;
        }
        if (s.isDirectory()) walk(p);
        else if (/\.(ts|tsx|js|mjs)$/.test(name)) {
          const src = readFileSync(p, "utf8");
          if (/vpd_targets/i.test(src) || /evaluate_vpd_drift_ewma/i.test(src)) {
            offenders.push(p);
          }
        }
      }
    }
    walk(fnDir);
    expect(offenders).toEqual([]);
  });
});
