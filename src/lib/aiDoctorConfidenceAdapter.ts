/**
 * AI Doctor Confidence Adapter — Phase 1.
 *
 * Pure, deterministic adapter that converts a Phase 1 diagnosis + compiled
 * plant context into a conservative confidence result. No network, no model
 * calls, no Supabase, no Date.now (unless `now` is injected).
 *
 * Hard safety stance:
 *   - Demo / CSV / stale / invalid data must never raise confidence.
 *   - "high" confidence requires recent trustworthy sensor data, recent grow
 *     events, useful visual context, AND limited missing information.
 *   - Output is stable-sorted so repeated calls return identical objects.
 */
import type {
  Phase1DiagnosisResult,
  Phase1PlantContextPayload,
  Phase1VisionAnalysisResult,
} from "./aiDoctorEngine";

export type AiDoctorConfidenceLevel = "very_low" | "low" | "medium" | "high";

export interface AiDoctorConfidenceSourceQuality {
  live_count: number;
  manual_count: number;
  csv_count: number;
  demo_count: number;
  stale_count: number;
  invalid_count: number;
  has_recent_trustworthy_sensor_data: boolean;
  has_recent_grow_events: boolean;
  has_visual_context: boolean;
}

export interface AiDoctorConfidenceInput {
  diagnosis: Phase1DiagnosisResult;
  context: Phase1PlantContextPayload;
  /** Optional vision payload for visual-context evaluation. */
  vision?: Phase1VisionAnalysisResult | null;
  now?: string | Date;
}

export interface AiDoctorConfidenceResult {
  score: number;
  level: AiDoctorConfidenceLevel;
  explanation: string;
  positive_factors: string[];
  limiting_factors: string[];
  source_quality: AiDoctorConfidenceSourceQuality;
  safety_flags: string[];
}

const BASE_SCORE = 20;
const MAX_SCORE = 100;
const MIN_SCORE = 0;

function clamp(n: number): number {
  if (!Number.isFinite(n)) return MIN_SCORE;
  return Math.max(MIN_SCORE, Math.min(MAX_SCORE, Math.round(n)));
}

function uniqueSorted(values: readonly string[]): string[] {
  return Array.from(new Set(values)).sort();
}

function levelFromScore(score: number): AiDoctorConfidenceLevel {
  if (score >= 75) return "high";
  if (score >= 50) return "medium";
  if (score >= 25) return "low";
  return "very_low";
}

function evaluateVisualContext(
  vision: Phase1VisionAnalysisResult | null | undefined,
): { has_visual_context: boolean; poor_quality: boolean } {
  if (!vision) return { has_visual_context: false, poor_quality: true };
  const q =
    typeof vision.image_quality_score === "number" &&
    Number.isFinite(vision.image_quality_score)
      ? vision.image_quality_score
      : 0;
  const observationCount =
    vision.leaf_observations.length +
    vision.structural_observations.length +
    vision.color_and_pigmentation.length +
    vision.pest_disease_indicators.length +
    vision.growth_stage_visual_cues.length;
  const has_visual_context = q >= 0.5 && observationCount > 0;
  const poor_quality = q < 0.3 || observationCount === 0;
  return { has_visual_context, poor_quality };
}

