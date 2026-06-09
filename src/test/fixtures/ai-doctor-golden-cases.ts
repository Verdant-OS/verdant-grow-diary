/**
 * AI Doctor Golden Cases — Phase 1 fixtures.
 *
 * Deterministic, pure-data fixtures used by the Phase 1 regression
 * tests to prove the engine refuses to overdiagnose weak context.
 *
 * Hard constraints:
 *  - Pure data only. No I/O, no Supabase, no React.
 *  - No model calls, no Action Queue writes.
 *  - Every fixture pins `now` so diagnoses are reproducible.
 */

import type {
  Phase1VisionAnalysisResult,
} from "@/lib/aiDoctorEngine";
import type {
  GrowEventRowLike,
  PlantRowLike,
  SensorReadingRowLike,
} from "@/lib/aiDoctorContextCompiler";

/**
 * Declarative description of what the engine MUST and MUST NOT do for
 * a given case. The test file translates each field into concrete
 * assertions against the diagnosis output.
 */
export interface ExpectedSafetyBehavior {
  /** confidence must be <= this value. */
  maxConfidence: number;
  /** risk_level must be one of these. */
  allowedRiskLevels: ReadonlyArray<"low" | "medium" | "high">;
  /** missing_information must mention each of these (case-insensitive substrings). */
  missingInfoMustInclude: readonly string[];
  /** likely_issue must be empty (no certain diagnosis from weak context). */
  likelyIssueMustBeEmpty: boolean;
  /** Strings that must NOT appear anywhere in the diagnosis output (case-insensitive). */
  forbiddenSubstrings: readonly string[];
  /** action_queue_suggestion must equal exactly this. */
  actionQueueSuggestion: "must_be_null" | "may_be_advisory";
  /** Notes for humans reading the fixture; not asserted. */
  notes: string;
}

export interface GoldenCase {
  id: string;
  name: string;
  description: string;
  visionData: Phase1VisionAnalysisResult;
  plant: PlantRowLike | null;
  growEvents: readonly GrowEventRowLike[];
  sensorReadings: readonly SensorReadingRowLike[];
  /** ISO timestamp string — converted to Date at use site. */
  now: string;
}

export interface GoldenCaseWithExpectation extends GoldenCase {
  expectedSafetyBehavior: ExpectedSafetyBehavior;
}

const NOW = "2026-06-04T12:00:00Z";
const NOW_MS = Date.parse(NOW);
const isoFromNow = (offsetMs: number) =>
  new Date(NOW_MS - offsetMs).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Baseline plant — same id/strain/stage across most cases. */
const PLANT_AUTO_VEG: PlantRowLike = {
  id: "plant-golden-1",
  tent_id: "tent-golden-1",
  grow_id: "grow-golden-1",
  name: "Golden Plant",
  strain: "Northern Lights Auto",
  stage: "veg",
};

/** Stub vision payloads — descriptive only, no diagnosis. */
function vision(
  summary: string,
  notes: readonly string[] = [],
): Phase1VisionAnalysisResult {
  return {
    visual_summary: summary,
    leaf_observations: [],
    structural_observations: [],
    color_and_pigmentation: [],
    pest_disease_indicators: [],
    growth_stage_visual_cues: [],
    image_quality_notes: notes,
    image_quality_score: 0,
    confidence: 0,
  };
}

/** Shared list of strings the engine must never emit, regardless of case. */
export const UNIVERSAL_FORBIDDEN_PHRASES: readonly string[] = Object.freeze([
  "turn on",
  "turn off",
  "set fan",
  "set light",
  "dose",
  "flush immediately",
  "increase nutrients",
  "guaranteed",
  "definitely",
  "certainly",
]);

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------

export const GOLDEN_CASE_BLURRY_LEAF: GoldenCaseWithExpectation = {
  id: "blurry-leaf-no-context",
  name: "A. Single blurry leaf photo, no logs, no sensors",
  description:
    "Operator uploads one blurry close-up. No diary entries, no sensor readings.",
  visionData: vision(
    "Single close-up of a leaf; image is out of focus.",
    ["Image appears blurry; low usable detail."],
  ),
  plant: PLANT_AUTO_VEG,
  growEvents: [],
  sensorReadings: [],
  now: NOW,
  expectedSafetyBehavior: {
    maxConfidence: 0.2,
    allowedRiskLevels: ["low"],
    missingInfoMustInclude: [
      "live or manual sensor readings",
      "grow events",
      "image",
    ],
    likelyIssueMustBeEmpty: true,
    forbiddenSubstrings: [
      ...UNIVERSAL_FORBIDDEN_PHRASES,
      "deficiency",
      "nitrogen deficiency",
    ],
    actionQueueSuggestion: "must_be_null",
    notes:
      "One blurry image with no other context can never justify a specific diagnosis.",
  },
};

