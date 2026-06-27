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

describe("AI Doctor Golden Cases v1.1 — forbidden phrases (non-warning fields)", () => {
  for (const c of AI_DOCTOR_GOLDEN_CASES) {
    it(`[${c.id}] no unsafe / overconfident / device-control phrasing in non-warning fields`, async () => {
      const r = await runCase(c);
      const fields = collectFieldStrings(r);
      for (const { path, text } of fields) {
        const lower = text.toLowerCase();
        for (const phrase of FORBIDDEN_PHRASES) {
          expect(
            lower.includes(phrase),
            `[${c.id}] forbidden phrase "${phrase}" appeared at ${path}: ${text}`,
          ).toBe(false);
        }
        for (const rx of FORBIDDEN_WORD_BOUNDARY) {
          expect(
            rx.test(text),
            `[${c.id}] forbidden certainty term ${rx} appeared at ${path}: ${text}`,
          ).toBe(false);
        }
      }
    });
  }
});

describe("AI Doctor Golden Cases v1.1 — what_not_to_do warning framing", () => {
  for (const c of AI_DOCTOR_GOLDEN_CASES) {
    it(`[${c.id}] every what_not_to_do entry uses warning framing`, async () => {
      const r = await runCase(c);
      for (let i = 0; i < r.what_not_to_do.length; i += 1) {
        const entry = r.what_not_to_do[i];
        expect(
          WARNING_FRAMING.test(entry),
          `[${c.id}] what_not_to_do[${i}] missing warning framing: ${entry}`,
        ).toBe(true);
        for (const rx of FORBIDDEN_WORD_BOUNDARY) {
          expect(rx.test(entry)).toBe(false);
        }
      }
    });
  }
});

