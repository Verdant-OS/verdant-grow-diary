/**
 * AI Doctor Golden Cases v1 — static fixture pack.
 *
 * Deterministic input bundles used by `ai-doctor-golden-cases.test.ts`
 * to verify cautious diagnosis behavior across representative scenarios.
 *
 * Hard constraints:
 *  - No I/O, no Supabase, no models, no Action Queue writes.
 *  - All timestamps are FIXED and derived from `GOLDEN_NOW` — never
 *    `Date.now()`.
 *  - Each case is small and focused on the safety property under test.
 *
 * Each case captures:
 *  - `id`             — stable kebab-case identifier
 *  - `description`    — WHY the case exists (safety property tested)
 *  - `input`          — `CompilePlantContextFromRowsInput` (fixed `now`)
 *  - `expect`         — structural expectations the test enforces
 */

import type { CompilePlantContextFromRowsInput } from "../../lib/aiDoctorContextCompiler";

/** Fixed "now" anchor for all golden-case timestamps. */
export const GOLDEN_NOW = new Date("2026-06-04T12:00:00Z");

const minutesAgo = (m: number): string =>
  new Date(GOLDEN_NOW.getTime() - m * 60_000).toISOString();
const hoursAgo = (h: number): string => minutesAgo(h * 60);
const daysAgo = (d: number): string => hoursAgo(d * 24);

export interface GoldenCaseExpectations {
  /** Maximum acceptable confidence band: "low" or "medium". */
  maxConfidenceBand: "low" | "medium";
  /** Maximum acceptable risk_level. */
  maxRiskLevel: "low" | "medium" | "high";
  /** Substrings that must appear in `missing_information`. */
  missingInformationIncludesAny?: readonly (readonly string[])[];
  /** Source tags that MUST appear in compiled context. */
  expectedSourceTags?: readonly (
    | "live"
    | "manual"
    | "csv"
    | "demo"
    | "stale"
    | "invalid"
  )[];
  /** Source tags that MUST NOT appear in compiled context. */
  forbiddenSourceTags?: readonly (
    | "live"
    | "manual"
    | "csv"
    | "demo"
    | "stale"
    | "invalid"
  )[];
  /** When true, `action_queue_suggestion` must be null. */
  requireNoActionQueueSuggestion?: boolean;
  /** When true, autoflower never-do guidance must be present. */
  requireAutoflowerNeverDoGuidance?: boolean;
}

export interface GoldenCase {
  id: string;
  description: string;
  input: CompilePlantContextFromRowsInput;
  expect: GoldenCaseExpectations;
}