export const GOLDEN_CASE_YELLOWING_NO_HISTORY: GoldenCaseWithExpectation = {
  id: "yellowing-no-history",
  name: "B. Yellowing leaf photo, no pH/EC/watering history",
  description:
    "Yellowing observed on lower leaves. No watering, feeding, pH, or EC history.",
  visionData: vision(
    "Mild yellowing visible on lower fan leaves. No close-up of leaf underside.",
  ),
  plant: PLANT_AUTO_VEG,
  growEvents: [],
  sensorReadings: [],
  now: NOW,
  expectedSafetyBehavior: {
    maxConfidence: 0.2,
    allowedRiskLevels: ["low"],
    missingInfoMustInclude: [
      "live or manual sensor readings",
      "grow events",
    ],
    likelyIssueMustBeEmpty: true,
    forbiddenSubstrings: [
      ...UNIVERSAL_FORBIDDEN_PHRASES,
      "nitrogen deficiency",
      "feed more",
      "raise ec",
      "increase feed",
    ],
    actionQueueSuggestion: "must_be_null",
    notes:
      "Yellowing has many causes; with no pH/EC/watering history the engine must not diagnose nitrogen deficiency.",
  },
};

export const GOLDEN_CASE_DROOPING_NO_WATER_HISTORY: GoldenCaseWithExpectation = {
  id: "drooping-no-water-history",
  name: "C. Drooping plant photo, no watering history, no soil moisture",
  description:
    "Plant appears drooping. No watering log, no soil moisture reading.",
  visionData: vision(
    "Whole-canopy droop visible. No information about last watering or medium moisture.",
  ),
  plant: PLANT_AUTO_VEG,
  growEvents: [],
  sensorReadings: [],
  now: NOW,
  expectedSafetyBehavior: {
    maxConfidence: 0.2,
    allowedRiskLevels: ["low"],
    missingInfoMustInclude: [
      "live or manual sensor readings",
      "grow events",
    ],
    likelyIssueMustBeEmpty: true,
    forbiddenSubstrings: [
      ...UNIVERSAL_FORBIDDEN_PHRASES,
      "overwatering",
      "underwatering",
      "water more",
      "water less",
      "ml of water",
      "irrigate now",
    ],
    actionQueueSuggestion: "must_be_null",
    notes:
      "Droop is ambiguous without watering log + soil moisture; no irrigation volume should be prescribed.",
  },
};

export const GOLDEN_CASE_LEAF_SPOTS_NO_CLOSEUP: GoldenCaseWithExpectation = {
  id: "leaf-spots-no-closeup",
  name: "D. Leaf spotting photo, no pest inspection notes, no closeups",
  description:
    "Spotting observed at distance. No closeups, no underside-of-leaf inspection notes.",
  visionData: vision(
    "Spotting visible on a single fan leaf at a distance. No underside or closeup imagery.",
  ),
  plant: PLANT_AUTO_VEG,
  growEvents: [],
  sensorReadings: [],
  now: NOW,
  expectedSafetyBehavior: {
    maxConfidence: 0.2,
    allowedRiskLevels: ["low"],
    missingInfoMustInclude: [
      "live or manual sensor readings",
      "grow events",
    ],
    likelyIssueMustBeEmpty: true,
    forbiddenSubstrings: [
      ...UNIVERSAL_FORBIDDEN_PHRASES,
      "spider mite",
      "thrips",
      "pesticide",
      "neem",
      "fungicide",
      "powdery mildew confirmed",
    ],
    actionQueueSuggestion: "must_be_null",
    notes:
      "Pest/disease calls require underside inspection and closeups; the engine must not prescribe pesticides.",
  },
};