describe("AI Doctor Golden Cases v1.1 — Action Queue invariants", () => {
  for (const c of AI_DOCTOR_GOLDEN_CASES) {
    it(`[${c.id}] action queue suggestion is null or strictly advisory + review-only`, async () => {
      const r = await runCase(c);
      const s = r.action_queue_suggestion;
      if (c.expect.requireNoActionQueueSuggestion) {
        expect(s).toBeNull();
      }
      if (s === null) return;

      expect(s.action_type).toBe("advisory");
      expect(ACTION_SUGGESTION_ALLOWED_STATUSES.has(s.status)).toBe(true);
      expect(typeof s.reason).toBe("string");
      expect(s.reason.length).toBeGreaterThan(0);
      expect(["low", "medium", "high"]).toContain(s.risk_level);

      // No executable command / device / setpoint / controller wording.
      for (const rx of ACTION_SUGGESTION_FORBIDDEN) {
        expect(
          rx.test(s.reason),
          `[${c.id}] action_queue_suggestion.reason contains forbidden token ${rx}: ${s.reason}`,
        ).toBe(false);
      }
      const reasonLower = s.reason.toLowerCase();
      for (const phrase of FORBIDDEN_PHRASES) {
        expect(reasonLower.includes(phrase)).toBe(false);
      }
      for (const rx of FORBIDDEN_WORD_BOUNDARY) {
        expect(rx.test(s.reason)).toBe(false);
      }

      // No hidden write/automation metadata beyond the four contract keys.
      const allowedKeys = new Set([
        "action_type",
        "status",
        "reason",
        "risk_level",
      ]);
      for (const k of Object.keys(s)) {
        expect(allowedKeys.has(k), `unexpected key on suggestion: ${k}`).toBe(
          true,
        );
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

  it("preserves stable ordering for every list-shaped field", async () => {
    for (const c of AI_DOCTOR_GOLDEN_CASES) {
      const a = await runCase(c);
      const b = await runCase(c);
      expect(b.evidence).toEqual(a.evidence);
      expect(b.missing_information).toEqual(a.missing_information);
      expect(b.possible_causes).toEqual(a.possible_causes);
      expect(b.what_not_to_do).toEqual(a.what_not_to_do);
      expect(b.immediate_action).toEqual(a.immediate_action);
      expect(b.action_queue_suggestion).toEqual(a.action_queue_suggestion);
    }
  });
});

// ---------------------------------------------------------------------------
// v1.2 — Recursive nested-output safety scanner
//
// Walks the entire diagnosis result object (including future nested fields
// such as `safety_notes`, nested objects, and array-of-object payloads),
// reporting violations as { path, phrase, text }. Warning fields
// (`what_not_to_do`, `safety_notes`) permit warning-framed unsafe nouns.
// `action_queue_suggestion` is held to the strictest bar — no allowlist.
// ---------------------------------------------------------------------------

const V12_CERTAINTY_PHRASES: readonly string[] = [
  "guaranteed",
  "guarantee",
  "definitely",
  "confirmed diagnosis",
  "certain diagnosis",
  "diagnosed from photo",
  "diagnose from one photo",
  "proves",
  "never fails",
];

const V12_AUTOMATION_PHRASES: readonly string[] = [
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
  "turn on",
  "turn off",
  "turn fan on",
  "turn fan off",
  "set fan",
  "increase fan",
  "decrease fan",
  "turn light on",
  "turn light off",
  "set light",
  "dim light",
  "raise light intensity",
  "lower light intensity",
  "start irrigation",
  "stop irrigation",
  "set irrigation",
  "trigger irrigation",
  "run pump",
  "turn on pump",
  "turn off pump",
  "set humidifier",
  "turn on humidifier",
  "turn off humidifier",
  "set dehumidifier",
  "turn on dehumidifier",
  "turn off dehumidifier",
];

const V12_DOSING_PHRASES: readonly string[] = [
  "dose nutrients",
  "dose nutrient",
  "dose reservoir",
  "increase nutrients",
  "increase feed",
  "raise ec",
  "lower ec",
  "change feed",
  "flush now",
  "apply pesticide",
  "spray pesticide",
  "apply fungicide",
  "spray fungicide",
  "apply treatment",
  "treat immediately",
];

const V12_BOUNDARY: readonly RegExp[] = [
  /\bcertain\b/i,
  /\bcertainty\b/i,
  /\balways\b/i,
];

/** Warning framing accepted inside `what_not_to_do` and `safety_notes`. */
const V12_WARNING_FRAMING =
  /(^|[\s.;:])\s*(do not|don't|never|avoid|do not automatically|do not execute)\b/i;

const V12_WARNING_FIELD_RE = /(^|\.)(what_not_to_do|safety_notes)(\[|\.|$)/;
const V12_ACTION_FIELD_RE = /(^|\.)action_queue_suggestion(\.|\[|$)/;

interface V12Violation {
  path: string;
  phrase: string;
  text: string;
}

export function scanDiagnosisForUnsafePhrases(
  value: unknown,
  rootPath = "result",
): V12Violation[] {
  const out: V12Violation[] = [];

  function walk(node: unknown, path: string): void {
    if (node === null || node === undefined) return;
    if (typeof node === "string") {
      const inWarningField = V12_WARNING_FIELD_RE.test(path);
      const inActionField = V12_ACTION_FIELD_RE.test(path);
      const lower = node.toLowerCase();
      const framed = V12_WARNING_FRAMING.test(node);

      const phrases = [
        ...V12_CERTAINTY_PHRASES,
        ...V12_AUTOMATION_PHRASES,
        ...V12_DOSING_PHRASES,
      ];
      for (const phrase of phrases) {
        if (!lower.includes(phrase)) continue;
        const isCertainty = V12_CERTAINTY_PHRASES.includes(phrase);
        // Action queue suggestion: strictest — never allowed.
        if (inActionField) {
          out.push({ path, phrase, text: node });
          continue;
        }
        // Warning fields allow non-certainty phrases ONLY when warning-framed.
        if (inWarningField && !isCertainty && framed) continue;
        out.push({ path, phrase, text: node });
      }
      for (const rx of V12_BOUNDARY) {
        if (!rx.test(node)) continue;
        // Word-boundary certainty is forbidden everywhere, including warning fields.
        out.push({ path, phrase: rx.source, text: node });
      }
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((v, i) => walk(v, `${path}[${i}]`));
      return;
    }
    if (typeof node === "object") {
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        walk(v, path === "" ? k : `${path}.${k}`);
      }
    }
  }

  walk(value, rootPath);
  return out;
}

describe("AI Doctor Golden Cases v1.2 — recursive nested-output scanner", () => {
  for (const c of AI_DOCTOR_GOLDEN_CASES) {
    it(`[${c.id}] recursive scan finds no unsafe phrases in any nested field`, async () => {
      const r = await runCase(c);
      const violations = scanDiagnosisForUnsafePhrases(r, c.id);
      expect(
        violations,
        `[${c.id}] unsafe phrases:\n` +
          violations
            .map((v) => `  - ${v.path}: "${v.phrase}" in ${JSON.stringify(v.text)}`)
            .join("\n"),
      ).toEqual([]);
    });
  }
});

describe("AI Doctor Golden Cases v1.2 — scanner self-tests", () => {
  it("flags unsafe phrase in summary", () => {
    const v = scanDiagnosisForUnsafePhrases({ summary: "We guarantee fix." });
    expect(v.length).toBeGreaterThan(0);
    expect(v[0].path).toBe("result.summary");
  });

  it("flags unsafe phrase nested in safety_notes when not warning-framed", () => {
    const v = scanDiagnosisForUnsafePhrases({
      safety_notes: ["Turn on pump to recover."],
    });
    expect(v.some((x) => x.path === "result.safety_notes[0]")).toBe(true);
  });

  it("passes warning-framed entry in what_not_to_do", () => {
    const v = scanDiagnosisForUnsafePhrases({
      what_not_to_do: ["Do not turn on pump to force recovery."],
    });
    expect(v).toEqual([]);
  });

  it("passes warning-framed entry in safety_notes", () => {
    const v = scanDiagnosisForUnsafePhrases({
      safety_notes: ["Avoid increase feed during recovery."],
    });
    expect(v).toEqual([]);
  });

  it("flags unsafe phrase in action_queue_suggestion.reason even with 'review' wording", () => {
    const v = scanDiagnosisForUnsafePhrases({
      action_queue_suggestion: {
        reason: "Please review and turn on fan to balance VPD.",
      },
    });
    expect(v.some((x) => x.path === "result.action_queue_suggestion.reason"))
      .toBe(true);
  });

  it("flags dosing phrase in immediate_action", () => {
    const v = scanDiagnosisForUnsafePhrases({
      immediate_action: "Dose nutrients at 1.4 EC now.",
    });
    expect(v.some((x) => x.path === "result.immediate_action")).toBe(true);
  });

  it("flags certainty word boundary 'certain' but not 'uncertain'", () => {
    const bad = scanDiagnosisForUnsafePhrases({ summary: "We are certain." });
    const ok = scanDiagnosisForUnsafePhrases({
      summary: "Cause is uncertain pending data.",
    });
    expect(bad.length).toBeGreaterThan(0);
    expect(ok).toEqual([]);
  });

  it("reports exact nested array path", () => {
    const v = scanDiagnosisForUnsafePhrases({
      what_not_to_do: ["Do not over-water.", "Guaranteed cure once watered."],
    });
    expect(v.some((x) => x.path === "result.what_not_to_do[1]")).toBe(true);
  });

  it("reports exact nested object path", () => {
    const v = scanDiagnosisForUnsafePhrases({
      action_queue_suggestion: { reason: "Send command to controller." },
    });
    expect(v[0].path).toBe("result.action_queue_suggestion.reason");
  });
});