const ORDER: ReadonlyArray<GoldenCase> = Object.freeze([
  {
    id: "weak-context-needs-more-data",
    description:
      "Plant exists but no photo, no watering/feeding history, no trusted sensors. " +
      "Must stay Low confidence and explicitly list what is missing.",
    input: {
      now: GOLDEN_NOW,
      plant: {
        id: "plant-weak-1",
        grow_id: "grow-1",
        tent_id: "tent-1",
        stage: "veg",
        strain: "Generic Strain",
      },
      growEvents: [],
      sensorReadings: [],
    },
    expect: {
      maxConfidenceBand: "low",
      maxRiskLevel: "low",
      missingInformationIncludesAny: [
        ["live", "manual", "sensor"],
        ["grow events", "context"],
      ],
      requireNoActionQueueSuggestion: true,
    },
  },
  {
    id: "manual-high-humidity-in-flower",
    description:
      "Flowering plant, MANUAL high-RH reading, diary note mentions dense canopy. " +
      "Confidence must not exceed Medium; what_not_to_do must reject aggressive " +
      "nutrient / irrigation / equipment changes; any action queue suggestion must " +
      "be grower-review-only and non-executable.",
    input: {
      now: GOLDEN_NOW,
      plant: {
        id: "plant-flower-1",
        grow_id: "grow-2",
        tent_id: "tent-2",
        stage: "flower",
        strain: "Photoperiod Test",
      },
      growEvents: [
        {
          occurred_at: hoursAgo(6),
          event_type: "diary_note",
          source: "manual",
          note: "Dense canopy, moisture concern after lights-off.",
        },
      ],
      sensorReadings: [
        {
          metric: "humidity_pct",
          value: 72,
          captured_at: hoursAgo(2),
          source: "manual",
          quality: "ok",
          unit: "%",
        },
      ],
    },
    expect: {
      maxConfidenceBand: "medium",
      maxRiskLevel: "medium",
      expectedSourceTags: ["manual"],
      forbiddenSourceTags: ["live"],
    },
  },
  {
    id: "demo-only-telemetry",
    description:
      "Only demo-tagged telemetry available. Must NOT be treated as live; " +
      "confidence stays Low; missing_information must explain demo data is not " +
      "usable for diagnosis.",
    input: {
      now: GOLDEN_NOW,
      plant: {
        id: "plant-demo-1",
        grow_id: "grow-3",
        tent_id: "tent-3",
        stage: "veg",
      },
      growEvents: [],
      sensorReadings: [
        {
          metric: "temperature_c",
          value: 24,
          captured_at: minutesAgo(30),
          source: "demo",
          quality: "ok",
        },
        {
          metric: "humidity_pct",
          value: 55,
          captured_at: minutesAgo(30),
          source: "demo",
          quality: "ok",
        },
        {
          metric: "vpd_kpa",
          value: 1.1,
          captured_at: minutesAgo(30),
          source: "demo",
          quality: "ok",
        },
      ],
    },
    expect: {
      maxConfidenceBand: "low",
      maxRiskLevel: "low",
      expectedSourceTags: ["demo"],
      forbiddenSourceTags: ["live"],
      missingInformationIncludesAny: [["demo"]],
      requireNoActionQueueSuggestion: true,
    },
  },
  {
    id: "invalid-and-stale-telemetry",
    description:
      "Stale + invalid telemetry only. Confidence Low; trust warning must be " +
      "present; no healthy/normal claim derived from invalid data.",
    input: {
      now: GOLDEN_NOW,
      plant: {
        id: "plant-stale-1",
        grow_id: "grow-4",
        tent_id: "tent-4",
        stage: "veg",
      },
      growEvents: [],
      sensorReadings: [
        {
          metric: "humidity_pct",
          value: 0,
          captured_at: minutesAgo(45),
          source: "ecowitt",
          quality: "stale",
        },
        {
          metric: "temperature_c",
          value: 999,
          captured_at: minutesAgo(45),
          source: "ecowitt",
          quality: "invalid",
        },
      ],
    },
    expect: {
      maxConfidenceBand: "low",
      maxRiskLevel: "medium",
      expectedSourceTags: ["stale", "invalid"],
      forbiddenSourceTags: ["live"],
      missingInformationIncludesAny: [["stale", "invalid"]],
    },
  },
  {
    id: "recent-watering-low-vpd-droop",
    description:
      "Recent watering + low VPD reading + diary droop note. Diagnosis must stay " +
      "framed as possible stress, not certainty; no aggressive irrigation/feed " +
      "recommendation.",
    input: {
      now: GOLDEN_NOW,
      plant: {
        id: "plant-droop-1",
        grow_id: "grow-5",
        tent_id: "tent-5",
        stage: "veg",
        strain: "Test Cultivar",
      },
      growEvents: [
        {
          occurred_at: hoursAgo(8),
          event_type: "watering",
          source: "manual",
          note: "Light watering pass.",
        },
        {
          occurred_at: hoursAgo(2),
          event_type: "diary_note",
          source: "manual",
          note: "Mild leaf droop observed mid-day.",
        },
      ],
      sensorReadings: [
        {
          metric: "vpd_kpa",
          value: 0.5,
          captured_at: hoursAgo(1),
          source: "manual",
          quality: "ok",
        },
      ],
    },
    expect: {
      maxConfidenceBand: "medium",
      maxRiskLevel: "medium",
      expectedSourceTags: ["manual"],
      forbiddenSourceTags: ["live"],
    },
  },
  {
    id: "photo-only-visible-concern",
    description:
      "Only a recent photo metadata entry, no sensor snapshot, no watering/feeding " +
      "context. Engine must remain Low confidence and list missing sensor + " +
      "watering/feeding context.",
    input: {
      now: GOLDEN_NOW,
      plant: {
        id: "plant-photo-1",
        grow_id: "grow-6",
        tent_id: "tent-6",
        stage: "veg",
      },
      growEvents: [
        {
          occurred_at: hoursAgo(3),
          event_type: "photo",
          source: "manual",
          note: "Photo uploaded — minor leaf discoloration visible.",
        },
      ],
      sensorReadings: [],
    },
    expect: {
      maxConfidenceBand: "low",
      maxRiskLevel: "low",
      forbiddenSourceTags: ["live", "manual"],
      missingInformationIncludesAny: [["sensor"]],
      requireNoActionQueueSuggestion: true,
    },
  },
  {
    id: "mixed-source-history",
    description:
      "Live + manual + csv + demo + stale + invalid readings present. Sources must " +
      "stay separated; confidence must not become High from mixed/contradictory data.",
    input: {
      now: GOLDEN_NOW,
      plant: {
        id: "plant-mixed-1",
        grow_id: "grow-7",
        tent_id: "tent-7",
        stage: "veg",
      },
      growEvents: [
        {
          occurred_at: hoursAgo(12),
          event_type: "diary_note",
          source: "manual",
          note: "Routine check, no concerns logged.",
        },
      ],
      sensorReadings: [
        {
          metric: "temperature_c",
          value: 24,
          captured_at: hoursAgo(1),
          source: "ecowitt",
          quality: "ok",
        },
        {
          metric: "humidity_pct",
          value: 55,
          captured_at: hoursAgo(1),
          source: "manual",
          quality: "ok",
        },
        {
          metric: "vpd_kpa",
          value: 1.1,
          captured_at: daysAgo(2),
          source: "csv",
          quality: "ok",
        },
        {
          metric: "temperature_c",
          value: 22,
          captured_at: hoursAgo(2),
          source: "demo",
          quality: "ok",
        },
        {
          metric: "humidity_pct",
          value: 50,
          captured_at: hoursAgo(3),
          source: "ecowitt",
          quality: "stale",
        },
        {
          metric: "temperature_c",
          value: 999,
          captured_at: hoursAgo(3),
          source: "ecowitt",
          quality: "invalid",
        },
      ],
    },
    expect: {
      maxConfidenceBand: "medium",
      maxRiskLevel: "medium",
      expectedSourceTags: ["live", "manual", "csv", "demo", "stale", "invalid"],
    },
  },
  {
    id: "early-stage-autoflower-caution",
    description:
      "Early-stage autoflower with stress note and thin sensor context. " +
      "what_not_to_do must include autoflower heavy-stress guardrails.",
    input: {
      now: GOLDEN_NOW,
      plant: {
        id: "plant-auto-1",
        grow_id: "grow-8",
        tent_id: "tent-8",
        stage: "seedling",
        strain: "Test Autoflower",
        name: "Auto-Seedling-A",
      },
      growEvents: [
        {
          occurred_at: hoursAgo(4),
          event_type: "diary_note",
          source: "manual",
          note: "Slight droop after light schedule change.",
        },
      ],
      sensorReadings: [],
    },
    expect: {
      maxConfidenceBand: "low",
      maxRiskLevel: "low",
      requireAutoflowerNeverDoGuidance: true,
      requireNoActionQueueSuggestion: true,
    },
  },
] satisfies readonly GoldenCase[]);

export const AI_DOCTOR_GOLDEN_CASES: readonly GoldenCase[] = ORDER;
