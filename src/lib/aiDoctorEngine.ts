/**
 * AI Doctor Engine — Phase 1.
 *
 * Typed, test-backed foundation for Verdant's cautious AI Doctor pipeline.
 *
 * This file is engine + types only:
 *   - Vision step: stub that validates the input file and returns a
 *     low-confidence descriptive placeholder. No model is invoked.
 *   - Context step: re-exports the pure row compiler from
 *     `aiDoctorContextCompiler` so callers have a single entry point.
 *   - Diagnosis step: stub that returns a cautious, structured
 *     `DiagnosisResult` derived only from the supplied context. It never
 *     diagnoses from a single image, never recommends nutrient,
 *     irrigation, or equipment changes, and never emits device commands.
 *
 * Hard safety:
 *   - No Supabase reads/writes, no alerts, no Action Queue writes.
 *   - No external model/API calls.
 *   - No device control.
 *   - No service_role or bridge tokens referenced anywhere.
 */

import {
  compilePlantContextFromRows,
  type PlantContextPayload,
  type SensorSourceTag,
} from "./aiDoctorContextCompiler";

export {
  compilePlantContextFromRows,
  type PlantContextPayload,
  type SensorSourceTag,
  type RecentGrowEvent,
  type RecentSensorReading,
  type SensorRollingAverages,
  type SensorSourceGroup,
  type CompilePlantContextFromRowsInput,
} from "./aiDoctorContextCompiler";

// ---------------------------------------------------------------------------
// Vision step
// ---------------------------------------------------------------------------

export interface VisionAnalysisResult {
  visual_summary: string;
  leaf_observations: readonly string[];
  structural_observations: readonly string[];
  color_and_pigmentation: readonly string[];
  pest_disease_indicators: readonly string[];
  growth_stage_visual_cues: readonly string[];
  image_quality_notes: readonly string[];
  /** 0..1 image-quality estimate (0 when not actually analyzed). */
  image_quality_score: number;
  /** 0..1 raw self-reported confidence (0 in stub mode). */
  confidence: number;
}

/**
 * Stubbed vision pass. Validates that an image file was supplied, then
 * returns a deterministic low-confidence placeholder.
 *
 * Intentionally does NOT inspect pixels, call models, or claim any visual
 * diagnosis — a single image is never enough for a confident call.
 */
export async function executeVisionAnalysis(
  imageFile: File,
): Promise<VisionAnalysisResult> {
  if (!imageFile || typeof (imageFile as File).size !== "number") {
    throw new Error("executeVisionAnalysis: image file is required");
  }
  if (imageFile.size <= 0) {
    throw new Error("executeVisionAnalysis: image file is empty");
  }
  return Object.freeze({
    visual_summary:
      "Stub vision pass — image received but not analyzed. No visual diagnosis produced.",
    leaf_observations: Object.freeze([]) as readonly string[],
    structural_observations: Object.freeze([]) as readonly string[],
    color_and_pigmentation: Object.freeze([]) as readonly string[],
    pest_disease_indicators: Object.freeze([]) as readonly string[],
    growth_stage_visual_cues: Object.freeze([]) as readonly string[],
    image_quality_notes: Object.freeze([
      "Stub pass: image not inspected by any model.",
    ]) as readonly string[],
    image_quality_score: 0,
    confidence: 0,
  });
}

// ---------------------------------------------------------------------------
// Diagnosis step
// ---------------------------------------------------------------------------

export type RiskLevel = "low" | "medium" | "high";

export interface ActionQueueSuggestion {
  /** Always advisory in Phase 1 — never an executable device command. */
  action_type: "advisory";
  /** Always pending approval — Action Queue stays approval-required. */
  status: "pending_approval";
  reason: string;
  risk_level: RiskLevel;
}

export interface DiagnosisResult {
  summary: string;
  likely_issue: string;
  /** 0..1 calibrated confidence. */
  confidence: number;
  evidence: readonly string[];
  missing_information: readonly string[];
  possible_causes: readonly string[];
  immediate_action: string;
  what_not_to_do: readonly string[];
  twenty_four_hour_follow_up: string;
  three_day_recovery_plan: string;
  risk_level: RiskLevel;
  action_queue_suggestion: ActionQueueSuggestion | null;
}

const TRUSTWORTHY_SOURCES: ReadonlySet<SensorSourceTag> = new Set([
  "live",
  "manual",
]);

interface ContextStrength {
  hasTrustworthySensors: boolean;
  hasRecentEvents: boolean;
  hasStaleOrInvalid: boolean;
  hasDemoOnly: boolean;
}

function assessContext(context: PlantContextPayload): ContextStrength {
  const trustworthyGroups = context.sensor_groups.filter((g) =>
    TRUSTWORTHY_SOURCES.has(g.source),
  );
  const hasTrustworthySensors = trustworthyGroups.some(
    (g) => g.sample_count > 0,
  );
  const hasRecentEvents = context.recent_grow_events.length > 0;
  const hasStaleOrInvalid = context.sensor_groups.some(
    (g) => g.source === "stale" || g.source === "invalid",
  );
  const hasDemoOnly =
    !hasTrustworthySensors &&
    context.sensor_groups.some((g) => g.source === "demo");
  return {
    hasTrustworthySensors,
    hasRecentEvents,
    hasStaleOrInvalid,
    hasDemoOnly,
  };
}

