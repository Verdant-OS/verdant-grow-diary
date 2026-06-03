/**
 * VERDANT-18: Golden DoctorAnalysis fixtures.
 *
 * Each fixture pairs a representative DoctorContext with a deterministic
 * DoctorAnalysis output. Used by MockAIClient and the Doctor test suite.
 *
 * Hard constraints respected by every fixture:
 *   - Invalid or stale telemetry NEVER yields a "healthy" analysis.
 *   - Action suggestions are advisory + pending_approval only.
 *   - Autoflower cases stay conservative (review/observe, no high-stress
 *     training, no aggressive nutrient changes).
 *   - Low-confidence outputs MUST set shouldCreateActionQueueItem = false.
 */
import type { DoctorAnalysis, DoctorContext } from "./types";
import { fixtureKeyFor } from "./fixtureKey";

interface FixtureRecord {
  name: string;
  context: DoctorContext;
  analysis: DoctorAnalysis;
}

const FRESH = "2026-06-03T11:55:00.000Z";
const STALE = "2026-06-03T09:00:00.000Z";

// ---------------------------------------------------------------------------
// Fixture 1 — High VPD in flower (clean signal, recommend review)
// ---------------------------------------------------------------------------
const cleanHighVpdFlower: FixtureRecord = {
  name: "clean_high_vpd_flower",
  context: {
    growId: "grow-1",
    tentId: "tent-1",
    plant: { id: "plant-1", stage: "flower", isAutoflower: false },
    snapshot: {
      capturedAt: FRESH,
      source: "live",
      temperatureC: 27,
      humidityPct: 40,
      vpdKpa: 1.8,
      co2Ppm: 700,
      soilMoisturePct: 45,
    },
    targets: {
      temperatureC: { min: 22, max: 28 },
      humidityPct: { min: 50, max: 60 },
      vpdKpa: { min: 0.9, max: 1.4 },
    },
    recentDiaryEntryCount: 3,
  },
  analysis: {
    summary: "VPD running high for flower with low humidity.",
    likelyIssue: "Elevated VPD with low RH",
    confidence: 0.78,
    evidence: [
      "VPD 1.8 kPa exceeds flower target band (0.9–1.4 kPa)",
      "Humidity 40% below target (50–60%)",
    ],
    missingInformation: ["Leaf surface temperature", "Recent transpiration notes"],
    possibleCauses: [
      "Inadequate humidification for current temperature",
      "High airflow drying the canopy",
    ],
    immediateAction:
      "Review humidification and airflow settings before making any equipment change.",
    whatNotToDo: [
      "Do not raise nutrient strength based on environment alone",
      "Do not spike RH rapidly; avoid >10% swings",
    ],
    followUp24h: "Recheck RH and VPD in 24h after gradual humidifier increase.",
    followUp3d: "If VPD remains >1.6 kPa, review whole-room humidification capacity.",
    riskLevel: "medium",
    shouldCreateActionQueueItem: true,
    actionQueueSuggestion: {
      actionType: "advisory",
      status: "pending_approval",
      targetMetric: "vpd_kpa",
      suggestedChange:
        "Review humidification and airflow to gradually reduce VPD toward target band.",
      reason: "VPD 1.8 kPa exceeds flower target; RH 40% below band.",
      riskLevel: "medium",
    },
  },
};

