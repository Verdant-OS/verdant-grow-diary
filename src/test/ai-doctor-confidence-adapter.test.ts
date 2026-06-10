/**
 * AI Doctor Confidence Adapter — Phase 1 tests.
 *
 * Pure / deterministic. No I/O, no Supabase, no model calls.
 */
import { describe, it, expect } from "vitest";
import {
  calculateAiDoctorConfidence,
  type AiDoctorConfidenceInput,
} from "@/lib/aiDoctorConfidenceAdapter";
import {
  compilePlantContextFromRows,
  type PlantContextPayload,
  type SensorReadingRowLike,
  type GrowEventRowLike,
  type PlantRowLike,
} from "@/lib/aiDoctorContextCompiler";
import {
  generateMultimodalDiagnosisPhase1,
  type Phase1DiagnosisResult,
  type Phase1VisionAnalysisResult,
} from "@/lib/aiDoctorEngine";
import { ALL_GOLDEN_CASES } from "./fixtures/ai-doctor-golden-cases";

const NOW = new Date("2026-06-04T12:00:00Z");
const NOW_MS = NOW.getTime();
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const iso = (offsetMs: number) => new Date(NOW_MS - offsetMs).toISOString();

const PLANT: PlantRowLike = {
  id: "plant-1",
  tent_id: "tent-1",
  grow_id: "grow-1",
  name: "P",
  strain: "Test",
  stage: "veg",
};

function visionGood(): Phase1VisionAnalysisResult {
  return {
    visual_summary: "Clear closeup of healthy fan leaf",
    leaf_observations: ["even green color", "slight tip curl"],
    structural_observations: ["upright posture"],
    color_and_pigmentation: ["mid-green"],
    pest_disease_indicators: [],
    growth_stage_visual_cues: ["mid-veg"],
    image_quality_notes: ["focused, well-lit"],
    image_quality_score: 0.8,
    confidence: 0,
  };
}

function visionPoor(): Phase1VisionAnalysisResult {
  return {
    visual_summary: "Blurry",
    leaf_observations: [],
    structural_observations: [],
    color_and_pigmentation: [],
    pest_disease_indicators: [],
    growth_stage_visual_cues: [],
    image_quality_notes: ["blurry"],
    image_quality_score: 0.1,
    confidence: 0,
  };
}

function liveReading(metric: string, value: number, hoursAgo = 2): SensorReadingRowLike {
  return {
    metric,
    value,
    captured_at: iso(hoursAgo * HOUR),
    source: "live",
  };
}

function staleReading(metric: string, value: number): SensorReadingRowLike {
  return {
    metric,
    value,
    captured_at: iso(2 * DAY),
    source: "live",
    state: "stale",
  };
}

function invalidReading(metric: string, value: number): SensorReadingRowLike {
  return {
    metric,
    value,
    captured_at: iso(2 * HOUR),
    source: "live",
    state: "invalid",
  };
}

function demoReading(metric: string, value: number): SensorReadingRowLike {
  return {
    metric,
    value,
    captured_at: iso(2 * HOUR),
    source: "demo",
  };
}

function csvReading(metric: string, value: number): SensorReadingRowLike {
  return {
    metric,
    value,
    captured_at: iso(2 * HOUR),
    source: "csv",
  };
}

function recentEvent(eventType: string, hoursAgo = 6): GrowEventRowLike {
  return {
    occurred_at: iso(hoursAgo * HOUR),
    event_type: eventType,
    source: "manual",
    note: null,
  };
}

function buildContext(
  sensors: readonly SensorReadingRowLike[],
  events: readonly GrowEventRowLike[],
): PlantContextPayload {
  return compilePlantContextFromRows({
    plant: PLANT,
    growEvents: events,
    sensorReadings: sensors,
    now: NOW,
  });
}

async function diagnose(
  context: PlantContextPayload,
  vision = visionPoor(),
): Promise<Phase1DiagnosisResult> {
  return generateMultimodalDiagnosisPhase1(vision, context);
}

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

