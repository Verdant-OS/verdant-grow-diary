/**
 * AI Doctor Engine.
 *
 * Two layers live here:
 *
 *  1. Legacy engine (pre-existing, consumed by view models and tests):
 *       - executeVisionAnalysis
 *       - compilePlantContextFromRows  (returns legacy PlantContextPayload)
 *       - generateMultimodalDiagnosis  (returns legacy DiagnosisResult,
 *         includes optional automated confidence from the edge function)
 *
 *  2. Phase 1 engine surface (new typed contract, additive):
 *       - executeVisionAnalysisPhase1
 *       - compilePlantContextRowsPhase1
 *       - generateMultimodalDiagnosisPhase1
 *
 *     Phase 1 types are exported with distinct names
 *     (Phase1VisionAnalysisResult, Phase1PlantContextPayload,
 *     Phase1DiagnosisResult) so that we do not break the legacy callers
 *     that depend on the older shapes.
 *
 * Safety (both layers):
 *   - No Supabase reads/writes, no alerts, no Action Queue writes.
 *   - No external model/API calls in this engine file.
 *   - No device control.
 *   - No service_role or bridge tokens referenced anywhere.
 */

import {
  calculateConfidenceViaEdgeFunction,
  CONSERVATIVE_FALLBACK,
  type ConfidenceResult,
  type ConfidenceEdgeClientOptions,
} from "./aiDoctorConfidenceEdgeClient";
import {
  compilePlantContextFromRows as compilePlantContextRowsPhase1Impl,
  type PlantContextPayload as Phase1PlantContextPayloadImpl,
  type SensorSourceTag as Phase1SensorSourceTag,
} from "./aiDoctorContextCompiler";

// ---------------------------------------------------------------------------
// Phase 1 re-exports (new, additive)
// ---------------------------------------------------------------------------

export type Phase1PlantContextPayload = Phase1PlantContextPayloadImpl;
export type {
  SensorSourceTag as Phase1SensorSourceTag,
  RecentGrowEvent as Phase1RecentGrowEvent,
  RecentSensorReading as Phase1RecentSensorReading,
  SensorRollingAverages as Phase1SensorRollingAverages,
  SensorSourceGroup as Phase1SensorSourceGroup,
  CompilePlantContextFromRowsInput as CompilePlantContextRowsPhase1Input,
} from "./aiDoctorContextCompiler";

/** Phase 1 wrapper — pure pass-through to the typed row compiler. */
export function compilePlantContextRowsPhase1(
  ...args: Parameters<typeof compilePlantContextRowsPhase1Impl>
): Phase1PlantContextPayload {
  return compilePlantContextRowsPhase1Impl(...args);
}

// ---------------------------------------------------------------------------
// Legacy types (unchanged contract)
// ---------------------------------------------------------------------------

export type SensorSourceTag =
  | "live"
  | "csv"
  | "manual"
  | "stale"
  | "invalid";

export interface VisionAnalysisResult {
  visual_summary: string;
  leaf_observations: readonly string[];
  structural_observations: readonly string[];
  color_and_pigmentation: readonly string[];
  pest_disease_indicators: readonly string[];
  growth_stage_visual_cues: readonly string[];
  image_quality_notes: readonly string[];
  image_quality_score: number; // 0..1
  confidence: number; // 0..1 raw model self-reported
}

export interface SensorRollingAverages {
  vpd_kpa: number | null;
  temperature_c: number | null;
  humidity_pct: number | null;
  co2_ppm: number | null;
}

export interface PlantContextSensorBucket {
  source: SensorSourceTag;
  averages: SensorRollingAverages;
  sample_count: number;
}

export interface RecentActionEntry {
  occurred_at: string;
  event_type: string;
  source_tag: string;
  note?: string | null;
}

export interface PlantContextPayload {
  grow_id: string | null;
  tent_id: string | null;
  plant_id: string | null;
  growth_stage: string | null;
  recent_actions: readonly RecentActionEntry[];
  sensor_averages_7d: readonly PlantContextSensorBucket[];
  notable_deviations: readonly string[];
  source_tags: readonly SensorSourceTag[];
}