// ---------------------------------------------------------------------------
// Fixture 2 — Stale sensor reading
// ---------------------------------------------------------------------------
const staleSensor: FixtureRecord = {
  name: "stale_sensor",
  context: {
    growId: "grow-1",
    tentId: "tent-1",
    plant: { id: "plant-1", stage: "veg", isAutoflower: false },
    snapshot: {
      capturedAt: STALE,
      source: "stale",
      temperatureC: 24,
      humidityPct: 55,
      vpdKpa: 1.0,
      co2Ppm: 700,
      soilMoisturePct: 50,
    },
    recentDiaryEntryCount: 2,
  },
  analysis: {
    summary: "Sensor data is stale; environment cannot be assessed.",
    likelyIssue: "",
    confidence: 0.2,
    evidence: ["Reading older than freshness threshold"],
    missingInformation: ["Current sensor reading", "Recent manual check"],
    possibleCauses: ["Sensor offline", "Bridge disconnected"],
    immediateAction: "Capture a fresh sensor reading or manual snapshot before acting.",
    whatNotToDo: [
      "Do not change equipment settings based on stale data",
      "Do not adjust nutrients from stale environment data",
    ],
    followUp24h: "Verify sensor connectivity within 24h.",
    followUp3d: "If still offline in 3 days, investigate bridge or device health.",
    riskLevel: "low",
    shouldCreateActionQueueItem: false,
    actionQueueSuggestion: null,
  },
};

// ---------------------------------------------------------------------------
// Fixture 3 — Invalid reading
// ---------------------------------------------------------------------------
const invalidReading: FixtureRecord = {
  name: "invalid_reading",
  context: {
    growId: "grow-1",
    tentId: "tent-1",
    plant: { id: "plant-1", stage: "veg", isAutoflower: false },
    snapshot: {
      capturedAt: FRESH,
      source: "invalid",
      temperatureC: 24,
      humidityPct: 55,
      vpdKpa: 1.0,
      co2Ppm: 700,
      soilMoisturePct: 50,
    },
    recentDiaryEntryCount: 2,
  },
  analysis: {
    summary: "Telemetry failed validation; environment assessment not possible.",
    likelyIssue: "",
    confidence: 0.1,
    evidence: ["Source classified as invalid"],
    missingInformation: ["A trustworthy sensor reading"],
    possibleCauses: ["Sensor fault", "Bridge data corruption"],
    immediateAction: "Re-capture a fresh, validated reading before any action.",
    whatNotToDo: [
      "Do not trust the current values",
      "Do not change equipment or nutrients based on this data",
    ],
    followUp24h: "Recapture and revalidate sensor data.",
    followUp3d: "If repeated failures, inspect sensor hardware.",
    riskLevel: "low",
    shouldCreateActionQueueItem: false,
    actionQueueSuggestion: null,
  },
};

// ---------------------------------------------------------------------------
// Fixture 4 — Missing plant context
// ---------------------------------------------------------------------------
const missingPlantContext: FixtureRecord = {
  name: "missing_plant_context",
  context: {
    growId: "grow-1",
    tentId: "tent-1",
    plant: null,
    snapshot: {
      capturedAt: FRESH,
      source: "live",
      temperatureC: 24,
      humidityPct: 55,
      vpdKpa: 1.0,
      co2Ppm: 700,
      soilMoisturePct: 50,
    },
    recentDiaryEntryCount: 0,
  },
  analysis: {
    summary: "Environment looks reasonable, but no plant context is available.",
    likelyIssue: "",
    confidence: 0.3,
    evidence: ["Sensor reading within plausible ranges"],
    missingInformation: ["Plant identity, stage, age", "Recent diary entries"],
    possibleCauses: [],
    immediateAction:
      "Add the plant to the tent and log a diary entry before requesting a diagnosis.",
    whatNotToDo: ["Do not infer plant health from environment alone"],
    followUp24h: "Add plant + 1 photo + 1 diary entry.",
    followUp3d: "Continue logging twice daily for richer context.",
    riskLevel: "low",
    shouldCreateActionQueueItem: false,
    actionQueueSuggestion: null,
  },
};

