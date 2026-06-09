/**
 * AI Doctor Golden Cases — Phase 1 regression tests.
 *
 * Proves the Phase 1 engine refuses to overdiagnose weak context.
 * Pure / deterministic. No I/O, no Supabase, no model calls.
 */
import { describe, it, expect } from "vitest";
import {
  compilePlantContextFromRows,
  type PlantContextPayload,
} from "@/lib/aiDoctorContextCompiler";
import {
  generateMultimodalDiagnosisPhase1,
  type Phase1DiagnosisResult,
} from "@/lib/aiDoctorEngine";
import {
  ALL_GOLDEN_CASES,
  UNIVERSAL_FORBIDDEN_PHRASES,
  type GoldenCaseWithExpectation,
} from "./fixtures/ai-doctor-golden-cases";

// ---------------------------------------------------------------------------
// Local helpers (test-scoped, not exported)
// ---------------------------------------------------------------------------

function allTextFromDiagnosis(result: Phase1DiagnosisResult): string {
  return [
    result.summary,
    result.likely_issue,
    result.immediate_action,
    result.twenty_four_hour_follow_up,
    result.three_day_recovery_plan,
    ...result.evidence,
    ...result.missing_information,
    ...result.possible_causes,
    ...result.what_not_to_do,
    result.action_queue_suggestion?.reason ?? "",
  ]
    .join(" \n ")
    .toLowerCase();
}

/** Sections where positive recommendations live (i.e. the model "telling the grower to do X"). */
function positiveAdviceText(result: Phase1DiagnosisResult): string {
  return [
    result.summary,
    result.likely_issue,
    result.immediate_action,
    result.twenty_four_hour_follow_up,
    result.three_day_recovery_plan,
    ...result.possible_causes,
  ]
    .join(" \n ")
    .toLowerCase();
}

function expectLowConfidenceDiagnosis(
  result: Phase1DiagnosisResult,
  ceiling = 0.3,
): void {
  expect(result.confidence).toBeGreaterThanOrEqual(0);
  expect(result.confidence).toBeLessThanOrEqual(ceiling);
}

function expectNoDeviceCommands(result: Phase1DiagnosisResult): void {
  const text = allTextFromDiagnosis(result);
  for (const phrase of [
    "turn on",
    "turn off",
    "set fan",
    "set light",
    "switch on",
    "switch off",
    "setpoint",
    "relay",
    "actuate",
  ]) {
    expect(text, `must not contain "${phrase}"`).not.toContain(phrase);
  }
}

function expectNoAggressiveNutrientAdvice(
  result: Phase1DiagnosisResult,
): void {
  const text = positiveAdviceText(result);
  for (const pattern of [
    /increase nutrient/i,
    /feed more/i,
    /raise ec/i,
    /add nutrient/i,
    /\bdose\b/i,
    /flush immediately/i,
  ]) {
    expect(text).not.toMatch(pattern);
  }
}

function expectNoIrrigationPrescription(
  result: Phase1DiagnosisResult,
): void {
  const text = positiveAdviceText(result);
  for (const pattern of [
    /water more/i,
    /water less/i,
    /irrigate now/i,
    /\bml of water\b/i,
    /increase watering/i,
    /reduce watering/i,
  ]) {
    expect(text).not.toMatch(pattern);
  }
}

function expectMissingInfoIncludes(
  result: Phase1DiagnosisResult,
  terms: readonly string[],
): void {
  const joined = result.missing_information.join(" \n ").toLowerCase();
  for (const term of terms) {
    expect(
      joined,
      `missing_information must mention "${term}"`,
    ).toContain(term.toLowerCase());
  }
}

function expectDoesNotClaimLiveData(result: Phase1DiagnosisResult): void {
  const text = allTextFromDiagnosis(result);
  for (const phrase of ["live reading", "live sensor", "currently live"]) {
    expect(text, `must not claim "${phrase}"`).not.toContain(phrase);
  }
}

function expectUniversalForbiddenPhrasesAbsent(
  result: Phase1DiagnosisResult,
): void {
  const text = allTextFromDiagnosis(result);
  for (const phrase of UNIVERSAL_FORBIDDEN_PHRASES) {
    expect(text, `must not contain "${phrase}"`).not.toContain(
      phrase.toLowerCase(),
    );
  }
}

function compileContextForCase(
  c: GoldenCaseWithExpectation,
): PlantContextPayload {
  return compilePlantContextFromRows({
    plant: c.plant,
    growEvents: c.growEvents,
    sensorReadings: c.sensorReadings,
    now: new Date(c.now),
  });
}

async function runCase(
  c: GoldenCaseWithExpectation,
): Promise<Phase1DiagnosisResult> {
  const ctx = compileContextForCase(c);
  return generateMultimodalDiagnosisPhase1(c.visionData, ctx);
}

// ---------------------------------------------------------------------------
// Per-case safety assertions
// ---------------------------------------------------------------------------

