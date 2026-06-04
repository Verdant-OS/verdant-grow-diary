/**
 * AI Doctor 2.0 — Engine (Phase 1).
 *
 * Pure, deterministic engine foundation:
 *   1. Vision observations (descriptive only, stubbed)
 *   2. Reasoning diagnosis (cautious, stubbed)
 *   3. Automated confidence (deterministic, from approved Edge Function)
 *
 * Safety:
 *   - No Supabase writes, no alerts, no Action Queue, no device control.
 *   - No privileged service keys, no bridge credentials.
 *   - No external model/API calls in this phase — all model steps are
 *     deterministic stubs that return cautious low-confidence output.
 *   - Final user-facing confidence comes from the automated
 *     ConfidenceResult, not the raw model.
 */

import {
  calculateConfidenceViaEdgeFunction,
  CONSERVATIVE_FALLBACK,
  type ConfidenceResult,
  type ConfidenceEdgeClientOptions,
} from "./aiDoctorConfidenceEdgeClient";

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
  occurred_at: string; // ISO
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
// Context compiler (pure helper + thin wrapper)
// ---------------------------------------------------------------------------

interface PlantRowLike {
  id?: string | null;
  grow_id?: string | null;
  tent_id?: string | null;
  stage?: string | null;
  growth_stage?: string | null;
}

interface GrowEventRowLike {
  occurred_at?: string | null;
  event_type?: string | null;
  source?: string | null;
  note?: string | null;
}

interface SensorReadingRowLike {
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
  plant: PlantRowLike | null;
  growEvents: readonly GrowEventRowLike[];
  sensorReadings: readonly SensorReadingRowLike[];
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

  // Bucket sensor readings by source classification.
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
    const v = typeof r.value === "number" && Number.isFinite(r.value) ? r.value : null;
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

/**
 * Thin wrapper. In this engine-only phase, callers that already have RLS-safe
 * rows should prefer `compilePlantContextFromRows`. This stub returns a
 * minimal payload so the pipeline contract is callable end-to-end.
 */
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
// Diagnosis step (stubbed) + automated confidence injection
// ---------------------------------------------------------------------------

const STUB_MODEL_CONFIDENCE: "Low" | "Medium" | "High" = "Low";

export async function generateMultimodalDiagnosis(
  visionData: VisionAnalysisResult,
  context: PlantContextPayload,
  options?: AiDoctorEngineOptions,
): Promise<DiagnosisResult> {
  // Stubbed reasoning output. Cautious copy, no nutrient/irrigation/device
  // recommendations. Real model wiring lands in a later phase.
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
