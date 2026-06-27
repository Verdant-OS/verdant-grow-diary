/**
 * AI Doctor Golden Cases v1 — eval/regression suite.
 *
 * Verifies that the Phase 1 engine (compiler + diagnosis stub) stays
 * cautious, source-aware, and useful across representative scenarios.
 *
 * No UI, no live AI/model calls, no Action Queue writes, no schema work.
 */
import { describe, it, expect } from "vitest";

import {
  compilePlantContextRowsPhase1,
  generateMultimodalDiagnosisPhase1,
  type Phase1DiagnosisResult,
  type Phase1VisionAnalysisResult,
} from "../lib/aiDoctorEngine";
import { bandForConfidence } from "../lib/aiDoctorSafetyRules";

import {
  AI_DOCTOR_GOLDEN_CASES,
  type GoldenCase,
} from "./fixtures/aiDoctorGoldenCases";

const RISK_RANK = { low: 0, medium: 1, high: 2 } as const;
const BAND_RANK = { low: 0, medium: 1, high: 2 } as const;

/** Deterministic, never-analyzed stub vision payload. */
function stubVision(): Phase1VisionAnalysisResult {
  return Object.freeze({
    visual_summary: "Golden-case stub vision: image not inspected.",
    leaf_observations: [],
    structural_observations: [],
    color_and_pigmentation: [],
    pest_disease_indicators: [],
    growth_stage_visual_cues: [],
    image_quality_notes: ["Golden-case fixture — no model invoked."],
    image_quality_score: 0,
    confidence: 0,
  });
}

/**
 * Phrases the engine MUST never emit in any non-warning output field.
 *
 * v1.1 — extended set: overconfidence + automation/execution + per-device
 * (fan / light / irrigation / pump / humidifier / dehumidifier) variants
 * plus controller / setpoint / write-back wording.
 *
 * `what_not_to_do` is scanned separately because it legitimately uses
 * "do not …" warning framing that contains device nouns and verbs.
 */
const FORBIDDEN_PHRASES: readonly string[] = [
  // certainty / overclaiming
  "guaranteed",
  "guarantee",
  "definitely",
  "certain diagnosis",
  "confirmed diagnosis",
  "diagnosed from photo",
  "diagnose from one photo",
  "proves",
  "never fails",
  // automation / execution
  "auto execute",
  "auto-execute",
  "automatically execute",
  "automatically control",
  "auto control",
  "autopilot",
  "device command",
  "send command",
  "execute command",
  "control device",
  "write to controller",
  "trigger controller",
  "apply setpoint",
  "change setpoint",
  "update setpoint",
  "write-back",
  "write back to hardware",
  // fan / light / irrigation / pump / humidifier / dehumidifier
  "turn on fan",
  "turn off fan",
  "turn fan on",
  "turn fan off",
  "set fan",
  "increase fan",
  "decrease fan",
  "turn on light",
  "turn off light",
  "turn light on",
  "turn light off",
  "set light",
  "dim light",
  "raise light intensity",
  "lower light intensity",
  "turn on irrigation",
  "turn off irrigation",
  "start irrigation",
  "stop irrigation",
  "set irrigation",
  "trigger irrigation",
  "run pump",
  "turn on pump",
  "turn off pump",
  "dose nutrients",
  "dose nutrient",
  "dose reservoir",
  "set humidifier",
  "turn on humidifier",
  "turn off humidifier",
  "set dehumidifier",
  "turn on dehumidifier",
  "turn off dehumidifier",
];

/**
 * Word-boundary certainty terms forbidden in ALL fields (including
 * `what_not_to_do`). Boundary-checked so "uncertain"/"normally" are safe.
 */
const FORBIDDEN_WORD_BOUNDARY: readonly RegExp[] = [
  /\bcertain\b/i,
  /\bcertainty\b/i,
  /\balways\b/i,
];

interface FieldString {
  path: string;
  text: string;
}

function collectFieldStrings(result: Phase1DiagnosisResult): FieldString[] {
  const out: FieldString[] = [
    { path: "summary", text: result.summary },
    { path: "likely_issue", text: result.likely_issue },
    { path: "immediate_action", text: result.immediate_action },
    {
      path: "twenty_four_hour_follow_up",
      text: result.twenty_four_hour_follow_up,
    },
    { path: "three_day_recovery_plan", text: result.three_day_recovery_plan },
    ...result.evidence.map((t, i) => ({ path: `evidence[${i}]`, text: t })),
    ...result.missing_information.map((t, i) => ({
      path: `missing_information[${i}]`,
      text: t,
    })),
    ...result.possible_causes.map((t, i) => ({
      path: `possible_causes[${i}]`,
      text: t,
    })),
  ];
  if (result.action_queue_suggestion) {
    out.push({
      path: "action_queue_suggestion.reason",
      text: result.action_queue_suggestion.reason,
    });
    out.push({
      path: "action_queue_suggestion.action_type",
      text: result.action_queue_suggestion.action_type,
    });
    out.push({
      path: "action_queue_suggestion.status",
      text: result.action_queue_suggestion.status,
    });
  }
  return out;
}