describe("calculateAiDoctorConfidence — unit", () => {
  it("clamps score between 0 and 100", async () => {
    const ctx = buildContext([], []);
    const dx = await diagnose(ctx);
    const r = calculateAiDoctorConfidence({ diagnosis: dx, context: ctx });
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });

  it("returns deterministic identical result on repeated calls", async () => {
    const ctx = buildContext(
      [liveReading("temperature_c", 24), liveReading("humidity_pct", 55)],
      [recentEvent("watering")],
    );
    const dx = await diagnose(ctx, visionGood());
    const input: AiDoctorConfidenceInput = {
      diagnosis: dx,
      context: ctx,
      vision: visionGood(),
    };
    const a = calculateAiDoctorConfidence(input);
    const b = calculateAiDoctorConfidence(input);
    expect(a).toEqual(b);
  });

  it("stable-sorts positive_factors, limiting_factors, safety_flags", async () => {
    const ctx = buildContext([], []);
    const dx = await diagnose(ctx);
    const r = calculateAiDoctorConfidence({ diagnosis: dx, context: ctx });
    expect(r.positive_factors).toEqual([...r.positive_factors].sort());
    expect(r.limiting_factors).toEqual([...r.limiting_factors].sort());
    expect(r.safety_flags).toEqual([...r.safety_flags].sort());
  });

  it("caps score at 35 with no trustworthy sensors and no recent events", async () => {
    const ctx = buildContext([], []);
    const dx = await diagnose(ctx, visionGood());
    const r = calculateAiDoctorConfidence({
      diagnosis: dx,
      context: ctx,
      vision: visionGood(),
    });
    expect(r.score).toBeLessThanOrEqual(35);
    expect(r.safety_flags).toContain("weak_context");
    expect(r.safety_flags).toContain("avoid_overdiagnosis");
    expect(r.level === "very_low" || r.level === "low").toBe(true);
  });

  it("caps score at 30 when only stale/invalid readings exist", async () => {
    const ctx = buildContext(
      [
        staleReading("temperature_c", 24),
        invalidReading("humidity_pct", 200),
      ],
      [],
    );
    const dx = await diagnose(ctx, visionGood());
    const r = calculateAiDoctorConfidence({
      diagnosis: dx,
      context: ctx,
      vision: visionGood(),
    });
    expect(r.score).toBeLessThanOrEqual(30);
    expect(r.safety_flags).toContain("stale_or_invalid_readings_present");
    expect(r.source_quality.has_recent_trustworthy_sensor_data).toBe(false);
  });

  it("caps score at 40 when only demo/csv readings exist", async () => {
    const ctx = buildContext(
      [demoReading("temperature_c", 24), csvReading("humidity_pct", 55)],
      [],
    );
    const dx = await diagnose(ctx, visionGood());
    const r = calculateAiDoctorConfidence({
      diagnosis: dx,
      context: ctx,
      vision: visionGood(),
    });
    expect(r.score).toBeLessThanOrEqual(40);
    expect(r.safety_flags).toContain("demo_or_csv_only");
    expect(r.source_quality.demo_count + r.source_quality.csv_count).toBeGreaterThan(0);
    expect(r.source_quality.has_recent_trustworthy_sensor_data).toBe(false);
  });

  it("caps score at 45 when diagnosis has major missing information (>=5)", async () => {
    // Empty context produces many missing_information items.
    const ctx = buildContext([], []);
    const dx = await diagnose(ctx, visionPoor());
    if (dx.missing_information.length < 5) {
      // Some engines may produce fewer items; synthesize the condition explicitly.
      const padded: Phase1DiagnosisResult = {
        ...dx,
        missing_information: Object.freeze([
          ...dx.missing_information,
          "extra-1",
          "extra-2",
          "extra-3",
          "extra-4",
          "extra-5",
        ]) as readonly string[],
      };
      const r = calculateAiDoctorConfidence({
        diagnosis: padded,
        context: ctx,
        vision: visionGood(),
      });
      expect(r.score).toBeLessThanOrEqual(45);
      expect(r.safety_flags).toContain("major_missing_information");
    } else {
      const r = calculateAiDoctorConfidence({
        diagnosis: dx,
        context: ctx,
        vision: visionGood(),
      });
      expect(r.score).toBeLessThanOrEqual(45);
      expect(r.safety_flags).toContain("major_missing_information");
    }
  });

  it("can reach medium/high only with live+manual sensors + events + visual + low missing info", async () => {
    const ctx = buildContext(
      [
        liveReading("temperature_c", 24),
        liveReading("humidity_pct", 55),
        liveReading("vpd_kpa", 1.1),
      ],
      [recentEvent("watering"), recentEvent("feeding", 24)],
    );
    const dx = await diagnose(ctx, visionGood());
    // Force minimal missing_information so high is achievable.
    const trimmed: Phase1DiagnosisResult = {
      ...dx,
      missing_information: Object.freeze([]) as readonly string[],
      evidence: Object.freeze([
        "sensor live: temperature stable",
        "sensor live: humidity stable",
        "recent watering event 6h ago",
      ]) as readonly string[],
      possible_causes: Object.freeze(["mild_under_watering"]) as readonly string[],
    };
    const r = calculateAiDoctorConfidence({
      diagnosis: trimmed,
      context: ctx,
      vision: visionGood(),
    });
    expect(r.score).toBeGreaterThanOrEqual(50);
    expect(["medium", "high"]).toContain(r.level);
    expect(r.source_quality.has_recent_trustworthy_sensor_data).toBe(true);
    expect(r.source_quality.has_recent_grow_events).toBe(true);
    expect(r.source_quality.has_visual_context).toBe(true);
  });

  it('never returns "high" without the full quartet (trustworthy + events + visual + low missing)', async () => {
    // Same as above but with poor vision — must not be "high".
    const ctx = buildContext(
      [liveReading("temperature_c", 24)],
      [recentEvent("watering")],
    );
    const dx = await diagnose(ctx, visionPoor());
    const trimmed: Phase1DiagnosisResult = {
      ...dx,
      missing_information: Object.freeze([]) as readonly string[],
    };
    const r = calculateAiDoctorConfidence({
      diagnosis: trimmed,
      context: ctx,
      vision: visionPoor(),
    });
    expect(r.level).not.toBe("high");
  });

  it("source_quality counts respect each bucket independently", async () => {
    const ctx = buildContext(
      [
        liveReading("temperature_c", 24),
        liveReading("humidity_pct", 55),
        demoReading("vpd_kpa", 1.0),
        csvReading("co2_ppm", 800),
        staleReading("temperature_c", 22),
        invalidReading("humidity_pct", 200),
      ],
      [recentEvent("watering")],
    );
    const dx = await diagnose(ctx, visionGood());
    const r = calculateAiDoctorConfidence({
      diagnosis: dx,
      context: ctx,
      vision: visionGood(),
    });
    expect(r.source_quality.live_count).toBeGreaterThan(0);
    expect(r.source_quality.demo_count).toBeGreaterThan(0);
    expect(r.source_quality.csv_count).toBeGreaterThan(0);
    expect(r.source_quality.stale_count).toBeGreaterThan(0);
    expect(r.source_quality.invalid_count).toBeGreaterThan(0);
    // Demo/csv must not be described as live anywhere.
    expect(r.explanation.toLowerCase()).not.toMatch(/demo.*live|csv.*live/);
  });
});

