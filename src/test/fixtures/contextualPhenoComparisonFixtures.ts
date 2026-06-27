/**
 * contextualPhenoComparisonFixtures
 *
 * Deterministic, demo-labeled fixture rows for the Contextual Pheno
 * Comparison v0.1 demo UI. Pure data. No I/O. No randomness.
 *
 * All timestamps fixed. No raw payloads. No ranking. No winner field.
 * Sources include trusted (live/manual/csv) and untrusted
 * (demo/stale/invalid/unknown) so the UI can prove its trust handling.
 */
import type { ContextualPhenoPlantInput } from "@/lib/contextualPhenoComparisonViewModel";

export const CONTEXTUAL_PHENO_COMPARISON_DEMO_BANNER =
  "Demo comparison data — not live sensor data.";

export const CONTEXTUAL_PHENO_COMPARISON_DEMO_PLANT_INPUTS: readonly ContextualPhenoPlantInput[] = [
  {
    plantId: "demo-plant-alpha",
    plantLabel: "Alpha",
    growId: "demo-grow-1",
    tentId: "demo-tent-1",
    strain: "Demo Kush",
    stage: "veg",
    status: "healthy",
    diaryCount: 6,
    photoCount: 4,
    wateringCount: 3,
    feedingCount: 2,
    trainingCount: 1,
    alertCount: 0,
    sensorReadings: [
      {
        source: "live",
        capturedAt: "2026-06-20T08:00:00.000Z",
        tempF: 76,
        rh: 58,
        vpd: 1.05,
        ppfd: 620,
      },
      {
        source: "manual",
        capturedAt: "2026-06-20T16:00:00.000Z",
        tempF: 78,
        rh: 55,
        vpd: 1.18,
        ppfd: null,
      },
    ],
    comparisonNotes: ["Steady canopy. Even node spacing."],
  },
  {
    plantId: "demo-plant-bravo",
    plantLabel: "Bravo",
    growId: "demo-grow-1",
    tentId: "demo-tent-1",
    strain: "Demo Kush",
    stage: "veg",
    status: "watch",
    diaryCount: 4,
    photoCount: 2,
    wateringCount: 3,
    feedingCount: 1,
    trainingCount: 0,
    alertCount: 1,
    sensorReadings: [
      {
        source: "csv",
        capturedAt: "2026-06-19T12:00:00.000Z",
        tempF: 74,
        rh: 62,
        vpd: 0.92,
        ppfd: 540,
      },
      {
        source: "stale",
        capturedAt: "2026-05-10T12:00:00.000Z",
        tempF: 80,
        rh: 50,
        vpd: 1.4,
        ppfd: 700,
      },
    ],
    comparisonNotes: ["Slight leaf droop noted on day 18."],
  },
  {
    plantId: "demo-plant-charlie",
    plantLabel: "Charlie",
    growId: "demo-grow-1",
    tentId: "demo-tent-2",
    strain: null,
    stage: null,
    status: null,
    diaryCount: 0,
    photoCount: 0,
    wateringCount: 0,
    feedingCount: 0,
    trainingCount: 0,
    alertCount: 0,
    sensorReadings: [
      {
        source: "demo",
        capturedAt: "2026-06-18T12:00:00.000Z",
        tempF: 999,
        rh: 100,
        vpd: 0,
        ppfd: 0,
      },
      {
        source: "invalid",
        capturedAt: "2026-06-18T13:00:00.000Z",
        tempF: null,
        rh: null,
        vpd: null,
        ppfd: null,
      },
    ],
    comparisonNotes: [],
  },
];

/**
 * v0.3 empty-state fixture set. Four deterministic plants exercising every
 * empty-state code path in the panel:
 *  - Full:        full context, trusted live + manual sensors.
 *  - Partial:     some logs, mix of trusted + untrusted sensors.
 *  - Sparse:      no photos, no sensors, has diary only.
 *  - Untrusted:   only demo/stale/invalid sensor evidence; unknown metadata.
 * All timestamps fixed. No raw payloads. No ranking. No winner fields.
 */
export const CONTEXTUAL_PHENO_COMPARISON_EMPTY_STATE_PLANT_INPUTS: readonly ContextualPhenoPlantInput[] = [
  {
    plantId: "demo-empty-full",
    plantLabel: "Full",
    growId: "demo-grow-empty",
    tentId: "demo-tent-empty",
    strain: "Demo Kush",
    stage: "veg",
    status: "watch",
    diaryCount: 5,
    photoCount: 3,
    wateringCount: 2,
    feedingCount: 2,
    trainingCount: 1,
    alertCount: 0,
    sensorReadings: [
      {
        source: "live",
        capturedAt: "2026-06-20T08:00:00.000Z",
        tempF: 76,
        rh: 58,
        vpd: 1.05,
        ppfd: 600,
      },
      {
        source: "manual",
        capturedAt: "2026-06-20T16:00:00.000Z",
        tempF: 78,
        rh: 55,
        vpd: 1.18,
        ppfd: 550,
      },
    ],
    comparisonNotes: ["Full context plant for empty-state contrast."],
  },
  {
    plantId: "demo-empty-partial",
    plantLabel: "Partial",
    growId: "demo-grow-empty",
    tentId: "demo-tent-empty",
    strain: "Demo Kush",
    stage: "veg",
    status: "watch",
    diaryCount: 3,
    photoCount: 1,
    wateringCount: 2,
    feedingCount: 0,
    trainingCount: 0,
    alertCount: 0,
    sensorReadings: [
      {
        source: "csv",
        capturedAt: "2026-06-19T12:00:00.000Z",
        tempF: 74,
        rh: 60,
        vpd: 0.95,
        ppfd: 500,
      },
      {
        source: "stale",
        capturedAt: "2026-04-01T12:00:00.000Z",
        tempF: 80,
        rh: 50,
        vpd: 1.4,
        ppfd: 700,
      },
    ],
    comparisonNotes: [],
  },
  {
    plantId: "demo-empty-sparse",
    plantLabel: "Sparse",
    growId: "demo-grow-empty",
    tentId: "demo-tent-empty",
    strain: "Demo Kush",
    stage: "veg",
    status: "watch",
    diaryCount: 1,
    photoCount: 0,
    wateringCount: 0,
    feedingCount: 0,
    trainingCount: 0,
    alertCount: 0,
    sensorReadings: [],
    comparisonNotes: [],
  },
  {
    plantId: "demo-empty-untrusted",
    plantLabel: "Untrusted",
    growId: "demo-grow-empty",
    tentId: "demo-tent-empty",
    strain: null,
    stage: null,
    status: null,
    diaryCount: 0,
    photoCount: 0,
    wateringCount: 0,
    feedingCount: 0,
    trainingCount: 0,
    alertCount: 0,
    sensorReadings: [
      {
        source: "demo",
        capturedAt: "2026-06-18T12:00:00.000Z",
        tempF: 999,
        rh: 100,
        vpd: 0,
        ppfd: 0,
      },
      {
        source: "invalid",
        capturedAt: "2026-06-18T13:00:00.000Z",
        tempF: null,
        rh: null,
        vpd: null,
        ppfd: null,
      },
      {
        source: "unknown-vendor-x",
        capturedAt: "2026-06-18T14:00:00.000Z",
        tempF: null,
        rh: null,
        vpd: null,
        ppfd: null,
      },
    ],
    comparisonNotes: [],
  },
];

