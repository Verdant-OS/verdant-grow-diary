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

const minutesAgo = (m: number): string => new Date(GOLDEN_NOW.getTime() - m * 60_000).toISOString();
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
  expectedSourceTags?: readonly ("live" | "manual" | "csv" | "demo" | "stale" | "invalid")[];
  /** Source tags that MUST NOT appear in compiled context. */
  forbiddenSourceTags?: readonly ("live" | "manual" | "csv" | "demo" | "stale" | "invalid")[];
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
  // -------------------------------------------------------------------------
  // v1.1 — differential cases (pest/disease vs nutrient vs environment)
  // -------------------------------------------------------------------------
  {
    id: "differential-pest-disease-vs-environment",
    description:
      "Photo + diary note describing localized leaf spotting with thin sensor " +
      "context. Engine must stay differential (possible visible concern), not " +
      "diagnostic, and must request closer photo / underside check / environment " +
      "context before any treatment recommendation.",
    input: {
      now: GOLDEN_NOW,
      plant: {
        id: "plant-diff-pest-1",
        grow_id: "grow-d1",
        tent_id: "tent-d1",
        stage: "veg",
      },
      growEvents: [
        {
          occurred_at: hoursAgo(2),
          event_type: "photo",
          source: "manual",
          note: "Photo uploaded — localized spotting on a single fan leaf edge.",
        },
        {
          occurred_at: hoursAgo(5),
          event_type: "diary_note",
          source: "manual",
          note: "Noticed small dark spots near leaf margin on lower canopy.",
        },
      ],
      sensorReadings: [
        {
          metric: "humidity_pct",
          value: 58,
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
    id: "differential-nutrient-vs-watering-environment",
    description:
      "Diary note mentions yellowing / tip burn after a recent feeding event. " +
      "Sensor context is manual / csv only, not live. Engine must keep cause " +
      "set as a differential (nutrient strength, pH/root-zone, watering, " +
      "environment) and must not emit a direct dosing instruction.",
    input: {
      now: GOLDEN_NOW,
      plant: {
        id: "plant-diff-nutrient-1",
        grow_id: "grow-d2",
        tent_id: "tent-d2",
        stage: "veg",
      },
      growEvents: [
        {
          occurred_at: hoursAgo(10),
          event_type: "feeding",
          source: "manual",
          note: "Feeding pass — mid-strength nutrient mix.",
        },
        {
          occurred_at: hoursAgo(3),
          event_type: "diary_note",
          source: "manual",
          note: "Yellowing on upper leaves with light tip burn observed.",
        },
      ],
      sensorReadings: [
        {
          metric: "humidity_pct",
          value: 55,
          captured_at: hoursAgo(2),
          source: "manual",
          quality: "ok",
        },
        {
          metric: "temperature_c",
          value: 23,
          captured_at: daysAgo(2),
          source: "csv",
          quality: "ok",
        },
      ],
    },
    expect: {
      maxConfidenceBand: "medium",
      maxRiskLevel: "medium",
      expectedSourceTags: ["manual", "csv"],
      forbiddenSourceTags: ["live"],
    },
  },
  {
    id: "differential-environment-only-stress",
    description:
      "Live temperature/humidity/VPD outside target with a diary curl/droop " +
      "note and no fresh photo. Engine must frame issue as environment stress " +
      "review, surface live evidence explicitly, and any action suggestion stays " +
      "review-only.",
    input: {
      now: GOLDEN_NOW,
      plant: {
        id: "plant-diff-env-1",
        grow_id: "grow-d3",
        tent_id: "tent-d3",
        stage: "veg",
      },
      growEvents: [
        {
          occurred_at: hoursAgo(2),
          event_type: "diary_note",
          source: "manual",
          note: "Slight leaf curl and droop noted mid-afternoon.",
        },
      ],
      sensorReadings: [
        {
          metric: "temperature_c",
          value: 32,
          captured_at: hoursAgo(1),
          source: "ecowitt",
          quality: "ok",
        },
        {
          metric: "humidity_pct",
          value: 28,
          captured_at: hoursAgo(1),
          source: "ecowitt",
          quality: "ok",
        },
        {
          metric: "vpd_kpa",
          value: 1.9,
          captured_at: hoursAgo(1),
          source: "ecowitt",
          quality: "ok",
        },
      ],
    },
    expect: {
      maxConfidenceBand: "medium",
      maxRiskLevel: "medium",
      expectedSourceTags: ["live"],
    },
  },
  // -------------------------------------------------------------------------
  // v1.1 — contradictory source cases
  // -------------------------------------------------------------------------
  {
    id: "contradictory-live-normal-manual-alarming",
    description:
      "Live readings within target while a manual reading from the same window " +
      "reports high humidity. Engine must not raise confidence to High and must " +
      "preserve live/manual source separation without silently agreeing.",
    input: {
      now: GOLDEN_NOW,
      plant: {
        id: "plant-conflict-1",
        grow_id: "grow-c1",
        tent_id: "tent-c1",
        stage: "flower",
      },
      growEvents: [],
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
          source: "ecowitt",
          quality: "ok",
        },
        {
          metric: "vpd_kpa",
          value: 1.1,
          captured_at: hoursAgo(1),
          source: "ecowitt",
          quality: "ok",
        },
        {
          metric: "humidity_pct",
          value: 78,
          captured_at: hoursAgo(1),
          source: "manual",
          quality: "ok",
        },
      ],
    },
    expect: {
      maxConfidenceBand: "medium",
      maxRiskLevel: "medium",
      expectedSourceTags: ["live", "manual"],
    },
  },
  {
    id: "contradictory-manual-normal-live-alarming",
    description:
      "Live readings outside target while a recent manual snapshot reports " +
      "normal. Engine must cap confidence at Medium, keep both sources visible, " +
      "and avoid device-control wording.",
    input: {
      now: GOLDEN_NOW,
      plant: {
        id: "plant-conflict-2",
        grow_id: "grow-c2",
        tent_id: "tent-c2",
        stage: "veg",
      },
      growEvents: [
        {
          occurred_at: hoursAgo(2),
          event_type: "diary_note",
          source: "manual",
          note: "Brief observation — plants look stable to the eye.",
        },
      ],
      sensorReadings: [
        {
          metric: "temperature_c",
          value: 33,
          captured_at: hoursAgo(1),
          source: "ecowitt",
          quality: "ok",
        },
        {
          metric: "humidity_pct",
          value: 25,
          captured_at: hoursAgo(1),
          source: "ecowitt",
          quality: "ok",
        },
        {
          metric: "vpd_kpa",
          value: 2.0,
          captured_at: hoursAgo(1),
          source: "ecowitt",
          quality: "ok",
        },
        {
          metric: "temperature_c",
          value: 24,
          captured_at: hoursAgo(1),
          source: "manual",
          quality: "ok",
        },
        {
          metric: "humidity_pct",
          value: 55,
          captured_at: hoursAgo(1),
          source: "manual",
          quality: "ok",
        },
      ],
    },
    expect: {
      maxConfidenceBand: "medium",
      maxRiskLevel: "medium",
      expectedSourceTags: ["live", "manual"],
    },
  },
  // -------------------------------------------------------------------------
  // v1.4 — golden cases v1 required-scenario completion pass. Closes three
  // scenario gaps explicitly called out for the "AI Doctor Golden Cases v1"
  // pack: (1) stale telemetry combined with a leaf symptom note, (2) a
  // feeding/nutrient context with zero pH or EC evidence of any kind, and
  // (3) an autoflower case framed around post-stress "recovery" pressure
  // rather than ongoing stress. No engine/rule changes — fixtures only.
  // -------------------------------------------------------------------------
  {
    id: "stale-sensor-plus-leaf-symptom",
    description:
      "Only stale humidity/temperature telemetry is available, alongside a " +
      "diary note describing leaf tip curl. Engine must stay Low confidence, " +
      "flag the stale telemetry AND the lack of any trustworthy sensor " +
      "confirmation, and must not draw a diagnosis from the stale readings.",
    input: {
      now: GOLDEN_NOW,
      plant: {
        id: "plant-stale-symptom-1",
        grow_id: "grow-s1",
        tent_id: "tent-s1",
        stage: "veg",
        strain: "Test Cultivar",
      },
      growEvents: [
        {
          occurred_at: hoursAgo(3),
          event_type: "diary_note",
          source: "manual",
          note: "Leaf tips curling slightly on the upper canopy overnight.",
        },
      ],
      sensorReadings: [
        {
          metric: "humidity_pct",
          value: 40,
          captured_at: hoursAgo(5),
          source: "ecowitt",
          quality: "stale",
        },
        {
          metric: "temperature_c",
          value: 26,
          captured_at: hoursAgo(5),
          source: "ecowitt",
          quality: "stale",
        },
      ],
    },
    expect: {
      maxConfidenceBand: "low",
      maxRiskLevel: "medium",
      expectedSourceTags: ["stale"],
      forbiddenSourceTags: ["live"],
      missingInformationIncludesAny: [["stale", "invalid"], ["sensor"]],
    },
  },
  {
    id: "missing-ph-ec-context-after-feeding",
    description:
      "A feeding event and a mild-yellowing diary note exist, but no pH or " +
      "EC reading of any kind — nor any other sensor evidence — has been " +
      "logged for this tent. Engine must stay Low confidence, explicitly " +
      "name the missing sensor context, and must not recommend a feed/flush " +
      "change or imply pH/EC was ever checked.",
    input: {
      now: GOLDEN_NOW,
      plant: {
        id: "plant-ph-ec-1",
        grow_id: "grow-p1",
        tent_id: "tent-p1",
        stage: "veg",
        strain: "Test Cultivar",
        medium: "coco",
      },
      growEvents: [
        {
          occurred_at: hoursAgo(9),
          event_type: "feeding",
          source: "manual",
          note: "Fed at label strength; did not check runoff pH or EC.",
        },
        {
          occurred_at: hoursAgo(2),
          event_type: "diary_note",
          source: "manual",
          note: "Mild yellowing on a couple of lower leaves.",
        },
      ],
      sensorReadings: [],
    },
    expect: {
      maxConfidenceBand: "low",
      maxRiskLevel: "low",
      missingInformationIncludesAny: [["sensor"]],
      requireNoActionQueueSuggestion: true,
    },
  },
  {
    id: "autoflower-recovery-risk-after-stress",
    description:
      "Autoflower past a heat-stress event now showing early recovery signs; " +
      "diary note floats a hard prune to 'speed recovery'. Because autoflowers " +
      "cannot re-veg lost time, engine must still stay Low confidence, avoid " +
      "any action queue suggestion, and keep the autoflower heavy-stress " +
      "guardrails (defoliation/transplant) in what_not_to_do.",
    input: {
      now: GOLDEN_NOW,
      plant: {
        id: "plant-auto-recovery-1",
        grow_id: "grow-a2",
        tent_id: "tent-a2",
        stage: "veg",
        strain: "Fast Auto Test",
        name: "Auto-Recovery-A",
      },
      growEvents: [
        {
          occurred_at: daysAgo(3),
          event_type: "diary_note",
          source: "manual",
          note: "Heat stress event during a lights-on power flicker.",
        },
        {
          occurred_at: hoursAgo(6),
          event_type: "diary_note",
          source: "manual",
          note: "New growth looks slightly better today — considering a hard prune to speed recovery.",
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