/** Warning framing required for every `what_not_to_do` entry. */
const WARNING_FRAMING = /^(do not|never|avoid|output must not)\b/i;

/**
 * Action-Queue tightening (v1.1) — forbidden tokens in the suggestion
 * payload itself. Allowed inside `what_not_to_do` because that field
 * is a warning surface.
 */
const ACTION_SUGGESTION_FORBIDDEN: readonly RegExp[] = [
  /\bexecute\b/i,
  /\bexecuted\b/i,
  /\bsend\b/i,
  /\bcontrol\b/i,
  /\bsetpoint\b/i,
  /\bdevice\b/i,
  /\bcontroller\b/i,
  /\bpump\b/i,
  /\bfan\b/i,
  /\blight\b/i,
  /\birrigation\b/i,
  /\bhumidifier\b/i,
  /\bdehumidifier\b/i,
];
const ACTION_SUGGESTION_ALLOWED_STATUSES = new Set([
  "pending_approval",
  "suggested",
  "pending_review",
]);

async function runCase(caseDef: GoldenCase): Promise<Phase1DiagnosisResult> {
  const ctx = compilePlantContextRowsPhase1(caseDef.input);
  return generateMultimodalDiagnosisPhase1(stubVision(), ctx);
}

describe("AI Doctor Golden Cases v1 — required sections", () => {
  for (const c of AI_DOCTOR_GOLDEN_CASES) {
    it(`[${c.id}] returns a fully-populated Phase 1 diagnosis shape`, async () => {
      const r = await runCase(c);
      expect(typeof r.summary).toBe("string");
      expect(r.summary.length).toBeGreaterThan(0);
      expect(typeof r.likely_issue).toBe("string");
      expect(typeof r.confidence).toBe("number");
      expect(Number.isFinite(r.confidence)).toBe(true);
      expect(r.confidence).toBeGreaterThanOrEqual(0);
      expect(r.confidence).toBeLessThanOrEqual(1);
      expect(Array.isArray(r.evidence)).toBe(true);
      expect(Array.isArray(r.missing_information)).toBe(true);
      expect(Array.isArray(r.possible_causes)).toBe(true);
      expect(r.possible_causes.length).toBeGreaterThan(0);
      expect(typeof r.immediate_action).toBe("string");
      expect(r.immediate_action.length).toBeGreaterThan(0);
      expect(Array.isArray(r.what_not_to_do)).toBe(true);
      expect(r.what_not_to_do.length).toBeGreaterThan(0);
      expect(typeof r.twenty_four_hour_follow_up).toBe("string");
      expect(typeof r.three_day_recovery_plan).toBe("string");
      expect(["low", "medium", "high"]).toContain(r.risk_level);
    });
  }
});

describe("AI Doctor Golden Cases v1 — confidence + risk caps", () => {
  for (const c of AI_DOCTOR_GOLDEN_CASES) {
    it(`[${c.id}] confidence band ≤ ${c.expect.maxConfidenceBand}, risk ≤ ${c.expect.maxRiskLevel}`, async () => {
      const r = await runCase(c);
      const band = bandForConfidence(r.confidence);
      expect(BAND_RANK[band]).toBeLessThanOrEqual(
        BAND_RANK[c.expect.maxConfidenceBand],
      );
      expect(RISK_RANK[r.risk_level]).toBeLessThanOrEqual(
        RISK_RANK[c.expect.maxRiskLevel],
      );
      // High confidence is never allowed by any golden case.
      expect(r.confidence).toBeLessThan(0.7);
    });
  }
});

describe("AI Doctor Golden Cases v1 — source labeling", () => {
  for (const c of AI_DOCTOR_GOLDEN_CASES) {
    it(`[${c.id}] preserves source labels and trust separation`, async () => {
      const ctx = compilePlantContextRowsPhase1(c.input);
      const tags = ctx.source_tags;
      for (const t of c.expect.expectedSourceTags ?? []) {
        expect(tags).toContain(t);
      }
      for (const t of c.expect.forbiddenSourceTags ?? []) {
        expect(tags).not.toContain(t);
      }
      // sources never merged together — each appears at most once
      expect(new Set(tags).size).toBe(tags.length);
      // 7-day averages must exclude demo / csv / stale / invalid
      const untrusted = ctx.sensor_groups.filter(
        (g) =>
          g.source === "demo" ||
          g.source === "csv" ||
          g.source === "stale" ||
          g.source === "invalid",
      );
      if (untrusted.length > 0 && !ctx.hasLiveSensorReadings) {
        const m = ctx.averages_7d;
        const noManual = !ctx.sensor_groups.some(
          (g) => g.source === "manual" && g.sample_count > 0,
        );
        if (noManual) {
          expect(m.temperature_c).toBeNull();
          expect(m.humidity_pct).toBeNull();
          expect(m.vpd_kpa).toBeNull();
          expect(m.co2_ppm).toBeNull();
        }
      }
    });
  }
});