export interface DiagnosisResult {
  summary: string;
  key_observations: readonly string[];
  contributing_factors: readonly string[];
  model_confidence_level: "Low" | "Medium" | "High";
  automated_confidence: ConfidenceResult;
  recommended_actions: readonly string[];
  what_not_to_do: readonly string[];
  monitoring_priorities: readonly string[];
  questions_for_grower: readonly string[];
}

export interface AiDoctorEngineOptions {
  confidence?: ConfidenceEdgeClientOptions;
  version?: string;
}

// ---------------------------------------------------------------------------
// Vision step (stubbed)
// ---------------------------------------------------------------------------

export async function executeVisionAnalysis(
  imageFile: File,
): Promise<VisionAnalysisResult> {
  if (!imageFile || typeof (imageFile as File).size !== "number") {
    throw new Error("executeVisionAnalysis: image file is required");
  }
  return Object.freeze({
    visual_summary:
      "Stub vision pass — no model invoked. Visual evidence not yet analyzed.",
    leaf_observations: Object.freeze([]) as readonly string[],
    structural_observations: Object.freeze([]) as readonly string[],
    color_and_pigmentation: Object.freeze([]) as readonly string[],
    pest_disease_indicators: Object.freeze([]) as readonly string[],
    growth_stage_visual_cues: Object.freeze([]) as readonly string[],
    image_quality_notes: Object.freeze([
      "Stub pass: image not inspected by a model.",
    ]) as readonly string[],
    image_quality_score: 0,
    confidence: 0,
  });
}

// ---------------------------------------------------------------------------
// Legacy context compiler (pure helper + thin wrapper)
// ---------------------------------------------------------------------------

interface PlantRowLikeLegacy {
  id?: string | null;
  grow_id?: string | null;
  tent_id?: string | null;
  stage?: string | null;
  growth_stage?: string | null;
}

interface GrowEventRowLikeLegacy {
  occurred_at?: string | null;
  event_type?: string | null;
  source?: string | null;
  note?: string | null;
}

interface SensorReadingRowLikeLegacy {
  metric?: string | null;
  value?: number | null;
  captured_at?: string | null;
  source?: string | null;
  quality?: string | null;
}

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function classifySource(
  source: string | null | undefined,
  quality: string | null | undefined,
): SensorSourceTag {
  if (quality === "stale") return "stale";
  if (quality === "invalid") return "invalid";
  const s = (source ?? "").toLowerCase();
  if (s === "csv") return "csv";
  if (s === "manual") return "manual";
  return "live";
}

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const sum = nums.reduce((a, b) => a + b, 0);
  return Math.round((sum / nums.length) * 1000) / 1000;
}

export interface CompileFromRowsInput {
  plant: PlantRowLikeLegacy | null;
  growEvents: readonly GrowEventRowLikeLegacy[];
  sensorReadings: readonly SensorReadingRowLikeLegacy[];
  now?: Date;
}

