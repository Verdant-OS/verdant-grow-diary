/**
 * aiContextSufficiencyRules — pure helper that evaluates whether Verdant has
 * enough trustworthy, real grow context to support AI recommendations.
 *
 * Pure & deterministic. No React. No Supabase. No raw payload leakage in
 * messages — only short, UI-safe reason codes and human-readable summaries.
 *
 * Demo/mock/unavailable data NEVER increases AI confidence. Mixed sources
 * cap the ceiling at medium. Demo/unavailable cap at low.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AiContextDataSource =
  | "supabase"
  | "mock"
  | "mixed"
  | "unavailable"
  | "unknown";

export interface AiContextDataMeta {
  /** Optional data-source label aligned with GrowDataSourceMeta. */
  dataSource?: AiContextDataSource;
  /** True when the value is mock/demo backed. */
  isDemoData?: boolean;
}

export interface AiContextPlantInput {
  id?: string;
  stage?: string | null;
  strain?: string | null;
  medium?: string | null;
}

export interface AiContextDiaryEntryInput {
  /** ISO timestamp string or epoch ms. */
  at?: string | number | Date | null;
  type?: string | null;
}

export interface AiContextSensorReadingInput {
  /** ISO timestamp string or epoch ms. */
  at?: string | number | Date | null;
  temp?: number | null;
  rh?: number | null;
  vpd?: number | null;
  ph?: number | null;
  ec?: number | null;
}

export type AiCoachQuestionKind =
  | "general"
  | "environment"
  | "nutrient"
  | "visual-diagnosis";

export interface AiContextInput {
  activeGrow?: { id?: string } | null;
  plants?: readonly AiContextPlantInput[];
  recentDiaryEntries?: readonly AiContextDiaryEntryInput[];
  recentWateringOrFeeding?: readonly AiContextDiaryEntryInput[];
  recentSensorReadings?: readonly AiContextSensorReadingInput[];
  /** True when at least one usable plant/context photo is available. */
  hasPhoto?: boolean;
  /** Source metadata for sensor data (mirrors GrowDataSourceMeta). */
  sensorMeta?: AiContextDataMeta | null;
  /** Source metadata for the grow/plant context. */
  contextMeta?: AiContextDataMeta | null;
  /** Optional question kind to scope which signals are required. */
  questionKind?: AiCoachQuestionKind;
  /** Optional "now" injection for deterministic tests. Defaults to Date.now(). */
  now?: number;
}

export type AiContextSufficiency = "sufficient" | "limited" | "insufficient";
export type AiContextConfidenceCeiling = "high" | "medium" | "low";

export interface AiContextSufficiencyResult {
  sufficiency: AiContextSufficiency;
  confidenceCeiling: AiContextConfidenceCeiling;
  missing: string[];
  warnings: string[];
  trustedForAi: boolean;
  reasons: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Sensor reading older than this is considered stale. */
export const DEFAULT_SENSOR_STALE_MS = 6 * 60 * 60 * 1000; // 6h
/** Diary/watering activity older than this is considered missing-recent. */
export const DEFAULT_RECENT_ACTIVITY_MS = 7 * 24 * 60 * 60 * 1000; // 7d

const FINITE = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n);

