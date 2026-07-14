/**
 * AI Doctor Output Evaluation — Commit 1 unit tests (contract / shape).
 *
 * Pure & deterministic. No I/O, no Supabase, no model calls. Exercises the
 * required-field/shape rules, deterministic finding ordering, determinism
 * across repeated runs, input immutability, and malformed-input tolerance.
 */
import { describe, it, expect } from "vitest";
import {
  evaluateAiDoctorOutput,
  AI_DOCTOR_OUTPUT_CONTRACT_VERSION,
  type AiDoctorOutputEvaluationInput,
  type AiDoctorEvaluationCode,
} from "@/lib/aiDoctorOutputEvaluation";
import {
  compilePlantContextFromRows,
  type PlantContextPayload,
} from "@/lib/aiDoctorContextCompiler";
import type { AiDoctorContextResult } from "@/lib/aiDoctorContextRules";
import type { Phase1DiagnosisResult } from "@/lib/aiDoctorEngine";

// ---------------------------------------------------------------------------
// Builders — real context via the compiler; readiness as a typed literal.
// ---------------------------------------------------------------------------

const NOW = new Date("2026-06-04T12:00:00Z");
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const isoAgo = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

/**
 * Baseline context that BACKS the baseline valid result's evidence: a recent
 * watering event and a usable manual humidity snapshot. This keeps the "valid
 * passes" contract intact once evidence-integrity rules run.
 */
function makeContext(): PlantContextPayload {
  return compilePlantContextFromRows({
    plant: {
      id: "plant-eval-1",
      tent_id: "tent-eval-1",
      grow_id: "grow-eval-1",
      name: "Eval Plant",
      strain: "Northern Lights Auto",
      stage: "veg",
    },
    growEvents: [
      {
        occurred_at: isoAgo(2 * DAY_MS),
        event_type: "watering",
        source: "manual",
        note: "watered lightly",
      },
    ],
    sensorReadings: [
      {
        metric: "humidity_pct",
        value: 58,
        captured_at: isoAgo(3 * HOUR_MS),
        source: "manual",
      },
    ],
    now: NOW,
  });
}

/** Context with only stale/invalid telemetry (no trustworthy sources). */
function makeStaleInvalidContext(): PlantContextPayload {
  return compilePlantContextFromRows({
    plant: { id: "p", tent_id: "t", grow_id: "g", name: "P", strain: "Auto", stage: "veg" },
    growEvents: [],
    sensorReadings: [
      {
        metric: "temperature_c",
        value: 99,
        captured_at: isoAgo(2 * HOUR_MS),
        source: "ecowitt",
        state: "stale",
      },
      {
        metric: "humidity_pct",
        value: -5,
        captured_at: isoAgo(3 * HOUR_MS),
        source: "ecowitt",
        state: "invalid",
      },
    ],
    now: NOW,
  });
}

/** Context with only demo + csv telemetry (never live, never trustworthy). */
function makeDemoCsvContext(): PlantContextPayload {
  return compilePlantContextFromRows({
    plant: { id: "p", tent_id: "t", grow_id: "g", name: "P", strain: "Auto", stage: "veg" },
    growEvents: [],
    sensorReadings: [
      { metric: "temperature_c", value: 24, captured_at: isoAgo(30 * 60 * 1000), source: "demo" },
      { metric: "vpd_kpa", value: 1.1, captured_at: isoAgo(2 * DAY_MS), source: "csv" },
    ],
    now: NOW,
  });
}

function makeReadiness(
  readiness: AiDoctorContextResult["readiness"] = "strong",
): AiDoctorContextResult {
  return {
    readiness,
    missing: [],
    evidence: ["plant-profile", "stage"],
    counts: {
      recentEvents: 0,
      recentWateringOrFeeding: 0,
      recentManualSnapshots: 0,
      recentWarnings: 0,
    },
    latest: { manualSnapshotAt: null },
    safeNextStep: "Ready for a cautious AI Doctor review.",
    diagnosisClaimed: false,
  };
}

function makeValidResult(): Phase1DiagnosisResult {
  return {
    summary: "Canopy looks generally healthy; no urgent concern identified.",
    likely_issue: "",
    confidence: 0.25,
    evidence: ["Recent watering entry logged 2 days ago."],
    missing_information: ["No manual sensor snapshot in the last 48 hours."],
    possible_causes: ["Normal variation for this stage."],
    immediate_action: "Observe and re-check in 24 hours before changing anything.",
    what_not_to_do: ["Do not change the feeding schedule based on a single reading."],
    twenty_four_hour_follow_up: "Check leaf turgor and take a clear photo tomorrow.",
    three_day_recovery_plan:
      "Continue current routine; note any new symptoms across the next three checkpoints.",
    risk_level: "low",
    action_queue_suggestion: null,
  };
}

function makeInput(
  result: Phase1DiagnosisResult,
  readiness: AiDoctorContextResult["readiness"] = "strong",
): AiDoctorOutputEvaluationInput {
  return {
    result,
    context: makeContext(),
    readiness: makeReadiness(readiness),
  };
}

function codesOf(findings: readonly { code: AiDoctorEvaluationCode }[]): AiDoctorEvaluationCode[] {
  return findings.map((f) => f.code);
}

function deepFreeze<T>(obj: T): T {
  if (obj && typeof obj === "object") {
    for (const key of Object.keys(obj as Record<string, unknown>)) {
      deepFreeze((obj as Record<string, unknown>)[key]);
    }
    Object.freeze(obj);
  }
  return obj;
}

// ---------------------------------------------------------------------------
// Valid path
// ---------------------------------------------------------------------------

describe("evaluateAiDoctorOutput — valid contract", () => {
  it("a complete, well-formed result passes with no findings", () => {
    const evaluation = evaluateAiDoctorOutput(makeInput(makeValidResult()));
    expect(evaluation.status).toBe("pass");
    expect(evaluation.findings).toEqual([]);
    expect(evaluation.errorCount).toBe(0);
    expect(evaluation.warningCount).toBe(0);
    expect(evaluation.infoCount).toBe(0);
    expect(evaluation.contractVersion).toBe(AI_DOCTOR_OUTPUT_CONTRACT_VERSION);
  });

  it("a valid advisory action_queue_suggestion passes", () => {
    const result = makeValidResult();
    result.action_queue_suggestion = {
      action_type: "advisory",
      status: "pending_approval",
      reason: "Consider reviewing recent watering cadence with a grower.",
      risk_level: "low",
    };
    const evaluation = evaluateAiDoctorOutput(makeInput(result));
    expect(evaluation.status).toBe("pass");
    expect(evaluation.findings).toEqual([]);
  });

  it("an empty likely_issue is allowed (weak context ⇒ no certain issue)", () => {
    const result = makeValidResult();
    result.likely_issue = "";
    const evaluation = evaluateAiDoctorOutput(makeInput(result));
    expect(evaluation.status).toBe("pass");
  });
});

