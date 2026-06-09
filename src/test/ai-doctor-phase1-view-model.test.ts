/**
 * AI Doctor Phase 1 View Model — tests.
 * Pure / deterministic. No I/O, no Supabase, no model calls.
 */
import { describe, it, expect } from "vitest";
import { buildAiDoctorPhase1ViewModel } from "@/lib/aiDoctorPhase1ViewModel";
import {
  calculateAiDoctorConfidence,
  type AiDoctorConfidenceResult,
  type AiDoctorConfidenceSourceQuality,
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
  id: "plant-vm-1",
  tent_id: "tent-vm-1",
  grow_id: "grow-vm-1",
  name: "VM Plant",
  strain: "Test Strain",
  stage: "veg",
};

function visionGood(): Phase1VisionAnalysisResult {
  return {
    visual_summary: "Clear closeup",
    leaf_observations: ["even green"],
    structural_observations: ["upright"],
    color_and_pigmentation: ["mid-green"],
    pest_disease_indicators: [],
    growth_stage_visual_cues: ["mid-veg"],
    image_quality_notes: ["focused"],
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

function live(metric: string, value: number, hoursAgo = 2): SensorReadingRowLike {
  return { metric, value, captured_at: iso(hoursAgo * HOUR), source: "live" };
}
function manual(metric: string, value: number, hoursAgo = 4): SensorReadingRowLike {
  return { metric, value, captured_at: iso(hoursAgo * HOUR), source: "manual" };
}
function stale(metric: string, value: number): SensorReadingRowLike {
  return { metric, value, captured_at: iso(2 * DAY), source: "live", state: "stale" };
}
function invalid(metric: string, value: number): SensorReadingRowLike {
  return { metric, value, captured_at: iso(2 * HOUR), source: "live", state: "invalid" };
}
function demo(metric: string, value: number): SensorReadingRowLike {
  return { metric, value, captured_at: iso(2 * HOUR), source: "demo" };
}
function csv(metric: string, value: number): SensorReadingRowLike {
  return { metric, value, captured_at: iso(2 * HOUR), source: "csv" };
}
function ev(type: string, hoursAgo = 6): GrowEventRowLike {
  return { occurred_at: iso(hoursAgo * HOUR), event_type: type, source: "manual", note: null };
}

function buildCtx(s: readonly SensorReadingRowLike[], e: readonly GrowEventRowLike[]): PlantContextPayload {
  return compilePlantContextFromRows({ plant: PLANT, growEvents: e, sensorReadings: s, now: NOW });
}

async function pipeline(
  s: readonly SensorReadingRowLike[],
  e: readonly GrowEventRowLike[],
  v: Phase1VisionAnalysisResult = visionPoor(),
) {
  const context = buildCtx(s, e);
  const diagnosis = await generateMultimodalDiagnosisPhase1(v, context);
  const confidence = calculateAiDoctorConfidence({
    diagnosis,
    context,
    vision: v,
  });
  const vm = buildAiDoctorPhase1ViewModel({
    diagnosis,
    confidence,
    context,
    vision: v,
    now: NOW,
  });
  return { context, diagnosis, confidence, vm };
}

const FORBIDDEN_COPY = [
  "execute",
  "run command",
  "turn on",
  "turn off",
  "set fan",
  "set light",
  "dose",
  "flush immediately",
  "guaranteed",
  "definitely",
  "certainly",
];

function gatherAllVmText(vm: ReturnType<typeof buildAiDoctorPhase1ViewModel>): string {
  return [
    vm.summaryCard.title,
    vm.summaryCard.summary,
    vm.summaryCard.likely_issue,
    vm.summaryCard.confidence_label,
    vm.summaryCard.confidence_explanation,
    ...vm.summaryCard.status_badges,
    ...vm.evidencePanel.evidence_items,
    ...vm.evidencePanel.context_items,
    ...vm.evidencePanel.source_quality_items,
    ...vm.evidencePanel.limitations,
    ...vm.missingInfoPanel.items,
    vm.recommendationsPanel.immediate_action,
    vm.recommendationsPanel.twenty_four_hour_follow_up,
    vm.recommendationsPanel.three_day_recovery_plan,
    ...vm.recommendationsPanel.what_not_to_do,
    ...vm.recommendationsPanel.monitoring_priorities,
    vm.actionQueuePanel.label,
    vm.actionQueuePanel.reason,
    vm.actionQueuePanel.disabled_reason ?? "",
    vm.safetyPanel.automation_warning,
    vm.safetyPanel.overdiagnosis_warning ?? "",
    vm.safetyPanel.source_truth_warning ?? "",
    ...vm.safetyPanel.safety_flags,
  ]
    .join(" \n ")
    .toLowerCase();
}

function expectNoForbiddenCopy(vm: ReturnType<typeof buildAiDoctorPhase1ViewModel>) {
  const all = gatherAllVmText(vm);
  for (const phrase of FORBIDDEN_COPY) {
    expect(all, `forbidden copy found: ${phrase}`).not.toContain(phrase);
  }
}

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

describe("buildAiDoctorPhase1ViewModel — unit", () => {
  it("maps confidence labels for all levels", () => {
    const baseSq: AiDoctorConfidenceSourceQuality = {
      live_count: 0,
      manual_count: 0,
      csv_count: 0,
      demo_count: 0,
      stale_count: 0,
      invalid_count: 0,
      has_recent_trustworthy_sensor_data: false,
      has_recent_grow_events: false,
      has_visual_context: false,
    };
    const baseDx: Phase1DiagnosisResult = {
      summary: "s",
      likely_issue: "",
      confidence: 0.1,
      evidence: [],
      missing_information: [],
      possible_causes: [],
      immediate_action: "Observe.",
      what_not_to_do: [],
      twenty_four_hour_follow_up: "",
      three_day_recovery_plan: "",
      risk_level: "low",
      action_queue_suggestion: null,
    };
    const ctx = buildCtx([], []);
    const cases: Array<["very_low" | "low" | "medium" | "high", string]> = [
      ["very_low", "Very low confidence"],
      ["low", "Low confidence"],
      ["medium", "Medium confidence"],
      ["high", "High confidence"],
    ];
    for (const [level, label] of cases) {
      const confidence: AiDoctorConfidenceResult = {
        score: level === "very_low" ? 10 : level === "low" ? 30 : level === "medium" ? 60 : 80,
        level,
        explanation: "x",
        positive_factors: [],
        limiting_factors: [],
        source_quality:
          level === "high"
            ? {
                ...baseSq,
                live_count: 2,
                has_recent_trustworthy_sensor_data: true,
                has_visual_context: true,
                has_recent_grow_events: true,
              }
            : baseSq,
        safety_flags: [],
      };
      const altCtx =
        level === "high"
          ? compilePlantContextFromRows({
              plant: PLANT,
              growEvents: [ev("watering")],
              sensorReadings: [live("temperature_c", 24)],
              now: NOW,
            })
          : ctx;
      const vm = buildAiDoctorPhase1ViewModel({
        diagnosis: baseDx,
        confidence,
        context: altCtx,
        vision: level === "high" ? visionGood() : undefined,
        now: NOW,
      });
      expect(vm.summaryCard.confidence_label).toBe(label);
    }
  });

  it("stable-sorts badges, evidence, limitations, missing info, and flags", async () => {
    const { vm } = await pipeline(
      [stale("temperature_c", 22), demo("vpd_kpa", 1.0)],
      [],
      visionPoor(),
    );
    const sorted = (a: readonly string[]) => [...a].sort();
    expect(vm.summaryCard.status_badges).toEqual(sorted(vm.summaryCard.status_badges));
    expect(vm.evidencePanel.evidence_items).toEqual(sorted(vm.evidencePanel.evidence_items));
    expect(vm.evidencePanel.limitations).toEqual(sorted(vm.evidencePanel.limitations));
    expect(vm.missingInfoPanel.items).toEqual(sorted(vm.missingInfoPanel.items));
    expect(vm.safetyPanel.safety_flags).toEqual(sorted(vm.safetyPanel.safety_flags));
  });

  it("renders source quality items for each bucket and never describes demo/csv as live", async () => {
    const { vm } = await pipeline(
      [
        live("temperature_c", 24),
        manual("humidity_pct", 55),
        demo("vpd_kpa", 1.0),
        csv("co2_ppm", 800),
        stale("temperature_c", 22),
        invalid("humidity_pct", 200),
      ],
      [ev("watering")],
      visionGood(),
    );
    const text = vm.evidencePanel.source_quality_items.join("\n").toLowerCase();
    expect(text).toContain("live");
    expect(text).toContain("manual");
    expect(text).toContain("csv");
    expect(text).toContain("demo");
    expect(text).toContain("stale");
    expect(text).toContain("invalid");
    expect(text).not.toMatch(/demo.*live|csv.*live/);
    // Stale/invalid never as healthy
    const all = gatherAllVmText(vm);
    expect(all).not.toMatch(/stale.*healthy|invalid.*healthy/);
  });

  it("missing info severity buckets: none / low / medium / high", () => {
    const ctx = buildCtx([], []);
    const baseDx: Phase1DiagnosisResult = {
      summary: "s",
      likely_issue: "",
      confidence: 0.1,
      evidence: [],
      missing_information: [],
      possible_causes: [],
      immediate_action: "",
      what_not_to_do: [],
      twenty_four_hour_follow_up: "",
      three_day_recovery_plan: "",
      risk_level: "low",
      action_queue_suggestion: null,
    };
    const baseConf: AiDoctorConfidenceResult = {
      score: 20,
      level: "very_low",
      explanation: "x",
      positive_factors: [],
      limiting_factors: [],
      source_quality: {
        live_count: 0,
        manual_count: 0,
        csv_count: 0,
        demo_count: 0,
        stale_count: 0,
        invalid_count: 0,
        has_recent_trustworthy_sensor_data: false,
        has_recent_grow_events: false,
        has_visual_context: false,
      },
      safety_flags: [],
    };
    const sizes: Array<[number, "none" | "low" | "medium" | "high"]> = [
      [0, "none"],
      [2, "low"],
      [4, "medium"],
      [6, "high"],
    ];
    for (const [n, expected] of sizes) {
      const items = Array.from({ length: n }, (_, i) => `m-${i}`);
      const vm = buildAiDoctorPhase1ViewModel({
        diagnosis: { ...baseDx, missing_information: items },
        confidence: baseConf,
        context: ctx,
        now: NOW,
      });
      expect(vm.missingInfoPanel.severity).toBe(expected);
      expect(vm.missingInfoPanel.has_missing_info).toBe(n > 0);
    }
  });

  it("action queue panel is advisory + approval-required, never executable", async () => {
    // Force an advisory suggestion via override.
    const ctx = buildCtx([live("temperature_c", 24)], [ev("watering")]);
    const dx = await generateMultimodalDiagnosisPhase1(visionGood(), ctx);
    const dxWithSuggestion: Phase1DiagnosisResult = {
      ...dx,
      action_queue_suggestion: {
        action_type: "advisory",
        status: "pending_approval",
        reason: "Recheck readings.",
        risk_level: "low",
      },
    };
    const confidence = calculateAiDoctorConfidence({
      diagnosis: dxWithSuggestion,
      context: ctx,
      vision: visionGood(),
    });
    const vm = buildAiDoctorPhase1ViewModel({
      diagnosis: dxWithSuggestion,
      confidence,
      context: ctx,
      vision: visionGood(),
      now: NOW,
    });
    expect(vm.actionQueuePanel.should_show).toBe(true);
    expect(vm.actionQueuePanel.status).toBe("pending_approval");
    expect(vm.actionQueuePanel.action_type).toBe("advisory");
    expect(vm.actionQueuePanel.label).toMatch(/advisory/i);
    expect(vm.actionQueuePanel.reason.toLowerCase()).toContain("approval");
    expectNoForbiddenCopy(vm);
  });

  it("low confidence disables action conversion via disabled_reason", async () => {
    const ctx = buildCtx([], []);
    const dx = await generateMultimodalDiagnosisPhase1(visionPoor(), ctx);
    const dxWithSuggestion: Phase1DiagnosisResult = {
      ...dx,
      action_queue_suggestion: {
        action_type: "advisory",
        status: "pending_approval",
        reason: "x",
        risk_level: "low",
      },
    };
    const confidence = calculateAiDoctorConfidence({
      diagnosis: dxWithSuggestion,
      context: ctx,
      vision: visionPoor(),
    });
    const vm = buildAiDoctorPhase1ViewModel({
      diagnosis: dxWithSuggestion,
      confidence,
      context: ctx,
      now: NOW,
    });
    expect(["very_low", "low"]).toContain(
      vm.debugMeta.displayed_confidence_level,
    );
    expect(vm.actionQueuePanel.disabled_reason).toMatch(/more context/i);
  });

  it("high confidence display is gated by trustworthy quartet", () => {
    const ctx = buildCtx([live("temperature_c", 24)], [ev("watering")]);
    const dx: Phase1DiagnosisResult = {
      summary: "",
      likely_issue: "",
      confidence: 0.8,
      evidence: [],
      missing_information: [],
      possible_causes: [],
      immediate_action: "",
      what_not_to_do: [],
      twenty_four_hour_follow_up: "",
      three_day_recovery_plan: "",
      risk_level: "low",
      action_queue_suggestion: null,
    };
    // Falsely claim "high" but missing visual context -> must downgrade to medium.
    const conf: AiDoctorConfidenceResult = {
      score: 85,
      level: "high",
      explanation: "x",
      positive_factors: [],
      limiting_factors: [],
      source_quality: {
        live_count: 1,
        manual_count: 0,
        csv_count: 0,
        demo_count: 0,
        stale_count: 0,
        invalid_count: 0,
        has_recent_trustworthy_sensor_data: true,
        has_recent_grow_events: true,
        has_visual_context: false,
      },
      safety_flags: [],
    };
    const vm = buildAiDoctorPhase1ViewModel({
      diagnosis: dx,
      confidence: conf,
      context: ctx,
      vision: visionPoor(),
      now: NOW,
    });
    expect(vm.debugMeta.raw_confidence_level).toBe("high");
    expect(vm.debugMeta.displayed_confidence_level).toBe("medium");
    expect(vm.summaryCard.confidence_label).toBe("Medium confidence");

    // With full quartet -> high stays.
    const conf2: AiDoctorConfidenceResult = {
      ...conf,
      source_quality: { ...conf.source_quality, has_visual_context: true },
    };
    const vm2 = buildAiDoctorPhase1ViewModel({
      diagnosis: dx,
      confidence: conf2,
      context: ctx,
      vision: visionGood(),
      now: NOW,
    });
    expect(vm2.debugMeta.displayed_confidence_level).toBe("high");
    expect(vm2.summaryCard.confidence_label).toBe("High confidence");
  });

  it("always emits the automation warning", async () => {
    const { vm } = await pipeline([live("temperature_c", 24)], [ev("watering")], visionGood());
    expect(vm.safetyPanel.automation_warning.toLowerCase()).toMatch(
      /does not control equipment/,
    );
  });

  it("source_truth_warning appears for demo/csv-only and for stale/invalid", async () => {
    const a = await pipeline([demo("temperature_c", 24), csv("humidity_pct", 55)], []);
    expect(a.vm.safetyPanel.source_truth_warning).not.toBeNull();
    expect(a.vm.safetyPanel.source_truth_warning!.toLowerCase()).toContain("demo");

    const b = await pipeline([stale("temperature_c", 22), invalid("humidity_pct", 200)], []);
    expect(b.vm.safetyPanel.source_truth_warning).not.toBeNull();
    expect(b.vm.safetyPanel.source_truth_warning!.toLowerCase()).toContain("stale");
  });

  it("is deterministic on repeated runs", async () => {
    const a = await pipeline(
      [live("temperature_c", 24), manual("humidity_pct", 55)],
      [ev("watering")],
      visionGood(),
    );
    const b = await pipeline(
      [live("temperature_c", 24), manual("humidity_pct", 55)],
      [ev("watering")],
      visionGood(),
    );
    expect(a.vm).toEqual(b.vm);
  });

  it("never contains forbidden device-control copy", async () => {
    const { vm } = await pipeline([], []);
    expectNoForbiddenCopy(vm);
  });
});

// ---------------------------------------------------------------------------
// Golden-case integration
// ---------------------------------------------------------------------------

describe("buildAiDoctorPhase1ViewModel — golden cases", () => {
  for (const golden of ALL_GOLDEN_CASES) {
    it(`${golden.id}: low/very-low display + overdiagnosis + safe copy`, async () => {
      const now = new Date(golden.now);
      const context = compilePlantContextFromRows({
        plant: golden.plant,
        growEvents: golden.growEvents,
        sensorReadings: golden.sensorReadings,
        now,
      });
      const diagnosis = await generateMultimodalDiagnosisPhase1(
        golden.visionData,
        context,
      );
      const confidence = calculateAiDoctorConfidence({
        diagnosis,
        context,
        vision: golden.visionData,
        now,
      });
      const a = buildAiDoctorPhase1ViewModel({
        diagnosis,
        confidence,
        context,
        vision: golden.visionData,
        now,
      });
      const b = buildAiDoctorPhase1ViewModel({
        diagnosis,
        confidence,
        context,
        vision: golden.visionData,
        now,
      });
      expect(a).toEqual(b); // deterministic

      // Low / very low display
      expect(["very_low", "low"]).toContain(
        a.debugMeta.displayed_confidence_level,
      );
      expect(a.summaryCard.confidence_label).toMatch(/low/i);

      // Overdiagnosis warning
      expect(a.safetyPanel.overdiagnosis_warning).not.toBeNull();

      // Action queue panel is either hidden, or advisory+approval-required+disabled.
      if (a.actionQueuePanel.should_show) {
        expect(a.actionQueuePanel.action_type).toBe("advisory");
        expect(a.actionQueuePanel.status).toBe("pending_approval");
        expect(a.actionQueuePanel.reason.toLowerCase()).toContain("approval");
      }
      expect(a.actionQueuePanel.disabled_reason).not.toBeNull();

      // Forbidden copy never appears
      expectNoForbiddenCopy(a);

      // Demo/csv only must surface source_truth_warning + no live-data claim
      const sq = a.debugMeta.source_counts;
      const demoOrCsvOnly =
        !sq.has_recent_trustworthy_sensor_data &&
        sq.stale_count === 0 &&
        sq.invalid_count === 0 &&
        (sq.demo_count > 0 || sq.csv_count > 0);
      if (demoOrCsvOnly) {
        expect(a.safetyPanel.source_truth_warning).not.toBeNull();
        const text = gatherAllVmText(a);
        expect(text).not.toMatch(/demo.*live|csv.*live/);
        expect(text).not.toMatch(/live data available/);
      }

      // Stale/invalid only must not be claimed healthy/stable
      const staleOrInvalidOnly =
        !sq.has_recent_trustworthy_sensor_data &&
        (sq.stale_count > 0 || sq.invalid_count > 0) &&
        sq.demo_count === 0 &&
        sq.csv_count === 0;
      if (staleOrInvalidOnly) {
        expect(a.safetyPanel.source_truth_warning).not.toBeNull();
        const text = gatherAllVmText(a);
        expect(text).not.toMatch(
          /stale.*healthy|invalid.*healthy|stale.*stable|invalid.*stable/,
        );
      }
    });
  }
});