export function calculateAiDoctorConfidence(
  input: AiDoctorConfidenceInput,
): AiDoctorConfidenceResult {
  const { diagnosis, context } = input;

  // ---- source quality buckets ----
  let live_count = 0;
  let manual_count = 0;
  let csv_count = 0;
  let demo_count = 0;
  let stale_count = 0;
  let invalid_count = 0;
  for (const g of context.sensor_groups) {
    const n = Math.max(0, g.sample_count | 0);
    switch (g.source) {
      case "live":
        live_count += n;
        break;
      case "manual":
        manual_count += n;
        break;
      case "csv":
        csv_count += n;
        break;
      case "demo":
        demo_count += n;
        break;
      case "stale":
        stale_count += n;
        break;
      case "invalid":
        invalid_count += n;
        break;
    }
  }

  const has_recent_trustworthy_sensor_data =
    live_count > 0 || manual_count > 0;
  const has_recent_grow_events = context.recent_grow_events.length > 0;
  const { has_visual_context, poor_quality: visual_poor } =
    evaluateVisualContext(input.vision ?? null);

  const source_quality: AiDoctorConfidenceSourceQuality = {
    live_count,
    manual_count,
    csv_count,
    demo_count,
    stale_count,
    invalid_count,
    has_recent_trustworthy_sensor_data,
    has_recent_grow_events,
    has_visual_context,
  };

  // ---- scoring ----
  let score = BASE_SCORE;
  const positive: string[] = [];
  const limiting: string[] = [];
  const flags: string[] = [];

  // Positive contributions
  if (has_recent_trustworthy_sensor_data) {
    score += 25;
    positive.push("recent_trustworthy_sensor_data");
  }
  if (has_recent_grow_events) {
    score += 15;
    positive.push("recent_grow_events");
  }
  if (has_visual_context) {
    score += 15;
    positive.push("useful_visual_context");
  }

  const missingCount = diagnosis.missing_information.length;
  if (missingCount === 0) {
    score += 10;
    positive.push("no_missing_information");
  } else if (missingCount <= 2) {
    score += 5;
    positive.push("limited_missing_information");
  }

  const specificEvidence = diagnosis.evidence.length;
  const possibleCauses = diagnosis.possible_causes.length;
  if (specificEvidence >= 3 && possibleCauses <= 3) {
    score += 5;
    positive.push("specific_evidence_without_overconfidence");
  }

  // Negative contributions
  if (missingCount >= 5) {
    score -= 15;
    limiting.push("major_missing_information");
    flags.push("major_missing_information");
  } else if (missingCount >= 3) {
    score -= 8;
    limiting.push("notable_missing_information");
  }

  if (!has_recent_trustworthy_sensor_data) {
    score -= 10;
    limiting.push("no_trustworthy_sensor_data");
    flags.push("no_trustworthy_sensor_data");
  }
  if (!has_recent_grow_events) {
    score -= 10;
    limiting.push("no_recent_grow_events");
    flags.push("no_recent_grow_events");
  }

  if (stale_count > 0 || invalid_count > 0) {
    score -= 10;
    limiting.push("stale_or_invalid_readings_present");
    flags.push("stale_or_invalid_readings_present");
  }

  const hasOnlyDemoOrCsv =
    !has_recent_trustworthy_sensor_data &&
    stale_count === 0 &&
    invalid_count === 0 &&
    (demo_count > 0 || csv_count > 0);
  if (hasOnlyDemoOrCsv) {
    limiting.push("demo_or_csv_only");
    flags.push("demo_or_csv_only");
  }

  if (possibleCauses >= 4) {
    score -= 5;
    limiting.push("multiple_possible_causes");
  }

  if (visual_poor) {
    limiting.push("poor_visual_quality");
    if (!has_recent_trustworthy_sensor_data || !has_recent_grow_events) {
      flags.push("poor_visual_quality");
    }
  }

  const weakContext =
    !has_recent_trustworthy_sensor_data && !has_recent_grow_events;
  if (weakContext) {
    flags.push("weak_context");
    flags.push("avoid_overdiagnosis");
  }

  // ---- hard caps ----
  if (!has_recent_trustworthy_sensor_data && !has_recent_grow_events) {
    score = Math.min(score, 35);
  }
  // Only stale/invalid present (no trustworthy, no demo, no csv).
  const onlyStaleOrInvalid =
    !has_recent_trustworthy_sensor_data &&
    demo_count === 0 &&
    csv_count === 0 &&
    (stale_count > 0 || invalid_count > 0);
  if (onlyStaleOrInvalid) {
    score = Math.min(score, 30);
  }
  // Only demo/csv (no trustworthy, no stale/invalid).
  if (hasOnlyDemoOrCsv) {
    score = Math.min(score, 40);
  }
  if (missingCount >= 5) {
    score = Math.min(score, 45);
  }
  if (visual_poor && weakContext) {
    score = Math.min(score, 35);
  }

  // ---- final clamp + level ----
  const finalScore = clamp(score);
  let level = levelFromScore(finalScore);

  // Guard rail: "high" requires the full quartet.
  const allowHigh =
    has_recent_trustworthy_sensor_data &&
    has_recent_grow_events &&
    has_visual_context &&
    missingCount <= 2;
  if (level === "high" && !allowHigh) {
    level = "medium";
  }

  const positive_factors = uniqueSorted(positive);
  const limiting_factors = uniqueSorted(limiting);
  const safety_flags = uniqueSorted(flags);

  const explanation = buildExplanation(
    finalScore,
    level,
    source_quality,
    missingCount,
  );

  return Object.freeze({
    score: finalScore,
    level,
    explanation,
    positive_factors,
    limiting_factors,
    source_quality: Object.freeze(source_quality),
    safety_flags,
  }) as AiDoctorConfidenceResult;
}

function buildExplanation(
  score: number,
  level: AiDoctorConfidenceLevel,
  sq: AiDoctorConfidenceSourceQuality,
  missingCount: number,
): string {
  const parts: string[] = [];
  parts.push(`Confidence ${level} (score ${score}/100).`);
  parts.push(
    `Trustworthy sensor data: ${sq.has_recent_trustworthy_sensor_data ? "yes" : "no"}.`,
  );
  parts.push(
    `Recent grow events: ${sq.has_recent_grow_events ? "yes" : "no"}.`,
  );
  parts.push(`Useful visual context: ${sq.has_visual_context ? "yes" : "no"}.`);
  parts.push(`Missing information items: ${missingCount}.`);
  return parts.join(" ");
}