/**
 * Stubbed multimodal diagnosis. Produces a cautious, structured
 * `DiagnosisResult` derived from the supplied context only.
 *
 * Rules baked in:
 *   - Single image is never enough → confidence capped at 0.4 in stub.
 *   - Stale/invalid telemetry is never treated as healthy.
 *   - Demo-only context never produces a confident diagnosis.
 *   - No nutrient, irrigation, or equipment change recommendations.
 *   - Never produces device commands.
 *   - Action queue suggestion (if any) is advisory + pending_approval.
 */
export async function generateMultimodalDiagnosis(
  visionData: VisionAnalysisResult,
  context: PlantContextPayload,
): Promise<DiagnosisResult> {
  const strength = assessContext(context);

  const evidence: string[] = [];
  if (context.plant_id) {
    evidence.push(
      `Plant context: id=${context.plant_id}${
        context.stage ? `, stage=${context.stage}` : ""
      }${context.strain ? `, strain=${context.strain}` : ""}`,
    );
  }
  for (const group of context.sensor_groups) {
    evidence.push(
      `Sensor group ${group.source}: ${group.sample_count} reading(s) in last 7d`,
    );
  }
  for (const dev of context.notable_deviations) {
    evidence.push(`Deviation: ${dev}`);
  }
  if (strength.hasRecentEvents) {
    evidence.push(
      `Recent grow events (14d): ${context.recent_grow_events.length}`,
    );
  }
  evidence.push(
    `Vision pass: stub (image_quality_score=${visionData.image_quality_score})`,
  );

  const missing_information: string[] = [];
  if (!strength.hasTrustworthySensors) {
    missing_information.push(
      "No live or manual sensor readings in the last 7 days.",
    );
  }
  if (strength.hasStaleOrInvalid) {
    missing_information.push(
      "Some recent sensor readings are stale or invalid — fresh confirmation needed.",
    );
  }
  if (!strength.hasRecentEvents) {
    missing_information.push(
      "No grow events logged in the last 14 days for context.",
    );
  }
  if (strength.hasDemoOnly) {
    missing_information.push(
      "Only demo sensor data available — not usable for a real diagnosis.",
    );
  }
  if (visionData.image_quality_score <= 0) {
    missing_information.push(
      "Image was not analyzed in this stub pass — no visual evidence available.",
    );
  }
  if (!context.stage) {
    missing_information.push("Plant stage is not recorded.");
  }

  // Confidence stays low in Phase 1: stub vision + no real model call.
  const confidence = strength.hasTrustworthySensors && strength.hasRecentEvents
    ? 0.3
    : 0.1;

  const risk_level: RiskLevel = strength.hasStaleOrInvalid
    ? "medium"
    : "low";

  const summary = strength.hasTrustworthySensors
    ? "Engine Phase 1 stub: observation-only summary based on supplied context."
    : "Engine Phase 1 stub: insufficient trustworthy context for a real diagnosis.";

  const likely_issue = "";

  const possible_causes: string[] = [];
  if (context.notable_deviations.length > 0) {
    possible_causes.push(
      "Environmental drift consistent with the listed 7-day deviations.",
    );
  }
  if (strength.hasStaleOrInvalid) {
    possible_causes.push(
      "Sensor pipeline issue (stale/invalid readings) — diagnosis cannot rely on these.",
    );
  }
  if (possible_causes.length === 0) {
    possible_causes.push(
      "Insufficient evidence to enumerate likely causes; observe and re-check.",
    );
  }

  const immediate_action =
    "Observe and re-check. Do not change inputs based on this stub pass.";

  const what_not_to_do: readonly string[] = Object.freeze([
    "Do not adjust nutrient strength based on this output.",
    "Do not change irrigation schedule based on this output.",
    "Do not change equipment (lights, fans, heaters, humidifiers, pumps) based on this output.",
    "Do not defoliate or transplant based on this output.",
    "Do not treat stale or invalid sensor readings as current truth.",
  ]);

  const twenty_four_hour_follow_up =
    "Re-confirm sensor freshness and source labels; log one fresh manual snapshot if no live readings are present.";

  const three_day_recovery_plan =
    "Maintain stable conditions, log daily diary entries, and capture a fresh photo and manual snapshot each day so the next pass has trustworthy context.";

  // Action Queue suggestion stays approval-required and advisory only.
  // No queue write happens here — this is just a draft payload the caller
  // can choose to surface for grower approval.
  const action_queue_suggestion: ActionQueueSuggestion | null =
    strength.hasStaleOrInvalid
      ? {
          action_type: "advisory",
          status: "pending_approval",
          reason:
            "Some recent sensor readings are stale or invalid. Suggest a manual recheck before any further changes.",
          risk_level: "medium",
        }
      : null;

  return Object.freeze({
    summary,
    likely_issue,
    confidence,
    evidence: Object.freeze(evidence),
    missing_information: Object.freeze(missing_information),
    possible_causes: Object.freeze(possible_causes),
    immediate_action,
    what_not_to_do,
    twenty_four_hour_follow_up,
    three_day_recovery_plan,
    risk_level,
    action_queue_suggestion,
  });
}