// ---------------------------------------------------------------------------
// Fixture 5 — Autoflower conservative recommendation
// ---------------------------------------------------------------------------
const autoflowerConservative: FixtureRecord = {
  name: "autoflower_conservative",
  context: {
    growId: "grow-2",
    tentId: "tent-2",
    plant: {
      id: "plant-auto",
      stage: "flower",
      isAutoflower: true,
      ageDays: 45,
    },
    snapshot: {
      capturedAt: FRESH,
      source: "live",
      temperatureC: 26,
      humidityPct: 62,
      vpdKpa: 1.0,
      co2Ppm: 700,
      soilMoisturePct: 55,
    },
    targets: {
      temperatureC: { min: 22, max: 27 },
      humidityPct: { min: 45, max: 55 },
      vpdKpa: { min: 1.0, max: 1.4 },
    },
    recentDiaryEntryCount: 4,
  },
  analysis: {
    summary: "Autoflower in flower: humidity slightly high; stay conservative.",
    likelyIssue: "Elevated RH for late flower",
    confidence: 0.7,
    evidence: ["RH 62% above target band (45–55%)"],
    missingInformation: ["Trichome inspection notes"],
    possibleCauses: ["Insufficient extraction", "Watering near canopy"],
    immediateAction:
      "Review extraction and dehumidification; make gradual changes only.",
    whatNotToDo: [
      "Do not perform heavy defoliation",
      "Do not increase nutrient strength",
      "Do not apply high-stress training",
      "Do not transplant",
    ],
    followUp24h: "Recheck RH in 24h after small extraction adjustment.",
    followUp3d: "Aim for RH within target band by day 3 without abrupt swings.",
    riskLevel: "medium",
    shouldCreateActionQueueItem: true,
    actionQueueSuggestion: {
      actionType: "advisory",
      status: "pending_approval",
      targetMetric: "humidity_pct",
      suggestedChange:
        "Review extraction and dehumidification; conservative changes only for autoflower.",
      reason: "RH 62% above target for autoflower late flower.",
      riskLevel: "medium",
    },
  },
};

// ---------------------------------------------------------------------------
// Fixture 6 — Low-confidence, no action
// ---------------------------------------------------------------------------
const lowConfidenceNoAction: FixtureRecord = {
  name: "low_confidence_no_action",
  context: {
    growId: "grow-1",
    tentId: "tent-1",
    plant: { id: "plant-1", stage: "seedling", isAutoflower: false },
    snapshot: {
      capturedAt: FRESH,
      source: "manual",
      temperatureC: 23,
      humidityPct: 70,
      vpdKpa: 0.8,
      co2Ppm: null,
      soilMoisturePct: 60,
    },
    recentDiaryEntryCount: 1,
  },
  analysis: {
    summary: "Inconclusive signal; more data needed before any action.",
    likelyIssue: "",
    confidence: 0.35,
    evidence: ["Single manual reading with limited history"],
    missingInformation: [
      "Multi-day sensor trend",
      "Recent photos",
      "Watering history",
    ],
    possibleCauses: [],
    immediateAction: "Log additional readings and a photo over the next 24h.",
    whatNotToDo: [
      "Do not change equipment based on one manual reading",
      "Do not adjust nutrients",
    ],
    followUp24h: "Capture 2 more sensor snapshots and a top-down photo.",
    followUp3d: "Reassess with 3 days of history.",
    riskLevel: "low",
    shouldCreateActionQueueItem: false,
    actionQueueSuggestion: null,
  },
};