export function compilePlantContextFromRows(
  input: CompileFromRowsInput,
): PlantContextPayload {
  const now = input.now ?? new Date();
  const nowMs = now.getTime();
  const plant = input.plant ?? null;

  const recent_actions: RecentActionEntry[] = [];
  for (const ev of input.growEvents ?? []) {
    if (!ev?.occurred_at) continue;
    const t = Date.parse(ev.occurred_at);
    if (!Number.isFinite(t)) continue;
    if (nowMs - t > FOURTEEN_DAYS_MS) continue;
    recent_actions.push({
      occurred_at: ev.occurred_at,
      event_type: String(ev.event_type ?? "unknown"),
      source_tag: String(ev.source ?? "unknown"),
      note: ev.note ?? null,
    });
  }
  recent_actions.sort((a, b) =>
    a.occurred_at < b.occurred_at ? 1 : a.occurred_at > b.occurred_at ? -1 : 0,
  );

  const buckets = new Map<
    SensorSourceTag,
    { vpd: number[]; t: number[]; h: number[]; co2: number[]; n: number }
  >();
  for (const r of input.sensorReadings ?? []) {
    if (!r?.captured_at) continue;
    const ts = Date.parse(r.captured_at);
    if (!Number.isFinite(ts)) continue;
    if (nowMs - ts > SEVEN_DAYS_MS) continue;
    const tag = classifySource(r.source, r.quality);
    let b = buckets.get(tag);
    if (!b) {
      b = { vpd: [], t: [], h: [], co2: [], n: 0 };
      buckets.set(tag, b);
    }
    b.n += 1;
    const v =
      typeof r.value === "number" && Number.isFinite(r.value) ? r.value : null;
    if (v === null) continue;
    switch (r.metric) {
      case "vpd_kpa":
        b.vpd.push(v);
        break;
      case "temperature_c":
        b.t.push(v);
        break;
      case "humidity_pct":
        b.h.push(v);
        break;
      case "co2_ppm":
        b.co2.push(v);
        break;
    }
  }

  const orderedTags: SensorSourceTag[] = [
    "live",
    "csv",
    "manual",
    "stale",
    "invalid",
  ];
  const sensor_averages_7d: PlantContextSensorBucket[] = [];
  for (const tag of orderedTags) {
    const b = buckets.get(tag);
    if (!b) continue;
    sensor_averages_7d.push({
      source: tag,
      sample_count: b.n,
      averages: {
        vpd_kpa: avg(b.vpd),
        temperature_c: avg(b.t),
        humidity_pct: avg(b.h),
        co2_ppm: avg(b.co2),
      },
    });
  }

  const notable_deviations: string[] = [];
  const liveBucket = sensor_averages_7d.find((b) => b.source === "live");
  if (liveBucket) {
    const v = liveBucket.averages.vpd_kpa;
    if (v != null && (v < 0.6 || v > 1.6)) {
      notable_deviations.push(`live VPD avg ${v} kPa outside 0.6–1.6 band`);
    }
    const t = liveBucket.averages.temperature_c;
    if (t != null && (t < 18 || t > 30)) {
      notable_deviations.push(`live temperature avg ${t}°C outside 18–30°C`);
    }
  }

  return {
    grow_id: plant?.grow_id ?? null,
    tent_id: plant?.tent_id ?? null,
    plant_id: plant?.id ?? null,
    growth_stage: plant?.growth_stage ?? plant?.stage ?? null,
    recent_actions: Object.freeze(recent_actions),
    sensor_averages_7d: Object.freeze(sensor_averages_7d),
    notable_deviations: Object.freeze(notable_deviations),
    source_tags: Object.freeze(sensor_averages_7d.map((b) => b.source)),
  };
}

export async function compilePlantContext(
  plantId: string,
  tentId: string,
): Promise<PlantContextPayload> {
  return compilePlantContextFromRows({
    plant: { id: plantId, tent_id: tentId, grow_id: null, stage: null },
    growEvents: [],
    sensorReadings: [],
  });
}

// ---------------------------------------------------------------------------
// Legacy diagnosis step (stubbed) + automated confidence injection
// ---------------------------------------------------------------------------

const STUB_MODEL_CONFIDENCE: "Low" | "Medium" | "High" = "Low";

export async function generateMultimodalDiagnosis(
  visionData: VisionAnalysisResult,
  context: PlantContextPayload,
  options?: AiDoctorEngineOptions,
): Promise<DiagnosisResult> {
  const key_observations: string[] = [];
  if (visionData.visual_summary) {
    key_observations.push(visionData.visual_summary);
  }
  for (const dev of context.notable_deviations) {
    key_observations.push(`Sensor context: ${dev}`);
  }

  let automated_confidence: ConfidenceResult = CONSERVATIVE_FALLBACK;
  if (options?.confidence) {
    automated_confidence = await calculateConfidenceViaEdgeFunction(
      {
        context,
        visual_observations: visionData,
        model_output: {
          summary: "Stub diagnosis pass — reasoning model not yet wired.",
          model_confidence_level: STUB_MODEL_CONFIDENCE,
        },
        version: options?.version ?? "ai-doctor-engine@0.1.0",
      },
      options.confidence,
    );
  }

  return Object.freeze({
    summary:
      "Stub diagnosis pass — reasoning model not yet wired. Observation-only output.",
    key_observations: Object.freeze(key_observations),
    contributing_factors: Object.freeze(
      context.source_tags.length === 0
        ? ["No sensor context available in the last 7 days."]
        : [`Sensor context sources present: ${context.source_tags.join(", ")}.`],
    ),
    model_confidence_level: STUB_MODEL_CONFIDENCE,
    automated_confidence,
    recommended_actions: Object.freeze([
      "Observe and re-check; do not change inputs based on this stub pass.",
    ]),
    what_not_to_do: Object.freeze([
      "Do not adjust nutrients based on this output.",
      "Do not change irrigation based on this output.",
      "Do not change equipment based on this output.",
    ]),
    monitoring_priorities: Object.freeze([
      "Re-check sensor freshness and source labels before next decision.",
    ]),
    questions_for_grower: Object.freeze([
      "What changed in the last 24 hours?",
      "Are sensor labels (live, csv, manual) accurate for this tent?",
    ]),
  });
}