// ---------------------------------------------------------------------------
// Required-field / shape failures
// ---------------------------------------------------------------------------

describe("evaluateAiDoctorOutput — required fields", () => {
  it("flags a missing required field", () => {
    const result = makeValidResult() as unknown as Record<string, unknown>;
    delete result.summary;
    const evaluation = evaluateAiDoctorOutput(
      makeInput(result as unknown as Phase1DiagnosisResult),
    );
    expect(evaluation.status).toBe("fail");
    expect(codesOf(evaluation.findings)).toContain("required_field_missing");
    expect(
      evaluation.findings.some((f) => f.code === "required_field_missing" && f.field === "summary"),
    ).toBe(true);
  });

  it("flags an empty required text field", () => {
    const result = makeValidResult();
    result.immediate_action = "   ";
    const evaluation = evaluateAiDoctorOutput(makeInput(result));
    expect(evaluation.status).toBe("fail");
    expect(
      evaluation.findings.some(
        (f) => f.code === "required_field_empty" && f.field === "immediate_action",
      ),
    ).toBe(true);
  });

  it("flags an empty what_not_to_do array", () => {
    const result = makeValidResult();
    result.what_not_to_do = [];
    const evaluation = evaluateAiDoctorOutput(makeInput(result));
    expect(evaluation.status).toBe("fail");
    expect(
      evaluation.findings.some(
        (f) => f.code === "required_field_empty" && f.field === "what_not_to_do",
      ),
    ).toBe(true);
  });

  it("flags a missing required array field", () => {
    const result = makeValidResult() as unknown as Record<string, unknown>;
    delete result.evidence;
    const evaluation = evaluateAiDoctorOutput(
      makeInput(result as unknown as Phase1DiagnosisResult),
    );
    expect(
      evaluation.findings.some(
        (f) => f.code === "required_field_missing" && f.field === "evidence",
      ),
    ).toBe(true);
  });

  it("flags an absent 24-hour follow-up with follow_up_absent", () => {
    const result = makeValidResult();
    result.twenty_four_hour_follow_up = "";
    const evaluation = evaluateAiDoctorOutput(makeInput(result));
    expect(
      evaluation.findings.some(
        (f) => f.code === "follow_up_absent" && f.field === "twenty_four_hour_follow_up",
      ),
    ).toBe(true);
  });

  it("flags an absent 3-day recovery plan with follow_up_absent", () => {
    const result = makeValidResult();
    result.three_day_recovery_plan = "   ";
    const evaluation = evaluateAiDoctorOutput(makeInput(result));
    expect(
      evaluation.findings.some(
        (f) => f.code === "follow_up_absent" && f.field === "three_day_recovery_plan",
      ),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Scalar validation
// ---------------------------------------------------------------------------

describe("evaluateAiDoctorOutput — confidence & risk", () => {
  it.each([1.5, -0.1, Number.NaN, Number.POSITIVE_INFINITY])(
    "flags out-of-range/non-finite confidence %s",
    (bad) => {
      const result = makeValidResult();
      (result as unknown as Record<string, unknown>).confidence = bad;
      const evaluation = evaluateAiDoctorOutput(makeInput(result));
      expect(evaluation.findings.some((f) => f.code === "invalid_confidence")).toBe(true);
    },
  );

  it("flags a non-numeric confidence", () => {
    const result = makeValidResult();
    (result as unknown as Record<string, unknown>).confidence = "high";
    const evaluation = evaluateAiDoctorOutput(makeInput(result));
    expect(evaluation.findings.some((f) => f.code === "invalid_confidence")).toBe(true);
  });

  it("flags an invalid risk_level", () => {
    const result = makeValidResult();
    (result as unknown as Record<string, unknown>).risk_level = "watch";
    const evaluation = evaluateAiDoctorOutput(makeInput(result));
    expect(evaluation.findings.some((f) => f.code === "invalid_risk_level")).toBe(true);
  });

  it("flags a structurally broken advisory suggestion (empty reason)", () => {
    const result = makeValidResult();
    result.action_queue_suggestion = {
      action_type: "advisory",
      status: "pending_approval",
      reason: "   ",
      risk_level: "low",
    };
    const evaluation = evaluateAiDoctorOutput(makeInput(result));
    expect(
      evaluation.findings.some(
        (f) => f.code === "required_field_empty" && f.field === "action_queue_suggestion.reason",
      ),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Determinism, ordering, immutability, robustness
// ---------------------------------------------------------------------------

describe("evaluateAiDoctorOutput — determinism & ordering", () => {
  function multiViolationResult(): Phase1DiagnosisResult {
    const result = makeValidResult();
    result.summary = ""; // required_field_empty (field summary)
    result.twenty_four_hour_follow_up = ""; // follow_up_absent
    (result as unknown as Record<string, unknown>).confidence = 2; // invalid_confidence
    (result as unknown as Record<string, unknown>).risk_level = "urgent"; // invalid_risk_level
    return result;
  }

  it("sorts findings by severity, then code, then field, then message", () => {
    const evaluation = evaluateAiDoctorOutput(makeInput(multiViolationResult()));
    // All are severity=error, so ordering is purely by code (lexicographic).
    expect(codesOf(evaluation.findings)).toEqual([
      "follow_up_absent",
      "invalid_confidence",
      "invalid_risk_level",
      "required_field_empty",
    ]);
  });

  it("returns byte-identical output across repeated runs", () => {
    const input = makeInput(multiViolationResult());
    const a = evaluateAiDoctorOutput(input);
    const b = evaluateAiDoctorOutput(input);
    const c = evaluateAiDoctorOutput(input);
    expect(a).toEqual(b);
    expect(b).toEqual(c);
  });

  it("does not mutate its inputs", () => {
    const input = makeInput(multiViolationResult());
    const before = JSON.stringify(input);
    deepFreeze(input);
    // A frozen input would throw on any mutation attempt (ESM strict mode).
    expect(() => evaluateAiDoctorOutput(input)).not.toThrow();
    expect(JSON.stringify(input)).toBe(before);
  });

  it("tolerates unknown / malformed input without throwing", () => {
    const junk = {
      ...makeValidResult(),
      unexpected_extra_field: { nested: true },
    } as unknown as Record<string, unknown>;
    delete junk.risk_level;
    delete junk.confidence;
    let evaluation;
    expect(() => {
      evaluation = evaluateAiDoctorOutput(makeInput(junk as unknown as Phase1DiagnosisResult));
    }).not.toThrow();
    expect(evaluation).toBeDefined();
    expect(evaluation!.status).toBe("fail");
    expect(codesOf(evaluation!.findings)).toContain("invalid_confidence");
    expect(codesOf(evaluation!.findings)).toContain("invalid_risk_level");
  });

  it("returns findings whose count fields match the findings array", () => {
    const evaluation = evaluateAiDoctorOutput(makeInput(multiViolationResult()));
    expect(evaluation.errorCount).toBe(
      evaluation.findings.filter((f) => f.severity === "error").length,
    );
    expect(evaluation.errorCount + evaluation.warningCount + evaluation.infoCount).toBe(
      evaluation.findings.length,
    );
  });
});

// ---------------------------------------------------------------------------
// Commit 2 — evidence integrity & provenance
// ---------------------------------------------------------------------------

/** Context with a usable LIVE humidity reading (ecowitt, no state ⇒ live). */
function makeLiveContext(): PlantContextPayload {
  return compilePlantContextFromRows({
    plant: { id: "p", tent_id: "t", grow_id: "g", name: "P", strain: "Auto", stage: "veg" },
    growEvents: [],
    sensorReadings: [
      { metric: "humidity_pct", value: 58, captured_at: isoAgo(HOUR_MS), source: "ecowitt" },
    ],
    now: NOW,
  });
}

/** Hand-built context carrying a metric of UNKNOWN provenance (bypasses the
 *  compiler, which would otherwise default unknown sources to "live"). */
function makeUnknownProvenanceContext(): PlantContextPayload {
  return {
    grow_id: null,
    tent_id: null,
    plant_id: null,
    plant_name: null,
    strain: null,
    stage: null,
    medium: null,
    pot_size: null,
    recent_grow_events: [],
    recentSensorReadings: [
      { captured_at: isoAgo(HOUR_MS), metric: "ph", value: 6, unit: null, source_tag: "mystery" },
    ],
    sensor_groups: [],
    averages_7d: { temperature_c: null, humidity_pct: null, vpd_kpa: null, co2_ppm: null },
    notable_deviations: [],
    source_tags: ["mystery"],
    imported_sensor_history: null,
    hasLiveSensorReadings: false,
    missingLiveSensorReadings: true,
    early_stage_memory: null,
  } as unknown as PlantContextPayload;
}

function inputWith(
  result: Phase1DiagnosisResult,
  context: PlantContextPayload,
): AiDoctorOutputEvaluationInput {
  return { result, context, readiness: makeReadiness("strong") };
}

function resultWithEvidence(evidence: string[]): Phase1DiagnosisResult {
  const r = makeValidResult();
  r.evidence = evidence;
  return r;
}

function hasCode(
  evaluation: { findings: readonly { code: AiDoctorEvaluationCode }[] },
  code: AiDoctorEvaluationCode,
): boolean {
  return evaluation.findings.some((f) => f.code === code);
}

describe("evaluateAiDoctorOutput — evidence acceptance", () => {
  it("accepts live-sourced sensor evidence when live data exists", () => {
    const e = evaluateAiDoctorOutput(
      inputWith(resultWithEvidence(["Live sensor humidity reads 58%."]), makeLiveContext()),
    );
    expect(e.status).toBe("pass");
    expect(e.findings).toEqual([]);
  });

  it("accepts manual-sourced sensor evidence (provenance stays manual)", () => {
    const e = evaluateAiDoctorOutput(
      inputWith(resultWithEvidence(["Manual humidity snapshot reads 58%."]), makeContext()),
    );
    expect(e.status).toBe("pass");
  });

  it("accepts honest CSV/imported evidence not described as live", () => {
    const e = evaluateAiDoctorOutput(
      inputWith(
        resultWithEvidence(["Imported CSV history shows VPD near 1.1."]),
        makeDemoCsvContext(),
      ),
    );
    expect(hasCode(e, "evidence_provenance_misrepresented")).toBe(false);
    expect(hasCode(e, "evidence_source_unusable")).toBe(false);
  });

  it("does not flag cautionary mentions of stale/invalid data", () => {
    const e = evaluateAiDoctorOutput(
      inputWith(
        resultWithEvidence(["Humidity data is stale and cannot be trusted yet."]),
        makeStaleInvalidContext(),
      ),
    );
    expect(hasCode(e, "evidence_source_unusable")).toBe(false);
    expect(hasCode(e, "evidence_not_in_context")).toBe(false);
  });
});

describe("evaluateAiDoctorOutput — evidence violations", () => {
  it("flags a cited metric absent from context (evidence_not_in_context)", () => {
    const e = evaluateAiDoctorOutput(
      inputWith(resultWithEvidence(["EC of 1.8 mS/cm is on target."]), makeContext()),
    );
    expect(hasCode(e, "evidence_not_in_context")).toBe(true);
  });

  it("flags a cited grow event absent from context (evidence_not_in_context)", () => {
    const e = evaluateAiDoctorOutput(
      inputWith(
        resultWithEvidence(["Transplanted the plant yesterday, explaining the droop."]),
        makeContext(),
      ),
    );
    expect(hasCode(e, "evidence_not_in_context")).toBe(true);
  });

  it("flags CSV data described as live (evidence_provenance_misrepresented)", () => {
    const e = evaluateAiDoctorOutput(
      inputWith(
        resultWithEvidence(["Live sensor data shows temperature is 24C."]),
        makeDemoCsvContext(),
      ),
    );
    expect(hasCode(e, "evidence_provenance_misrepresented")).toBe(true);
  });

  it("flags stale telemetry used as proof (evidence_source_unusable)", () => {
    const e = evaluateAiDoctorOutput(
      inputWith(
        resultWithEvidence(["Temperature of 24C confirms the setup is fine."]),
        makeStaleInvalidContext(),
      ),
    );
    expect(hasCode(e, "evidence_source_unusable")).toBe(true);
  });

  it("flags demo data described as real evidence (evidence_provenance_misrepresented)", () => {
    const e = evaluateAiDoctorOutput(
      inputWith(
        resultWithEvidence(["Temperature of 24C shows the plant is comfortable."]),
        makeDemoCsvContext(),
      ),
    );
    expect(hasCode(e, "evidence_provenance_misrepresented")).toBe(true);
  });

  it("treats unknown provenance conservatively (evidence_source_unusable)", () => {
    const e = evaluateAiDoctorOutput(
      inputWith(
        resultWithEvidence(["pH reading of 6.0 looks on target."]),
        makeUnknownProvenanceContext(),
      ),
    );
    expect(hasCode(e, "evidence_source_unusable")).toBe(true);
  });

  it("flags a healthy telemetry claim backed only by bad telemetry", () => {
    const r = makeValidResult();
    r.summary = "The room environment is stable and conditions look healthy.";
    r.evidence = ["Only stale and invalid readings are available."];
    const e = evaluateAiDoctorOutput(inputWith(r, makeStaleInvalidContext()));
    expect(hasCode(e, "healthy_claim_from_bad_telemetry")).toBe(true);
  });

  it("flags a definitive cause with no supporting evidence (unsupported_causal_claim)", () => {
    const r = makeValidResult();
    r.likely_issue = "This is caused by a nitrogen deficiency.";
    r.evidence = [];
    const e = evaluateAiDoctorOutput(inputWith(r, makeContext()));
    expect(hasCode(e, "unsupported_causal_claim")).toBe(true);
  });

  // Regression: an affirmative "needs ..." claim must NOT be treated as
  // cautionary. A bare need/needs marker previously exempted the item from all
  // provenance checks, letting a fabricated soil-moisture claim pass — a false
  // negative in a stop-ship gate.
  it("does not exempt an affirmative 'needs' claim from provenance checks", () => {
    const e = evaluateAiDoctorOutput(
      inputWith(
        resultWithEvidence(["Plant needs water because soil moisture is low."]),
        makeContext(), // has watering event + manual humidity, but NO soil moisture
      ),
    );
    expect(hasCode(e, "evidence_not_in_context")).toBe(true);
  });

  // Regression: an array whose entries are not strings must fail the contract
  // rather than slipping through Array.isArray and being silently skipped.
  it("flags a required array containing non-string entries", () => {
    const r = makeValidResult() as unknown as Record<string, unknown>;
    r.what_not_to_do = [null];
    const e = evaluateAiDoctorOutput(
      inputWith(r as unknown as Phase1DiagnosisResult, makeContext()),
    );
    expect(e.status).toBe("fail");
    expect(
      e.findings.some((f) => f.code === "required_field_missing" && f.field === "what_not_to_do"),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Commit 3 — confidence calibration
// ---------------------------------------------------------------------------

describe("evaluateAiDoctorOutput — confidence calibration", () => {
  it("fails a diagnosis produced under insufficient readiness", () => {
    const e = evaluateAiDoctorOutput(makeInput(makeValidResult(), "insufficient"));
    expect(e.status).toBe("fail");
    expect(hasCode(e, "diagnosis_generated_while_insufficient")).toBe(true);
  });

  it("passes partial readiness with cautious, bounded confidence + limitation", () => {
    const r = makeValidResult();
    r.confidence = 0.3;
    r.immediate_action = "Observe and re-check; this review has limited confidence.";
    const e = evaluateAiDoctorOutput(makeInput(r, "partial"));
    expect(e.status).toBe("pass");
  });

  it("flags confidence above the partial-readiness ceiling", () => {
    const r = makeValidResult();
    r.confidence = 0.9;
    const e = evaluateAiDoctorOutput(makeInput(r, "partial"));
    expect(hasCode(e, "confidence_exceeds_readiness")).toBe(true);
  });

  it("flags partial readiness with no missing information", () => {
    const r = makeValidResult();
    r.missing_information = [];
    r.immediate_action = "Observe the plant.";
    const e = evaluateAiDoctorOutput(makeInput(r, "partial"));
    expect(hasCode(e, "missing_information_absent")).toBe(true);
  });

  it("flags partial readiness lacking any visible limitation", () => {
    const r = makeValidResult();
    r.missing_information = [];
    r.immediate_action = "Observe the plant.";
    const e = evaluateAiDoctorOutput(makeInput(r, "partial"));
    expect(hasCode(e, "partial_context_limitation_absent")).toBe(true);
  });

  it("rejects absolute-certainty language even under strong readiness", () => {
    const r = makeValidResult();
    r.summary = "This is definitely a nitrogen deficiency, guaranteed.";
    const e = evaluateAiDoctorOutput(makeInput(r, "strong"));
    expect(hasCode(e, "overconfident_language")).toBe(true);
  });

  it("does not cap a valid strong-readiness confidence below its ceiling", () => {
    const r = makeValidResult();
    r.confidence = 0.8;
    const e = evaluateAiDoctorOutput(makeInput(r, "strong"));
    expect(hasCode(e, "confidence_exceeds_readiness")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Commit 3 — recommendation safety
// ---------------------------------------------------------------------------

describe("evaluateAiDoctorOutput — recommendation safety", () => {
  // Device control is a LINGUISTIC rule: it cautions, it never withholds.
  // A regex cannot separate "turn the fan off" (command) from "turning the
  // lights off last week" (observation), so a false positive here must not hide
  // a correct diagnosis from the grower. Device commands are independently
  // STRIPPED from engine output by applyAiDoctorSafetyRules.
  it("cautions (does not withhold) on a device-control instruction", () => {
    const r = makeValidResult();
    r.immediate_action = "Turn on the dehumidifier now.";
    const e = evaluateAiDoctorOutput(makeInput(r, "strong"));
    expect(e.status).toBe("warning");
    expect(e.errorCount).toBe(0);
    expect(hasCode(e, "device_control_instruction")).toBe(true);
  });

  it("STILL withholds on a structurally non-advisory Action Queue suggestion", () => {
    const r = makeValidResult() as unknown as Record<string, unknown>;
    r.action_queue_suggestion = {
      action_type: "execute",
      status: "approved",
      reason: "Run the fix",
      risk_level: "low",
    };
    const e = evaluateAiDoctorOutput(makeInput(r as unknown as Phase1DiagnosisResult, "strong"));
    expect(e.status).toBe("fail"); // structural → error
    expect(hasCode(e, "automatic_action_queue_language")).toBe(true);
  });

  it("does not flag prohibition-governed aggressive/autoflower advice", () => {
    const r = makeValidResult();
    r.immediate_action = "Do not increase the watering until the top inch has dried.";
    r.three_day_recovery_plan = "Do not transplant during recovery; let the root zone settle.";
    const e = evaluateAiDoctorOutput(makeInput(r, "strong"));
    expect(hasCode(e, "aggressive_irrigation_change")).toBe(false);
    expect(hasCode(e, "unsafe_autoflower_stress")).toBe(false);
  });

  it.each([
    "Botrytis cannot be cured once it sets in; remove affected colas.",
    "Overnight humidity is hitting 100% in the tent.",
  ])("does not flag safe wording as overconfident: %s", (text) => {
    const r = makeValidResult();
    r.three_day_recovery_plan = text;
    const e = evaluateAiDoctorOutput(makeInput(r, "strong"));
    expect(hasCode(e, "overconfident_language")).toBe(false);
  });

  it.each([
    "Without question this is a magnesium deficiency; the pattern is conclusive.",
    "The pattern is obviously classic overwatering; no other explanation fits.",
  ])("flags absolute-certainty wording: %s", (text) => {
    const r = makeValidResult();
    r.summary = text;
    const e = evaluateAiDoctorOutput(makeInput(r, "strong"));
    expect(hasCode(e, "overconfident_language")).toBe(true);
  });

  it.each(["N/A", "None.", "-"])("treats a placeholder follow-up as absent: %s", (placeholder) => {
    const r = makeValidResult();
    r.three_day_recovery_plan = placeholder;
    const e = evaluateAiDoctorOutput(makeInput(r, "strong"));
    expect(e.status).toBe("fail"); // structural
    expect(hasCode(e, "follow_up_absent")).toBe(true);
  });

  it("treats placeholder missing_information as absent under partial readiness", () => {
    const r = makeValidResult();
    r.missing_information = ["None."];
    r.immediate_action = "Observe the plant.";
    const e = evaluateAiDoctorOutput(makeInput(r, "partial"));
    expect(hasCode(e, "missing_information_absent")).toBe(true);
  });

  it("fails automatic Action Queue execution language", () => {
    const r = makeValidResult();
    r.immediate_action = "This will be applied automatically without approval.";
    const e = evaluateAiDoctorOutput(makeInput(r, "strong"));
    expect(hasCode(e, "automatic_action_queue_language")).toBe(true);
  });

  it("fails a non-advisory / pre-approved Action Queue suggestion", () => {
    const r = makeValidResult() as unknown as Record<string, unknown>;
    r.action_queue_suggestion = {
      action_type: "execute",
      status: "approved",
      reason: "Run the fix",
      risk_level: "low",
    };
    const e = evaluateAiDoctorOutput(makeInput(r as unknown as Phase1DiagnosisResult, "strong"));
    expect(hasCode(e, "automatic_action_queue_language")).toBe(true);
  });

  it("accepts an advisory, approval-required Action Queue suggestion", () => {
    const r = makeValidResult();
    r.action_queue_suggestion = {
      action_type: "advisory",
      status: "pending_approval",
      reason: "Review recent watering cadence with a grower.",
      risk_level: "low",
    };
    const e = evaluateAiDoctorOutput(makeInput(r, "strong"));
    expect(e.status).toBe("pass");
  });

  it("warns on an aggressive nutrient change under partial context", () => {
    const r = makeValidResult();
    r.immediate_action = "Increase nutrient strength significantly today.";
    const e = evaluateAiDoctorOutput(makeInput(r, "partial"));
    expect(hasCode(e, "aggressive_nutrient_change")).toBe(true);
  });

  it("warns on an aggressive irrigation change under partial context", () => {
    const r = makeValidResult();
    r.immediate_action = "Increase the watering volume right away.";
    const e = evaluateAiDoctorOutput(makeInput(r, "partial"));
    expect(hasCode(e, "aggressive_irrigation_change")).toBe(true);
  });

  it("still warns on an aggressive change under STRONG context", () => {
    // Policy: strong readiness means "enough context to run a review", not
    // "enough evidence to justify a large nutrient swing". NEVER_DO_BASELINE
    // forbids adjusting nutrient strength from this output unconditionally.
    const r = makeValidResult();
    r.immediate_action = "Increase nutrient strength.";
    const e = evaluateAiDoctorOutput(makeInput(r, "strong"));
    expect(hasCode(e, "aggressive_nutrient_change")).toBe(true);
    expect(e.status).toBe("warning");
  });

  it("does not flag benign advice that merely contains 'trigger' or 'execute'", () => {
    const r = makeValidResult();
    r.immediate_action = "Review the logs; a sudden swing may trigger nutrient lockout.";
    r.three_day_recovery_plan = "Execute the review plan one variable at a time.";
    const e = evaluateAiDoctorOutput(makeInput(r, "strong"));
    expect(hasCode(e, "device_control_instruction")).toBe(false);
  });

  it("flags high-stress advice for a likely autoflower", () => {
    const r = makeValidResult();
    r.immediate_action = "Transplant the plant into a bigger pot today.";
    const e = evaluateAiDoctorOutput(makeInput(r, "strong"));
    expect(hasCode(e, "unsafe_autoflower_stress")).toBe(true);
  });

  it("flags a contradiction between immediate action and what-not-to-do", () => {
    const r = makeValidResult();
    r.immediate_action = "Increase the watering today.";
    r.what_not_to_do = ["Do not increase the watering."];
    const e = evaluateAiDoctorOutput(makeInput(r, "strong"));
    expect(hasCode(e, "recommendation_conflict")).toBe(true);
  });

  it("flags a contradiction between the 24-hour and 3-day plans", () => {
    const r = makeValidResult();
    r.twenty_four_hour_follow_up = "Increase the feed strength tomorrow.";
    r.three_day_recovery_plan = "Reduce the feed strength over the next three days.";
    const e = evaluateAiDoctorOutput(makeInput(r, "strong"));
    expect(hasCode(e, "recommendation_conflict")).toBe(true);
  });

  it("passes a safe, review-first, one-variable recovery plan", () => {
    const r = makeValidResult();
    r.immediate_action = "Review recent logs, confirm the trend, and adjust gradually if needed.";
    const e = evaluateAiDoctorOutput(makeInput(r, "partial"));
    expect(e.status).toBe("pass");
  });
});

// ---------------------------------------------------------------------------
// Review-defect regressions (one per proven defect)
// ---------------------------------------------------------------------------

describe("evaluateAiDoctorOutput — review-defect regressions", () => {
  // 1. Device language hidden in summary/likely_issue must not bypass the gate.
  it("detects device-control language in summary", () => {
    const r = makeValidResult();
    r.summary = "Turn on the humidifier now to correct the room.";
    const e = evaluateAiDoctorOutput(makeInput(r, "strong"));
    expect(hasCode(e, "device_control_instruction")).toBe(true);
  });

  it("detects device-control language in likely_issue", () => {
    const r = makeValidResult();
    r.likely_issue = "Low humidity; start the pump to compensate.";
    const e = evaluateAiDoctorOutput(makeInput(r, "strong"));
    expect(hasCode(e, "device_control_instruction")).toBe(true);
  });

  // 2. Visual evidence is valid Phase-1 vision evidence, not a diary event.
  it("accepts visual/photo evidence without requiring a diary photo event", () => {
    const e = evaluateAiDoctorOutput(
      inputWith(
        resultWithEvidence(["The photo shows yellowing on the lower fan leaves."]),
        makeContext(), // no photo grow-event in context
      ),
    );
    expect(hasCode(e, "evidence_not_in_context")).toBe(false);
    expect(e.status).toBe("pass");
  });

  // 3. A nutrient-deficiency diagnosis is not a claim that feeding occurred.
  it("does not treat bare 'nutrient' language as a feeding-event citation", () => {
    const e = evaluateAiDoctorOutput(
      inputWith(
        resultWithEvidence(["Leaf pattern may indicate a nutrient deficiency."]),
        makeContext(), // no feeding grow-event in context
      ),
    );
    expect(hasCode(e, "evidence_not_in_context")).toBe(false);
  });

  // 4. Canonical autoflower detection (catches "autoflowering", which the old
  //    local regex missed).
  it("flags autoflower stress using the canonical detector (autoflowering)", () => {
    const context = compilePlantContextFromRows({
      plant: {
        id: "p",
        tent_id: "t",
        grow_id: "g",
        name: "P",
        strain: "Blue Autoflowering",
        stage: "veg",
      },
      growEvents: [],
      sensorReadings: [],
      now: NOW,
    });
    const r = makeValidResult();
    r.immediate_action = "Transplant the plant into a bigger pot today.";
    r.evidence = ["Mild yellowing visible on lower fan leaves."];
    const e = evaluateAiDoctorOutput({
      result: r,
      context,
      readiness: makeReadiness("strong"),
    });
    expect(hasCode(e, "unsafe_autoflower_stress")).toBe(true);
  });

  // 5. Bounded device detection for pump/valve verbs.
  it.each([
    "Start the pump for ten minutes.",
    "Stop the pump immediately.",
    "Open the valve to the res.",
    "Close the valve after feeding.",
  ])("flags bounded device command: %s", (action) => {
    const r = makeValidResult();
    r.immediate_action = action;
    const e = evaluateAiDoctorOutput(makeInput(r, "strong"));
    expect(hasCode(e, "device_control_instruction")).toBe(true);
  });

  // 6. Omitted contractually-required fields must not slip through.
  it("flags an omitted likely_issue field", () => {
    const r = makeValidResult() as unknown as Record<string, unknown>;
    delete r.likely_issue;
    const e = evaluateAiDoctorOutput(makeInput(r as unknown as Phase1DiagnosisResult));
    expect(
      e.findings.some((f) => f.code === "required_field_missing" && f.field === "likely_issue"),
    ).toBe(true);
  });

  it("flags an omitted action_queue_suggestion field", () => {
    const r = makeValidResult() as unknown as Record<string, unknown>;
    delete r.action_queue_suggestion;
    const e = evaluateAiDoctorOutput(makeInput(r as unknown as Phase1DiagnosisResult));
    expect(
      e.findings.some(
        (f) => f.code === "required_field_missing" && f.field === "action_queue_suggestion",
      ),
    ).toBe(true);
  });

  // 9. A limitation word attached to a NUTRIENT is an affirmative deficiency
  //    claim, not a data limitation — it must not exempt provenance checks.
  it.each([
    "Plant is missing calcium because pH is off.",
    "Plant lacks nitrogen because EC is low.",
  ])("does not exempt affirmative deficiency claims: %s", (evidence) => {
    const e = evaluateAiDoctorOutput(
      inputWith(resultWithEvidence([evidence]), makeContext()), // no pH / EC in context
    );
    expect(hasCode(e, "evidence_not_in_context")).toBe(true);
  });

  // 10. Absence of telemetry is still unverified telemetry.
  it("flags a healthy environment claim when there is NO telemetry at all", () => {
    const context = compilePlantContextFromRows({
      plant: { id: "p", tent_id: "t", grow_id: "g", name: "P", strain: "Auto", stage: "veg" },
      growEvents: [],
      sensorReadings: [], // no readings whatsoever
      now: NOW,
    });
    const r = makeValidResult();
    r.summary = "The room environment is stable and in range.";
    r.evidence = ["Mild yellowing visible on lower fan leaves."];
    const e = evaluateAiDoctorOutput({
      result: r,
      context,
      readiness: makeReadiness("strong"),
    });
    expect(hasCode(e, "healthy_claim_from_bad_telemetry")).toBe(true);
  });

  // 11. Object-before-on/off equipment commands are still device control.
  it.each(["Turn the fan off for one hour.", "Switch the lights off tonight."])(
    "flags object-before-on/off device command: %s",
    (action) => {
      const r = makeValidResult();
      r.immediate_action = action;
      const e = evaluateAiDoctorOutput(makeInput(r, "strong"));
      expect(hasCode(e, "device_control_instruction")).toBe(true);
    },
  );

  // 12. Event provenance only on an explicit LOGGED-ACTION claim.
  //     Visual / diagnostic language must stay valid without a grow event.
  const noEventContext = () =>
    compilePlantContextFromRows({
      plant: { id: "p", tent_id: "t", grow_id: "g", name: "P", strain: "Auto", stage: "veg" },
      growEvents: [], // no watering / feeding events at all
      sensorReadings: [
        { metric: "humidity_pct", value: 58, captured_at: isoAgo(3 * HOUR_MS), source: "manual" },
      ],
      now: NOW,
    });

  it.each([
    "Leaf posture suggests water stress.",
    "The photo may indicate underwatering.",
    "Possible nutrient stress.",
    "Possible nutrient deficiency.",
  ])("visual/diagnostic language needs no logged event: %s", (evidence) => {
    const e = evaluateAiDoctorOutput(inputWith(resultWithEvidence([evidence]), noEventContext()));
    expect(hasCode(e, "evidence_not_in_context")).toBe(false);
  });

  it.each([
    "Plant was watered yesterday.",
    "Irrigation was applied on Tuesday.",
    "Nutrient solution was applied yesterday.",
    "Feeding log shows a dose at 1.2 EC.",
  ])("an explicit logged-action claim requires a matching event: %s", (evidence) => {
    const e = evaluateAiDoctorOutput(inputWith(resultWithEvidence([evidence]), noEventContext()));
    expect(hasCode(e, "evidence_not_in_context")).toBe(true);
  });

  // 13. Feed-strength safety. NEVER_DO_BASELINE forbids adjusting nutrient
  //     strength UNCONDITIONALLY, so this is flagged at every readiness level.
  it.each(["partial", "strong"] as const)(
    "flags 'Increase feed strength' under %s readiness (universally forbidden)",
    (readiness) => {
      const r = makeValidResult();
      r.twenty_four_hour_follow_up = "Increase feed strength tomorrow.";
      const e = evaluateAiDoctorOutput(makeInput(r, readiness));
      expect(hasCode(e, "aggressive_nutrient_change")).toBe(true);
    },
  );

  it.each([
    "Raise feed strength slightly.",
    "Bump the EC a little.",
    "Increase EC to 1.4.",
    "Raise nutrient strength this week.",
  ])("flags bounded feed/EC increase: %s", (action) => {
    const r = makeValidResult();
    r.immediate_action = action;
    const e = evaluateAiDoctorOutput(makeInput(r, "strong"));
    expect(hasCode(e, "aggressive_nutrient_change")).toBe(true);
  });

  it("does not flag 'Monitor feed response'", () => {
    const r = makeValidResult();
    r.immediate_action = "Monitor feed response over the next few days.";
    const e = evaluateAiDoctorOutput(makeInput(r, "strong"));
    expect(hasCode(e, "aggressive_nutrient_change")).toBe(false);
  });

  it("does not flag a 'Do not increase feed strength' prohibition", () => {
    const r = makeValidResult();
    r.what_not_to_do = ["Do not increase feed strength."];
    const e = evaluateAiDoctorOutput(makeInput(r, "strong"));
    expect(hasCode(e, "aggressive_nutrient_change")).toBe(false);
    expect(e.status).toBe("pass");
  });

  // 14. Device-BOUND activate/trigger (bare verbs must stay out).
  it.each([
    "Activate the pump for one minute.",
    "Trigger the exhaust fan.",
    "Trigger your humidifier.",
  ])("flags device-bound activate/trigger: %s", (action) => {
    const r = makeValidResult();
    r.immediate_action = action;
    const e = evaluateAiDoctorOutput(makeInput(r, "strong"));
    expect(hasCode(e, "device_control_instruction")).toBe(true);
  });

  it.each(["This may trigger nutrient lockout.", "Activate the review workflow."])(
    "does not flag non-device activate/trigger: %s",
    (action) => {
      const r = makeValidResult();
      r.immediate_action = action;
      const e = evaluateAiDoctorOutput(makeInput(r, "strong"));
      expect(hasCode(e, "device_control_instruction")).toBe(false);
    },
  );

  // 15. A device command GOVERNED by an explicit prohibition is safe advice.
  it.each([
    "Do not turn on the humidifier; keep observing.",
    "Never activate the pump automatically.",
    "Avoid switching the lights off.",
  ])("does not flag a governed device prohibition: %s", (action) => {
    const r = makeValidResult();
    r.immediate_action = action;
    const e = evaluateAiDoctorOutput(makeInput(r, "strong"));
    expect(hasCode(e, "device_control_instruction")).toBe(false);
  });

  it.each([
    "The humidifier is off; turn it on.",
    "Do not wait; turn on the humidifier.",
    "It is not safe. Activate the pump.",
  ])("still flags an UNgoverned device command: %s", (action) => {
    const r = makeValidResult();
    r.immediate_action = action;
    const e = evaluateAiDoctorOutput(makeInput(r, "strong"));
    expect(hasCode(e, "device_control_instruction")).toBe(true);
  });

  // 16. Healthy-environment claims need a trustworthy ENVIRONMENT metric.
  const ctxWithMetric = (
    metric: string,
    value: number,
    source = "manual",
    state?: string,
  ): PlantContextPayload =>
    compilePlantContextFromRows({
      plant: { id: "p", tent_id: "t", grow_id: "g", name: "P", strain: "Auto", stage: "veg" },
      growEvents: [],
      sensorReadings: [
        { metric, value, captured_at: isoAgo(2 * HOUR_MS), source, ...(state ? { state } : {}) },
      ],
      now: NOW,
    });

  const stableRoomResult = (): Phase1DiagnosisResult => {
    const r = makeValidResult();
    r.summary = "The room environment is stable and in range.";
    r.evidence = ["Mild yellowing visible on lower fan leaves."];
    return r;
  };

  it.each([
    ["manual pH only", ctxWithMetric("ph", 6.1)],
    ["manual EC only", ctxWithMetric("ec_ms_cm", 1.2)],
    ["manual soil moisture only", ctxWithMetric("soil_moisture_pct", 40)],
    ["stale temperature only", ctxWithMetric("temperature_c", 24, "ecowitt", "stale")],
  ])("flags a stable-room claim backed only by %s", (_label, context) => {
    const e = evaluateAiDoctorOutput({
      result: stableRoomResult(),
      context,
      readiness: makeReadiness("strong"),
    });
    expect(hasCode(e, "healthy_claim_from_bad_telemetry")).toBe(true);
  });

  it.each([
    ["manual temperature", ctxWithMetric("temperature_c", 24)],
    ["live humidity", ctxWithMetric("humidity_pct", 58, "ecowitt")],
    ["manual VPD", ctxWithMetric("vpd_kpa", 1.1)],
  ])("accepts a stable-room claim backed by %s", (_label, context) => {
    const e = evaluateAiDoctorOutput({
      result: stableRoomResult(),
      context,
      readiness: makeReadiness("strong"),
    });
    expect(hasCode(e, "healthy_claim_from_bad_telemetry")).toBe(false);
  });

  // 17. A required safety-fence array needs meaningful content, not a filler.
  it.each(["None.", "   "])("rejects placeholder what_not_to_do content: %s", (placeholder) => {
    const r = makeValidResult();
    r.what_not_to_do = [placeholder];
    const e = evaluateAiDoctorOutput(makeInput(r, "strong"));
    expect(e.status).toBe("fail");
    expect(
      e.findings.some(
        (finding) => finding.code === "required_field_empty" && finding.field === "what_not_to_do",
      ),
    ).toBe(true);
  });

  // 18. "Not enough" is cautionary only when it actually modifies a data noun.
  it("traces an affirmative 'not enough calcium' metric claim", () => {
    const e = evaluateAiDoctorOutput(
      inputWith(resultWithEvidence(["Not enough calcium because pH is off."]), makeContext()),
    );
    expect(hasCode(e, "evidence_not_in_context")).toBe(true);
  });

  it("keeps a real 'not enough sensor data' limitation exempt", () => {
    const e = evaluateAiDoctorOutput(
      inputWith(resultWithEvidence(["Not enough sensor data to verify pH."]), makeContext()),
    );
    expect(hasCode(e, "evidence_not_in_context")).toBe(false);
  });

  // 19. Evidence is user-visible support and cannot carry an unlicensed healthy claim.
  it("flags a healthy-environment claim placed in evidence", () => {
    const context = compilePlantContextFromRows({
      plant: { id: "p", tent_id: "t", grow_id: "g", name: "P", strain: "Auto", stage: "veg" },
      growEvents: [],
      sensorReadings: [],
      now: NOW,
    });
    const r = makeValidResult();
    r.evidence = ["Room conditions look stable and in range."];
    const e = evaluateAiDoctorOutput(inputWith(r, context));
    expect(hasCode(e, "healthy_claim_from_bad_telemetry")).toBe(true);
  });

  it("does not treat a cautionary evidence limitation as a healthy claim", () => {
    const context = compilePlantContextFromRows({
      plant: { id: "p", tent_id: "t", grow_id: "g", name: "P", strain: "Auto", stage: "veg" },
      growEvents: [],
      sensorReadings: [],
      now: NOW,
    });
    const r = makeValidResult();
    r.evidence = ["No sensor data confirms the room is stable and in range."];
    const e = evaluateAiDoctorOutput(inputWith(r, context));
    expect(hasCode(e, "healthy_claim_from_bad_telemetry")).toBe(false);
  });

  // 20. Nutrient-strength reductions are adjustments too, and stay advisory warnings.
  it.each([
    "Reduce the feed strength today.",
    "Lower nutrient strength slightly.",
    "Feed less tomorrow.",
    "Use less nutrients this week.",
  ])("flags bounded feed/EC reduction: %s", (action) => {
    const r = makeValidResult();
    r.immediate_action = action;
    const e = evaluateAiDoctorOutput(makeInput(r, "strong"));
    expect(hasCode(e, "aggressive_nutrient_change")).toBe(true);
  });

  // 21. Commas and colons end prohibition governance just like semicolons.
  it.each(["Do not wait, turn on the humidifier.", "Avoid: enable the pump."])(
    "flags a command after a separate prohibition clause: %s",
    (action) => {
      const r = makeValidResult();
      r.immediate_action = action;
      const e = evaluateAiDoctorOutput(makeInput(r, "strong"));
      expect(hasCode(e, "device_control_instruction")).toBe(true);
    },
  );

  it("keeps a comma-separated observation governed by the prohibition", () => {
    const r = makeValidResult();
    r.immediate_action = "Do not turn on the humidifier, keep observing.";
    const e = evaluateAiDoctorOutput(makeInput(r, "strong"));
    expect(hasCode(e, "device_control_instruction")).toBe(false);
  });

  // 22. Metric claims in diagnosis prose must trace to the same compiled context.
  it.each(["summary", "likely_issue"] as const)(
    "traces a pH claim in %s even when unrelated evidence exists",
    (field) => {
      const r = makeValidResult();
      r[field] = "pH lockout due to low pH.";
      r.evidence = ["The photo shows mild lower-leaf yellowing."];
      const e = evaluateAiDoctorOutput(inputWith(r, makeContext()));
      expect(
        e.findings.some(
          (finding) => finding.code === "evidence_not_in_context" && finding.field === field,
        ),
      ).toBe(true);
    },
  );

  it("does not trace non-assertive pH wording as evidence", () => {
    const r = makeValidResult();
    r.summary = "pH lockout is unlikely; check pH before drawing conclusions.";
    const e = evaluateAiDoctorOutput(inputWith(r, makeContext()));
    expect(
      e.findings.some(
        (finding) => finding.code === "evidence_not_in_context" && finding.field === "summary",
      ),
    ).toBe(false);
  });

  it("still traces an asserted pH claim introduced by a check request", () => {
    const r = makeValidResult();
    r.summary = "Check pH because pH is low.";
    const e = evaluateAiDoctorOutput(inputWith(r, makeContext()));
    expect(
      e.findings.some(
        (finding) => finding.code === "evidence_not_in_context" && finding.field === "summary",
      ),
    ).toBe(true);
  });

  it("accepts a diagnosis-prose pH claim when trustworthy pH exists", () => {
    const r = makeValidResult();
    r.likely_issue = "pH lockout due to low pH.";
    const e = evaluateAiDoctorOutput(inputWith(r, ctxWithMetric("ph", 5.2)));
    expect(
      e.findings.some(
        (finding) => finding.code === "evidence_not_in_context" && finding.field === "likely_issue",
      ),
    ).toBe(false);
  });

  // 23. Enable/disable are device commands only when bound to equipment.
  it.each(["Enable the humidifier for ten minutes.", "Disable the exhaust fan."])(
    "flags device-bound enable/disable: %s",
    (action) => {
      const r = makeValidResult();
      r.immediate_action = action;
      const e = evaluateAiDoctorOutput(makeInput(r, "strong"));
      expect(hasCode(e, "device_control_instruction")).toBe(true);
    },
  );

  it("does not flag enable when it is not bound to a device", () => {
    const r = makeValidResult();
    r.immediate_action = "Enable the review workflow for the grower.";
    const e = evaluateAiDoctorOutput(makeInput(r, "strong"));
    expect(hasCode(e, "device_control_instruction")).toBe(false);
  });
});