function toEpoch(at: string | number | Date | null | undefined): number | null {
  if (at == null) return null;
  if (at instanceof Date) {
    const t = at.getTime();
    return Number.isFinite(t) ? t : null;
  }
  if (typeof at === "number") return Number.isFinite(at) ? at : null;
  if (typeof at === "string") {
    const t = Date.parse(at);
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

function nonBlank(s: unknown): s is string {
  return typeof s === "string" && s.trim().length > 0;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export function evaluateAiContextSufficiency(
  input: AiContextInput | null | undefined,
): AiContextSufficiencyResult {
  const missing: string[] = [];
  const warnings: string[] = [];
  const reasons: string[] = [];

  const safe: AiContextInput = input ?? {};
  const kind: AiCoachQuestionKind = safe.questionKind ?? "general";
  const now =
    typeof safe.now === "number" && Number.isFinite(safe.now)
      ? safe.now
      : Date.now();

  const plants = Array.isArray(safe.plants) ? safe.plants : [];
  const diary = Array.isArray(safe.recentDiaryEntries)
    ? safe.recentDiaryEntries
    : [];
  const watering = Array.isArray(safe.recentWateringOrFeeding)
    ? safe.recentWateringOrFeeding
    : [];
  const sensors = Array.isArray(safe.recentSensorReadings)
    ? safe.recentSensorReadings
    : [];

  // --- Hard floor: no active grow / no plants ------------------------------
  if (!safe.activeGrow || !nonBlank(safe.activeGrow.id)) {
    missing.push("active-grow");
  }
  if (plants.length === 0) {
    missing.push("plants");
  }

  // --- Plant attributes ----------------------------------------------------
  let plantsMissingStage = 0;
  let plantsMissingStrain = 0;
  let plantsMissingMedium = 0;
  for (const p of plants) {
    if (!nonBlank(p?.stage)) plantsMissingStage += 1;
    if (!nonBlank(p?.strain)) plantsMissingStrain += 1;
    if (!nonBlank(p?.medium)) plantsMissingMedium += 1;
  }
  if (plants.length > 0 && plantsMissingStage === plants.length) {
    missing.push("plant-stage");
  } else if (plantsMissingStage > 0) {
    warnings.push("partial-plant-stage");
  }
  if (plants.length > 0 && plantsMissingStrain === plants.length) {
    missing.push("plant-strain");
  } else if (plantsMissingStrain > 0) {
    warnings.push("partial-plant-strain");
  }
  if (plants.length > 0 && plantsMissingMedium === plants.length) {
    missing.push("plant-medium");
  } else if (plantsMissingMedium > 0) {
    warnings.push("partial-plant-medium");
  }

  // --- Recent diary / watering / feeding ----------------------------------
  const recentDiary = diary.filter((e) => {
    const t = toEpoch(e?.at);
    return t != null && now - t <= DEFAULT_RECENT_ACTIVITY_MS;
  });
  if (recentDiary.length === 0) {
    missing.push("recent-diary");
  }

  const recentWatering = watering.filter((e) => {
    const t = toEpoch(e?.at);
    return t != null && now - t <= DEFAULT_RECENT_ACTIVITY_MS;
  });
  if (recentWatering.length === 0) {
    missing.push("recent-watering-or-feeding");
  }

  // --- Sensor source metadata + freshness ---------------------------------
  const sensorSource = safe.sensorMeta?.dataSource ?? "unknown";
  const sensorIsDemo = !!safe.sensorMeta?.isDemoData;
  const contextSource = safe.contextMeta?.dataSource ?? "unknown";
  const contextIsDemo = !!safe.contextMeta?.isDemoData;

  if (sensorSource === "mock" || sensorIsDemo) {
    warnings.push("sensor-source:demo");
  }
  if (sensorSource === "mixed") {
    warnings.push("sensor-source:mixed");
  }
  if (sensorSource === "unavailable") {
    missing.push("sensor-source");
  }
  if (sensorSource === "unknown" && sensors.length === 0) {
    warnings.push("sensor-source:unknown");
  }

  // Sensor freshness — find newest valid reading.
  let newestSensorAt: number | null = null;
  let hasInvalidSensor = false;
  for (const r of sensors) {
    const t = toEpoch(r?.at);
    if (t == null) {
      hasInvalidSensor = true;
      continue;
    }
    if (newestSensorAt == null || t > newestSensorAt) newestSensorAt = t;
  }
  if (hasInvalidSensor) warnings.push("sensor-reading:invalid-timestamp");
  if (sensors.length > 0 && newestSensorAt == null) {
    warnings.push("sensor-reading:no-valid-timestamps");
  }
  const sensorStale =
    newestSensorAt != null && now - newestSensorAt > DEFAULT_SENSOR_STALE_MS;
  if (sensorStale) warnings.push("sensor-reading:stale");

  // --- Question-kind-specific signal checks -------------------------------
  const newestSensor = sensors.find((r) => {
    const t = toEpoch(r?.at);
    return t != null && t === newestSensorAt;
  });

  if (kind === "environment") {
    const hasTemp = !!newestSensor && FINITE(newestSensor.temp);
    const hasRh = !!newestSensor && FINITE(newestSensor.rh);
    const hasVpd = !!newestSensor && FINITE(newestSensor.vpd);
    if (!hasTemp) missing.push("env:temp");
    if (!hasRh) missing.push("env:rh");
    if (!hasVpd) missing.push("env:vpd");
  }

  if (kind === "nutrient") {
    const hasPh = !!newestSensor && FINITE(newestSensor.ph);
    const hasEc = !!newestSensor && FINITE(newestSensor.ec);
    if (!hasPh) missing.push("nutrient:ph");
    if (!hasEc) missing.push("nutrient:ec");
  }

  if (kind === "visual-diagnosis" && !safe.hasPhoto) {
    missing.push("visual:photo");
  }

  // --- Ceiling / sufficiency -----------------------------------------------
  let ceiling: AiContextConfidenceCeiling = "high";

  const demoAnywhere =
    sensorSource === "mock" ||
    sensorIsDemo ||
    contextSource === "mock" ||
    contextIsDemo;
  const mixedAnywhere = sensorSource === "mixed" || contextSource === "mixed";
  const unavailableAnywhere =
    sensorSource === "unavailable" || contextSource === "unavailable";

  if (demoAnywhere) {
    ceiling = "low";
    reasons.push("demo-data-cannot-increase-confidence");
  }
  if (unavailableAnywhere) {
    ceiling = "low";
    reasons.push("required-context-unavailable");
  }
  if (mixedAnywhere && ceiling === "high") {
    ceiling = "medium";
    reasons.push("mixed-real-and-demo-context");
  }
  if (sensorStale && ceiling === "high") {
    ceiling = "medium";
    reasons.push("sensor-data-stale");
  }
  if (warnings.length > 0 && ceiling === "high") {
    ceiling = "medium";
    reasons.push("partial-context-warnings");
  }

  // Floors based on missing
  const hardMissing = new Set(["active-grow", "plants"]);
  const hasHardMissing = missing.some((m) => hardMissing.has(m));
  if (hasHardMissing) {
    ceiling = "low";
    reasons.push("missing-core-grow-or-plants");
  }
  if (missing.length > 0 && ceiling === "high") {
    ceiling = "medium";
    reasons.push("missing-secondary-context");
  }

  let sufficiency: AiContextSufficiency;
  if (hasHardMissing || unavailableAnywhere) {
    sufficiency = "insufficient";
  } else if (
    demoAnywhere ||
    missing.length >= 3 ||
    (missing.length >= 1 && (mixedAnywhere || sensorStale))
  ) {
    sufficiency = "limited";
  } else if (missing.length === 0 && warnings.length === 0) {
    sufficiency = "sufficient";
  } else {
    sufficiency = "limited";
  }

  const trustedForAi =
    sufficiency !== "insufficient" && !demoAnywhere && !unavailableAnywhere;

  if (sufficiency === "sufficient" && reasons.length === 0) {
    reasons.push("sufficient-real-context");
  }

  return {
    sufficiency,
    confidenceCeiling: ceiling,
    missing: missing.slice(),
    warnings: warnings.slice(),
    trustedForAi,
    reasons: reasons.slice(),
  };
}