// ===========================================================================
// Phase 1 engine — new additive surface
// ===========================================================================

export interface Phase1VisionAnalysisResult {
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

export type Phase1RiskLevel = "low" | "medium" | "high";

export interface Phase1ActionQueueSuggestion {
  /** Always advisory in Phase 1 — never an executable device command. */
  action_type: "advisory";
  /** Always pending approval — Action Queue stays approval-required. */
  status: "pending_approval";
  reason: string;
  risk_level: Phase1RiskLevel;
}

export interface Phase1DiagnosisResult {
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
  risk_level: Phase1RiskLevel;
  action_queue_suggestion: Phase1ActionQueueSuggestion | null;
}

/**
 * Phase 1 vision stub. Validates input, returns deterministic
 * low-confidence placeholder. Never calls a model.
 */
export async function executeVisionAnalysisPhase1(
  imageFile: File,
): Promise<Phase1VisionAnalysisResult> {
  if (!imageFile || typeof (imageFile as File).size !== "number") {
    throw new Error("executeVisionAnalysisPhase1: image file is required");
  }
  if (imageFile.size <= 0) {
    throw new Error("executeVisionAnalysisPhase1: image file is empty");
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

const TRUSTWORTHY_SOURCES: ReadonlySet<Phase1SensorSourceTag> = new Set<
  Phase1SensorSourceTag
>(["live", "manual"]);

interface ContextStrength {
  hasTrustworthySensors: boolean;
  hasRecentEvents: boolean;
  hasStaleOrInvalid: boolean;
  hasDemoOnly: boolean;
}

function assessPhase1Context(
  context: Phase1PlantContextPayload,
): ContextStrength {
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
 * Phase 1 diagnosis stub. Deterministic, cautious, never recommends
 * nutrient/irrigation/equipment changes. Never emits device commands.
 */
export async function generateMultimodalDiagnosisPhase1(
  visionData: Phase1VisionAnalysisResult,
  context: Phase1PlantContextPayload,
): Promise<Phase1DiagnosisResult> {
  const strength = assessPhase1Context(context);

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

  const confidence =
    strength.hasTrustworthySensors && strength.hasRecentEvents ? 0.3 : 0.1;

  const risk_level: Phase1RiskLevel = strength.hasStaleOrInvalid
    ? "medium"
    : "low";

  const summary = strength.hasTrustworthySensors
    ? "Engine Phase 1 stub: observation-only summary based on supplied context."
    : "Engine Phase 1 stub: insufficient trustworthy context for a real diagnosis.";

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

  const action_queue_suggestion: Phase1ActionQueueSuggestion | null =
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
    likely_issue: "",
    confidence,
    evidence: Object.freeze(evidence),
    missing_information: Object.freeze(missing_information),
    possible_causes: Object.freeze(possible_causes),
    immediate_action:
      "Observe and re-check. Do not change inputs based on this stub pass.",
    what_not_to_do: Object.freeze([
      "Do not adjust nutrient strength based on this output.",
      "Do not change irrigation schedule based on this output.",
      "Do not change equipment (lights, fans, heaters, humidifiers, pumps) based on this output.",
      "Do not defoliate or transplant based on this output.",
      "Do not treat stale or invalid sensor readings as current truth.",
    ]),
    twenty_four_hour_follow_up:
      "Re-confirm sensor freshness and source labels; log one fresh manual snapshot if no live readings are present.",
    three_day_recovery_plan:
      "Maintain stable conditions, log daily diary entries, and capture a fresh photo and manual snapshot each day so the next pass has trustworthy context.",
    risk_level,
    action_queue_suggestion,
  });
}