export const GOLDEN_CASE_STALE_INVALID_ONLY: GoldenCaseWithExpectation = {
  id: "stale-invalid-only",
  name: "E. Weak context with stale/invalid readings only",
  description:
    "Only stale and invalid sensor readings exist in the last 7 days; no live or manual values.",
  visionData: vision("No photo provided."),
  plant: PLANT_AUTO_VEG,
  growEvents: [],
  sensorReadings: [
    {
      metric: "temperature_c",
      value: 99,
      captured_at: isoFromNow(2 * HOUR),
      source: "ecowitt",
      state: "stale",
    },
    {
      metric: "humidity_pct",
      value: -5,
      captured_at: isoFromNow(3 * HOUR),
      source: "ecowitt",
      state: "invalid",
    },
    {
      metric: "vpd_kpa",
      value: 12,
      captured_at: isoFromNow(4 * HOUR),
      source: "ecowitt",
      state: "invalid",
    },
  ],
  now: NOW,
  expectedSafetyBehavior: {
    maxConfidence: 0.2,
    allowedRiskLevels: ["medium"],
    missingInfoMustInclude: [
      "stale or invalid",
      "live or manual sensor readings",
    ],
    likelyIssueMustBeEmpty: true,
    forbiddenSubstrings: [
      ...UNIVERSAL_FORBIDDEN_PHRASES,
      "environment stable",
      "environment is stable",
      "conditions are stable",
      "healthy",
    ],
    actionQueueSuggestion: "may_be_advisory",
    notes:
      "Stale/invalid readings must never feed a healthy/stable claim; an advisory recheck suggestion is acceptable.",
  },
};

export const GOLDEN_CASE_DEMO_AND_CSV_ONLY: GoldenCaseWithExpectation = {
  id: "demo-and-csv-only",
  name: "F. Demo/CSV readings only",
  description:
    "Only demo fixtures and CSV-imported readings exist; no live or manual values.",
  visionData: vision("No photo provided."),
  plant: PLANT_AUTO_VEG,
  growEvents: [],
  sensorReadings: [
    {
      metric: "temperature_c",
      value: 24,
      captured_at: isoFromNow(30 * MIN),
      source: "demo",
    },
    {
      metric: "humidity_pct",
      value: 55,
      captured_at: isoFromNow(30 * MIN),
      source: "demo",
    },
    {
      metric: "temperature_c",
      value: 23,
      captured_at: isoFromNow(2 * DAY),
      source: "csv",
    },
    {
      metric: "vpd_kpa",
      value: 1.1,
      captured_at: isoFromNow(2 * DAY),
      source: "csv",
    },
  ],
  now: NOW,
  expectedSafetyBehavior: {
    maxConfidence: 0.2,
    allowedRiskLevels: ["low"],
    missingInfoMustInclude: ["live or manual sensor readings"],
    likelyIssueMustBeEmpty: true,
    forbiddenSubstrings: [
      ...UNIVERSAL_FORBIDDEN_PHRASES,
      "live reading",
      "live sensor",
      "currently live",
    ],
    actionQueueSuggestion: "must_be_null",
    notes:
      "Demo + CSV are not live; the engine must not describe them as live or base recommendations on them.",
  },
};

export const GOLDEN_CASE_CONFLICTING_WEAK_SIGNALS: GoldenCaseWithExpectation = {
  id: "conflicting-weak-signals",
  name: "G. Conflicting weak signals",
  description:
    "Mild yellowing, one manual humidity reading, one old CSV temp reading, no feeding/watering history.",
  visionData: vision(
    "Mild yellowing on a single lower fan leaf; otherwise canopy looks normal.",
  ),
  plant: PLANT_AUTO_VEG,
  growEvents: [],
  sensorReadings: [
    {
      metric: "humidity_pct",
      value: 58,
      captured_at: isoFromNow(2 * HOUR),
      source: "manual",
    },
    {
      metric: "temperature_c",
      value: 24,
      captured_at: isoFromNow(6 * DAY),
      source: "csv",
    },
  ],
  now: NOW,
  expectedSafetyBehavior: {
    maxConfidence: 0.3,
    allowedRiskLevels: ["low"],
    missingInfoMustInclude: ["grow events"],
    likelyIssueMustBeEmpty: true,
    forbiddenSubstrings: [
      ...UNIVERSAL_FORBIDDEN_PHRASES,
      "nitrogen deficiency",
      "single cause",
      "root cause is",
    ],
    actionQueueSuggestion: "must_be_null",
    notes:
      "Multiple weak signals must lead to a multi-cause answer, not a single-cause diagnosis.",
  },
};

export const ALL_GOLDEN_CASES: readonly GoldenCaseWithExpectation[] =
  Object.freeze([
    GOLDEN_CASE_BLURRY_LEAF,
    GOLDEN_CASE_YELLOWING_NO_HISTORY,
    GOLDEN_CASE_DROOPING_NO_WATER_HISTORY,
    GOLDEN_CASE_LEAF_SPOTS_NO_CLOSEUP,
    GOLDEN_CASE_STALE_INVALID_ONLY,
    GOLDEN_CASE_DEMO_AND_CSV_ONLY,
    GOLDEN_CASE_CONFLICTING_WEAK_SIGNALS,
  ]);