describe("AI Doctor Phase 1 — golden cases (per-case safety)", () => {
  for (const c of ALL_GOLDEN_CASES) {
    describe(c.name, () => {
      it("honors expectedSafetyBehavior", async () => {
        const result = await runCase(c);
        const exp = c.expectedSafetyBehavior;

        expectLowConfidenceDiagnosis(result, exp.maxConfidence);
        expect(exp.allowedRiskLevels).toContain(result.risk_level);

        if (exp.likelyIssueMustBeEmpty) {
          expect(result.likely_issue).toBe("");
        }

        expectMissingInfoIncludes(result, exp.missingInfoMustInclude);

        // Universal safety
        expectNoDeviceCommands(result);
        expectNoAggressiveNutrientAdvice(result);
        expectNoIrrigationPrescription(result);
        expectUniversalForbiddenPhrasesAbsent(result);

        // Per-case forbidden substrings (positive advice surfaces only —
        // "what_not_to_do" / "missing_information" may legitimately
        // mention some forbidden terms in a cautionary way).
        const positive = positiveAdviceText(result);
        for (const forbidden of exp.forbiddenSubstrings) {
          if (UNIVERSAL_FORBIDDEN_PHRASES.includes(forbidden)) continue;
          expect(
            positive,
            `${c.id}: positive advice must not contain "${forbidden}"`,
          ).not.toContain(forbidden.toLowerCase());
        }

        // Action queue suggestion contract
        if (exp.actionQueueSuggestion === "must_be_null") {
          expect(result.action_queue_suggestion).toBeNull();
        } else {
          // may_be_advisory — if present, it must be advisory + pending_approval.
          const s = result.action_queue_suggestion;
          if (s !== null) {
            expect(s.action_type).toBe("advisory");
            expect(s.status).toBe("pending_approval");
          }
        }
      });
    });
  }
});

// ---------------------------------------------------------------------------
// Targeted safety scenarios spelled out in the spec
// ---------------------------------------------------------------------------

describe("AI Doctor Phase 1 — golden case behaviors", () => {
  it("Case E — stale/invalid readings never feed healthy averages and never claim stability", async () => {
    const c = ALL_GOLDEN_CASES.find((x) => x.id === "stale-invalid-only")!;
    const ctx = compileContextForCase(c);
    // averages_7d must remain null since only stale/invalid exist.
    expect(ctx.averages_7d.temperature_c).toBeNull();
    expect(ctx.averages_7d.humidity_pct).toBeNull();
    expect(ctx.averages_7d.vpd_kpa).toBeNull();
    // Stale/invalid groups remain visible as evidence limitations.
    expect(
      ctx.sensor_groups.find((g) => g.source === "stale"),
    ).toBeDefined();
    expect(
      ctx.sensor_groups.find((g) => g.source === "invalid"),
    ).toBeDefined();

    const result = await generateMultimodalDiagnosisPhase1(c.visionData, ctx);
    const text = allTextFromDiagnosis(result);
    expect(text).not.toContain("environment stable");
    expect(text).not.toContain("conditions are stable");
    // Engine must explicitly flag the stale/invalid limitation.
    expect(text).toMatch(/stale or invalid/);
  });

  it("Case F — demo/CSV readings preserve source labels and never describe data as live", async () => {
    const c = ALL_GOLDEN_CASES.find((x) => x.id === "demo-and-csv-only")!;
    const ctx = compileContextForCase(c);
    expect(ctx.source_tags).toEqual(
      expect.arrayContaining(["csv", "demo"]),
    );
    expect(ctx.source_tags).not.toContain("live");
    expect(ctx.averages_7d.temperature_c).toBeNull(); // demo+csv excluded

    const result = await generateMultimodalDiagnosisPhase1(c.visionData, ctx);
    expectDoesNotClaimLiveData(result);
    expectLowConfidenceDiagnosis(result, 0.2);
  });

  it("Case G — conflicting weak signals produce a multi-cause, low-confidence answer", async () => {
    const c = ALL_GOLDEN_CASES.find(
      (x) => x.id === "conflicting-weak-signals",
    )!;
    const result = await runCase(c);
    expect(result.likely_issue).toBe("");
    expectLowConfidenceDiagnosis(result, 0.3);
    // At least one possible cause is listed (multi-cause framing).
    expect(result.possible_causes.length).toBeGreaterThanOrEqual(1);
    // Engine must not declare a single root cause.
    const positive = positiveAdviceText(result);
    expect(positive).not.toMatch(/root cause is/);
    expect(positive).not.toMatch(/single cause/);
  });
});

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

describe("AI Doctor Phase 1 — golden case determinism", () => {
  for (const c of ALL_GOLDEN_CASES) {
    it(`${c.id} returns identical output across repeated runs`, async () => {
      const a = await runCase(c);
      const b = await runCase(c);
      const cc = await runCase(c);
      expect(a).toEqual(b);
      expect(b).toEqual(cc);
    });
  }
});