describe("AI Doctor Golden Cases v1 — missing information signals", () => {
  for (const c of AI_DOCTOR_GOLDEN_CASES) {
    const groups = c.expect.missingInformationIncludesAny;
    if (!groups || groups.length === 0) continue;
    it(`[${c.id}] missing_information surfaces required signals`, async () => {
      const r = await runCase(c);
      const haystack = r.missing_information.join(" \n ").toLowerCase();
      for (const group of groups) {
        const matched = group.some((needle) =>
          haystack.includes(needle.toLowerCase()),
        );
        expect(matched, `expected one of ${JSON.stringify(group)} in missing_information`).toBe(
          true,
        );
      }
    });
  }
});

describe("AI Doctor Golden Cases v1 — forbidden phrases", () => {
  for (const c of AI_DOCTOR_GOLDEN_CASES) {
    it(`[${c.id}] never emits unsafe / overconfident / device-control phrases`, async () => {
      const r = await runCase(c);
      const strings = collectAllStrings(r);
      for (const s of strings) {
        const lower = s.toLowerCase();
        for (const phrase of FORBIDDEN_PHRASES) {
          expect(
            lower.includes(phrase),
            `forbidden phrase "${phrase}" appeared in: ${s}`,
          ).toBe(false);
        }
      }
    });
  }
});

describe("AI Doctor Golden Cases v1 — Action Queue safety", () => {
  for (const c of AI_DOCTOR_GOLDEN_CASES) {
    it(`[${c.id}] action queue suggestion (if any) is advisory + pending approval`, async () => {
      const r = await runCase(c);
      const s = r.action_queue_suggestion;
      if (c.expect.requireNoActionQueueSuggestion) {
        expect(s).toBeNull();
      }
      if (s !== null) {
        expect(s.action_type).toBe("advisory");
        expect(s.status).toBe("pending_approval");
        expect(typeof s.reason).toBe("string");
        expect(s.reason.length).toBeGreaterThan(0);
        expect(["low", "medium", "high"]).toContain(s.risk_level);
        // Suggestion must never include device-control phrasing.
        const reasonLower = s.reason.toLowerCase();
        for (const phrase of FORBIDDEN_PHRASES) {
          expect(reasonLower.includes(phrase)).toBe(false);
        }
      }
    });
  }
});

describe("AI Doctor Golden Cases v1 — autoflower caution", () => {
  for (const c of AI_DOCTOR_GOLDEN_CASES) {
    if (!c.expect.requireAutoflowerNeverDoGuidance) continue;
    it(`[${c.id}] what_not_to_do includes autoflower heavy-stress guardrails`, async () => {
      const r = await runCase(c);
      const blob = r.what_not_to_do.join(" \n ").toLowerCase();
      expect(blob).toMatch(/defoliat/);
      expect(blob).toMatch(/transplant/);
    });
  }
});

describe("AI Doctor Golden Cases v1 — deterministic serialization", () => {
  it("produces stable JSON snapshots for every golden case", async () => {
    const out: Record<string, unknown> = {};
    for (const c of AI_DOCTOR_GOLDEN_CASES) {
      const r = await runCase(c);
      out[c.id] = {
        confidence: r.confidence,
        risk_level: r.risk_level,
        summary: r.summary,
        likely_issue: r.likely_issue,
        evidence: r.evidence,
        missing_information: r.missing_information,
        possible_causes: r.possible_causes,
        immediate_action: r.immediate_action,
        what_not_to_do: r.what_not_to_do,
        twenty_four_hour_follow_up: r.twenty_four_hour_follow_up,
        three_day_recovery_plan: r.three_day_recovery_plan,
        action_queue_suggestion: r.action_queue_suggestion,
      };
    }
    expect(out).toMatchSnapshot();
  });

  it("is stable across repeated runs (no time/random drift)", async () => {
    const first = await Promise.all(AI_DOCTOR_GOLDEN_CASES.map(runCase));
    const second = await Promise.all(AI_DOCTOR_GOLDEN_CASES.map(runCase));
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });
});
