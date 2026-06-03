/**
 * VERDANT-18: Strict AI Doctor contract types.
 *
 * Pure types only — no I/O, no React, no Supabase.
 *
 * Hard constraints (carried from the Verdant master prompt + V0 Sentinel):
 *   - AI Doctor must be cautious and contextual.
 *   - Invalid/stale telemetry must never produce a "healthy" analysis.
 *   - Environment readings alone must not recommend nutrient changes.
 *   - Action Queue suggestions are advisory and approval-required only —
 *     never executable device commands.
 *   - Autoflower-sensitive recommendations stay conservative.
 */

export type SensorSourceCategory =
  | "live"
  | "manual"
  | "demo"
  | "stale"
  | "invalid"
  | "imported";

export type PlantStage =
  | "seedling"
  | "veg"
  | "flower"
  | "late_flower"
  | "harvest"
  | "drying"
  | "curing"
  | "unknown";

export type RiskLevel = "low" | "medium" | "high" | "critical";

/** Numeric snapshot used as DoctorContext input. */
export interface DoctorSensorSnapshot {
  /** ISO-8601 capture timestamp. */
  capturedAt: string;
  /** Normalized source category from the sensor truth layer. */
  source: SensorSourceCategory;
  temperatureC: number | null;
  humidityPct: number | null;
  vpdKpa: number | null;
  co2Ppm: number | null;
  soilMoisturePct: number | null;
}

export interface DoctorPlantContext {
  id: string;
  strain?: string | null;
  stage?: PlantStage | null;
  isAutoflower?: boolean;
  /** Plant age in days. */
  ageDays?: number | null;
  potSize?: string | null;
  medium?: string | null;
}

export interface DoctorTargets {
  temperatureC?: { min: number; max: number } | null;
  humidityPct?: { min: number; max: number } | null;
  vpdKpa?: { min: number; max: number } | null;
}

export interface DoctorContext {
  growId: string;
  tentId: string;
  plant: DoctorPlantContext | null;
  snapshot: DoctorSensorSnapshot;
  targets?: DoctorTargets | null;
  /** Count of diary/log entries in the recent window. */
  recentDiaryEntryCount?: number;
  /** Free-form note bag (e.g. recent watering). Purely contextual. */
  notes?: readonly string[];
}

/**
 * Suggested Action Queue item carried inside a DoctorAnalysis. The doctor
 * never writes to the queue itself; the suggestion is approval-required
 * and contains advisory text only.
 */
export interface DoctorActionSuggestion {
  /** Always "advisory" — no device control or auto-dosing. */
  actionType: "advisory";
  /** Always "pending_approval" — grower must approve. */
  status: "pending_approval";
  targetMetric: string;
  suggestedChange: string;
  reason: string;
  riskLevel: RiskLevel;
}

export interface DoctorAnalysis {
  /** Short, presenter-safe summary sentence. */
  summary: string;
  /** Best-guess issue label. Empty string if none. */
  likelyIssue: string;
  /** 0..1 calibrated confidence. */
  confidence: number;
  /** Concrete observations supporting the analysis. */
  evidence: readonly string[];
  /** Data the doctor would need to be more certain. */
  missingInformation: readonly string[];
  /** Possible causes, ranked most → least likely. */
  possibleCauses: readonly string[];
  /** Single highest-priority immediate action (review-first text). */
  immediateAction: string;
  /** Things the grower should explicitly avoid. */
  whatNotToDo: readonly string[];
  /** 24-hour follow-up plan. */
  followUp24h: string;
  /** 3-day recovery plan. */
  followUp3d: string;
  /** Overall risk classification. */
  riskLevel: RiskLevel;
  /** Whether an Action Queue draft is appropriate. */
  shouldCreateActionQueueItem: boolean;
  /** Suggested draft when shouldCreateActionQueueItem is true. */
  actionQueueSuggestion?: DoctorActionSuggestion | null;
}
