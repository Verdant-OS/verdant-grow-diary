/**
 * AI Doctor Engine — Phase 1 tests.
 *
 * Pure, deterministic. No real model calls. No Supabase writes.
 * Tests only the new Phase 1 surface; legacy engine surface is covered
 * by the existing ai-doctor-engine.test.ts file.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  executeVisionAnalysisPhase1,
  generateMultimodalDiagnosisPhase1,
  compilePlantContextRowsPhase1,
  type Phase1VisionAnalysisResult,
  type Phase1PlantContextPayload,
} from "../lib/aiDoctorEngine";

const NOW = new Date("2026-06-04T12:00:00Z");
const iso = (offsetMs: number) =>
  new Date(NOW.getTime() - offsetMs).toISOString();

function fakeFile(): File {
  return new File([new Uint8Array([1, 2, 3])], "plant.jpg", {
    type: "image/jpeg",
  });
}

function emptyVision(): Phase1VisionAnalysisResult {
  return {
    visual_summary: "stub",
    leaf_observations: [],
    structural_observations: [],
    color_and_pigmentation: [],
    pest_disease_indicators: [],
    growth_stage_visual_cues: [],
    image_quality_notes: [],
    image_quality_score: 0,
    confidence: 0,
  };
}

function weakContext(): Phase1PlantContextPayload {
  return compilePlantContextRowsPhase1({
    plant: {
      id: "p1",
      tent_id: "t1",
      grow_id: "g1",
      name: "Plant 1",
      strain: "Northern Lights Auto",
      stage: "veg",
    },
    growEvents: [],
    sensorReadings: [],
    now: NOW,
  });
}

function strongContext(): Phase1PlantContextPayload {
  return compilePlantContextRowsPhase1({
    plant: {
      id: "p1",
      tent_id: "t1",
      grow_id: "g1",
      name: "Plant 1",
      strain: "Northern Lights Auto",
      stage: "veg",
    },
    growEvents: [
      {
        occurred_at: iso(2 * 24 * 60 * 60 * 1000),
        event_type: "watering",
        source: "manual",
      },
    ],
    sensorReadings: [
      {
        metric: "temperature_c",
        value: 24,
        captured_at: iso(60_000),
        source: "ecowitt",
      },
      {
        metric: "humidity_pct",
        value: 55,
        captured_at: iso(60_000),
        source: "ecowitt",
      },
    ],
    now: NOW,
  });
}

// ---------------------------------------------------------------------------
// Vision stub
// ---------------------------------------------------------------------------

describe("executeVisionAnalysisPhase1", () => {
  it("rejects a missing image", async () => {
    await expect(
      executeVisionAnalysisPhase1(undefined as unknown as File),
    ).rejects.toThrow(/image file is required/i);
  });

  it("rejects an empty image", async () => {
    const empty = new File([], "empty.jpg", { type: "image/jpeg" });
    await expect(executeVisionAnalysisPhase1(empty)).rejects.toThrow(
      /image file is empty/i,
    );
  });

  it("returns a low-confidence, descriptive-only stub", async () => {
    const r = await executeVisionAnalysisPhase1(fakeFile());
    expect(r.confidence).toBe(0);
    expect(r.image_quality_score).toBe(0);
    expect(r.leaf_observations).toEqual([]);
    expect(r.pest_disease_indicators).toEqual([]);
    expect(r.image_quality_notes.length).toBeGreaterThan(0);
    // No diagnosis-style language in stub output.
    expect(r.visual_summary.toLowerCase()).not.toMatch(
      /diagnos|recommend|increase|decrease/,
    );
  });
});

// ---------------------------------------------------------------------------
// Diagnosis stub
// ---------------------------------------------------------------------------

describe("generateMultimodalDiagnosisPhase1", () => {
  it("flags missing_information when context is weak", async () => {
    const d = await generateMultimodalDiagnosisPhase1(
      emptyVision(),
      weakContext(),
    );
    expect(d.confidence).toBeLessThanOrEqual(0.2);
    expect(d.missing_information.length).toBeGreaterThan(0);
    expect(d.missing_information.join(" ")).toMatch(
      /live or manual sensor readings/i,
    );
  });

  it("does not emit device commands", async () => {
    const d = await generateMultimodalDiagnosisPhase1(
      emptyVision(),
      strongContext(),
    );
    const all = [
      d.summary,
      d.immediate_action,
      d.twenty_four_hour_follow_up,
      d.three_day_recovery_plan,
      ...d.evidence,
      ...d.possible_causes,
    ]
      .join(" ")
      .toLowerCase();
    expect(all).not.toMatch(
      /turn on|turn off|switch on|switch off|setpoint|relay|actuate/,
    );
  });

  it("does not recommend nutrient or irrigation changes from weak evidence", async () => {
    const d = await generateMultimodalDiagnosisPhase1(
      emptyVision(),
      weakContext(),
    );
    const positive = [
      d.summary,
      d.immediate_action,
      d.twenty_four_hour_follow_up,
      d.three_day_recovery_plan,
      ...d.possible_causes,
    ]
      .join(" ")
      .toLowerCase();
    expect(positive).not.toMatch(/increase|decrease|raise|lower/);
    expect(positive).not.toMatch(/add nutrient|feed more|feed less|ec up|ec down/);
    expect(positive).not.toMatch(/water more|water less|irrigat/);
    // what_not_to_do should explicitly warn against these changes.
    const warn = d.what_not_to_do.join(" ").toLowerCase();
    expect(warn).toMatch(/nutrient/);
    expect(warn).toMatch(/irrigation/);
    expect(warn).toMatch(/equipment/);
  });

  it("action_queue_suggestion stays advisory + pending_approval", async () => {
    // Trigger stale/invalid path to get a suggestion.
    const ctx = compilePlantContextRowsPhase1({
      plant: { id: "p1", tent_id: "t1", grow_id: "g1", stage: "veg" },
      growEvents: [],
      sensorReadings: [
        {
          metric: "vpd_kpa",
          value: 1.0,
          captured_at: iso(60_000),
          source: "ecowitt",
          state: "stale",
        },
      ],
      now: NOW,
    });
    const d = await generateMultimodalDiagnosisPhase1(emptyVision(), ctx);
    expect(d.action_queue_suggestion).not.toBeNull();
    expect(d.action_queue_suggestion!.action_type).toBe("advisory");
    expect(d.action_queue_suggestion!.status).toBe("pending_approval");
    expect(d.risk_level).toBe("medium");
  });

  it("is deterministic for identical inputs", async () => {
    const ctx = strongContext();
    const a = await generateMultimodalDiagnosisPhase1(emptyVision(), ctx);
    const b = await generateMultimodalDiagnosisPhase1(emptyVision(), ctx);
    expect(a).toEqual(b);
  });
});

// ---------------------------------------------------------------------------
// Static safety scan for the new Phase 1 surface
// ---------------------------------------------------------------------------

describe("ai-doctor engine Phase 1 — static safety", () => {
  const ENGINE = readFileSync(
    resolve(__dirname, "../lib/aiDoctorEngine.ts"),
    "utf8",
  );
  const COMPILER = readFileSync(
    resolve(__dirname, "../lib/aiDoctorContextCompiler.ts"),
    "utf8",
  );

  it("contains no service_role", () => {
    expect(ENGINE).not.toMatch(/service_role/i);
    expect(COMPILER).not.toMatch(/service_role/i);
  });

  it("contains no bridge token references", () => {
    expect(ENGINE).not.toMatch(/bridge[_-]?token/i);
    expect(COMPILER).not.toMatch(/bridge[_-]?token/i);
  });

  it("performs no supabase writes", () => {
    for (const term of [".insert(", ".update(", ".delete(", ".upsert("]) {
      expect(ENGINE).not.toContain(term);
      expect(COMPILER).not.toContain(term);
    }
  });

  it("does not write to alerts or action_queue", () => {
    expect(ENGINE).not.toMatch(/from\(\s*['"]alerts['"]\s*\)/);
    expect(ENGINE).not.toMatch(/from\(\s*['"]action_queue['"]\s*\)/);
    expect(COMPILER).not.toMatch(/from\(\s*['"]alerts['"]\s*\)/);
    expect(COMPILER).not.toMatch(/from\(\s*['"]action_queue['"]\s*\)/);
  });

  it("contains no device-control strings", () => {
    for (const term of [
      "execute_device",
      "setpoint_write",
      "irrigation_control",
      "light_control",
      "fan_control",
    ]) {
      expect(ENGINE).not.toContain(term);
      expect(COMPILER).not.toContain(term);
    }
  });
});