// ---------------------------------------------------------------------------
// Golden case integration
// ---------------------------------------------------------------------------

describe("calculateAiDoctorConfidence — golden cases", () => {
  for (const golden of ALL_GOLDEN_CASES) {
    it(`${golden.id}: stays conservative and flags weak context`, async () => {
      const now = new Date(golden.now);
      const ctx = compilePlantContextFromRows({
        plant: golden.plant,
        growEvents: golden.growEvents,
        sensorReadings: golden.sensorReadings,
        now,
      });
      const dx = await generateMultimodalDiagnosisPhase1(
        golden.visionData,
        ctx,
      );
      const a = calculateAiDoctorConfidence({
        diagnosis: dx,
        context: ctx,
        vision: golden.visionData,
        now,
      });
      const b = calculateAiDoctorConfidence({
        diagnosis: dx,
        context: ctx,
        vision: golden.visionData,
        now,
      });

      // Deterministic
      expect(a).toEqual(b);

      // Conservative score and level
      expect(a.score).toBeLessThanOrEqual(49);
      expect(["very_low", "low"]).toContain(a.level);
      expect(a.level).not.toBe("high");
      expect(a.level).not.toBe("medium");

      // Some weak-context style flag must be present
      const expectedAnyFlag = [
        "weak_context",
        "no_trustworthy_sensor_data",
        "no_recent_grow_events",
        "demo_or_csv_only",
        "stale_or_invalid_readings_present",
        "major_missing_information",
        "poor_visual_quality",
        "avoid_overdiagnosis",
      ];
      expect(a.safety_flags.some((f) => expectedAnyFlag.includes(f))).toBe(
        true,
      );

      // No demo/csv described as live
      expect(a.explanation.toLowerCase()).not.toMatch(
        /demo.*live|csv.*live|stale.*healthy|invalid.*healthy/,
      );
    });
  }
});