// ---------------------------------------------------------------------------
// Fixture 7 — High humidity in flower
// ---------------------------------------------------------------------------
const highHumidityFlower: FixtureRecord = {
  name: "high_humidity_flower",
  context: {
    growId: "grow-1",
    tentId: "tent-1",
    plant: { id: "plant-1", stage: "flower", isAutoflower: false },
    snapshot: {
      capturedAt: FRESH,
      source: "live",
      temperatureC: 25,
      humidityPct: 70,
      vpdKpa: 0.8,
      co2Ppm: 700,
      soilMoisturePct: 55,
    },
    targets: {
      temperatureC: { min: 22, max: 27 },
      humidityPct: { min: 45, max: 55 },
      vpdKpa: { min: 1.0, max: 1.4 },
    },
    recentDiaryEntryCount: 5,
  },
  analysis: {
    summary: "Humidity is high for flower; bud-rot risk if sustained.",
    likelyIssue: "Excessive RH in flower",
    confidence: 0.82,
    evidence: ["RH 70% well above flower target (45–55%)", "VPD 0.8 kPa below target"],
    missingInformation: ["Canopy inspection for early mold signs"],
    possibleCauses: [
      "Under-sized dehumidifier",
      "Poor extraction",
      "Recent watering raising tent RH",
    ],
    immediateAction:
      "Review extraction and dehumidification; inspect canopy for mold.",
    whatNotToDo: [
      "Do not spike temperature rapidly to compensate",
      "Do not skip canopy inspection",
    ],
    followUp24h: "Recheck RH in 24h and inspect dense bud sites.",
    followUp3d: "If RH stays >65%, escalate dehumidification capacity.",
    riskLevel: "high",
    shouldCreateActionQueueItem: true,
    actionQueueSuggestion: {
      actionType: "advisory",
      status: "pending_approval",
      targetMetric: "humidity_pct",
      suggestedChange:
        "Review extraction and dehumidification capacity; inspect canopy for mold.",
      reason: "RH 70% well above flower target band.",
      riskLevel: "high",
    },
  },
};

// ---------------------------------------------------------------------------
// Fixture 8 — Within target, no action
// ---------------------------------------------------------------------------
const withinTargetNoAction: FixtureRecord = {
  name: "within_target_no_action",
  context: {
    growId: "grow-1",
    tentId: "tent-1",
    plant: { id: "plant-1", stage: "veg", isAutoflower: false },
    snapshot: {
      capturedAt: FRESH,
      source: "live",
      temperatureC: 24,
      humidityPct: 55,
      vpdKpa: 1.0,
      co2Ppm: 800,
      soilMoisturePct: 60,
    },
    targets: {
      temperatureC: { min: 22, max: 28 },
      humidityPct: { min: 50, max: 65 },
      vpdKpa: { min: 0.8, max: 1.4 },
    },
    recentDiaryEntryCount: 4,
  },
  analysis: {
    summary: "Environment within target bands; no action needed.",
    likelyIssue: "",
    confidence: 0.85,
    evidence: ["All metrics within configured target bands"],
    missingInformation: [],
    possibleCauses: [],
    immediateAction: "Continue current routine and log the next scheduled check.",
    whatNotToDo: [
      "Do not change equipment settings without a reason",
      "Do not raise nutrients based on environment alone",
    ],
    followUp24h: "Standard daily check.",
    followUp3d: "Standard 3-day check-in.",
    riskLevel: "low",
    shouldCreateActionQueueItem: false,
    actionQueueSuggestion: null,
  },
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const DOCTOR_FIXTURES: readonly FixtureRecord[] = [
  cleanHighVpdFlower,
  staleSensor,
  invalidReading,
  missingPlantContext,
  autoflowerConservative,
  lowConfidenceNoAction,
  highHumidityFlower,
  withinTargetNoAction,
];

/** Build a fresh Map<key, analysis> for MockAIClient. */
export function buildDoctorFixtureRegistry(): Map<string, DoctorAnalysis> {
  const map = new Map<string, DoctorAnalysis>();
  for (const f of DOCTOR_FIXTURES) {
    const key = fixtureKeyFor(f.context);
    if (map.has(key)) {
      throw new Error(
        `Duplicate fixture key detected: "${key}" (fixture "${f.name}"). ` +
          `Adjust context fields so each fixture has a unique deterministic key.`,
      );
    }
    map.set(key, f.analysis);
  }
  return map;
}

/** Convenience accessor for tests. */
export function getFixtureByName(name: string): FixtureRecord {
  const hit = DOCTOR_FIXTURES.find((f) => f.name === name);
  if (!hit) throw new Error(`Doctor fixture "${name}" not found.`);
  return hit;
}

export type { FixtureRecord };
