/**
 * AI Doctor 2.0 — Diagnosis view-model adapter.
 *
 * Pure, presenter-safe transformation from the engine's `DiagnosisResult`
 * into the shape an AI Doctor panel can render. Engine-only consumer:
 *
 *   - Final user-facing confidence ALWAYS comes from the automated
 *     ConfidenceResult, never from the raw LLM self-report.
 *   - Raw model confidence is preserved only as audit/debug metadata.
 *   - No supabase writes, no alerts, no Action Queue, no device control,
 *     no external model calls, no privileged service keys.
 */

import type { DiagnosisResult } from "./aiDoctorEngine";
import type {
  ConfidenceLevel,
  ConfidenceResult,
} from "./aiDoctorConfidenceEdgeClient";

export interface DiagnosisDisplayConfidence {
  /** Final, user-facing confidence — sourced from automated result. */
  level: ConfidenceLevel;
  /** Final, user-facing score — sourced from automated result, 0..100. */
  score: number;
  explanation: string;
  conflicts: readonly string[];
}

export interface DiagnosisDisplayAudit {
  /** Raw LLM-reported confidence. Never used as primary UI confidence. */
  raw_model_confidence_level: ConfidenceLevel;
  /** True when the automated layer downgraded vs. the raw model claim. */
  automated_downgraded_model: boolean;
}

export interface DiagnosisDisplayViewModel {
  summary: string;
  key_observations: readonly string[];
  contributing_factors: readonly string[];
  recommended_actions: readonly string[];
  what_not_to_do: readonly string[];
  monitoring_priorities: readonly string[];
  questions_for_grower: readonly string[];
  missing_context: readonly string[];
  confidence: DiagnosisDisplayConfidence;
  audit: DiagnosisDisplayAudit;
}

const LEVEL_RANK: Record<ConfidenceLevel, number> = {
  Low: 0,
  Medium: 1,
  High: 2,
};

function safeArray<T>(v: readonly T[] | null | undefined): readonly T[] {
  return Array.isArray(v) ? v : [];
}

function safeString(v: string | null | undefined, fallback = ""): string {
  return typeof v === "string" && v.length > 0 ? v : fallback;
}

function safeConfidence(c: ConfidenceResult | null | undefined): ConfidenceResult {
  if (
    c &&
    (c.level === "Low" || c.level === "Medium" || c.level === "High") &&
    typeof c.score === "number" &&
    Number.isFinite(c.score)
  ) {
    return c;
  }
  return {
    score: 40,
    level: "Low",
    explanation: "Automated scoring unavailable. Using conservative default.",
  };
}

/**
 * Convert an engine DiagnosisResult into a render-ready view-model.
 * Missing/optional fields degrade to safe defaults; never throws.
 */
export function adaptDiagnosisResultToViewModel(
  result: DiagnosisResult | null | undefined,
): DiagnosisDisplayViewModel {
  const r = (result ?? {}) as Partial<DiagnosisResult>;
  const automated = safeConfidence(r.automated_confidence);
  const rawLevel: ConfidenceLevel =
    r.model_confidence_level === "Low" ||
    r.model_confidence_level === "Medium" ||
    r.model_confidence_level === "High"
      ? r.model_confidence_level
      : "Low";

  const questions = safeArray(r.questions_for_grower);
  // Missing context = questions the grower can answer to lift confidence.
  const missing_context = questions;

  return {
    summary: safeString(
      r.summary,
      "No diagnosis available yet — observe and re-check.",
    ),
    key_observations: safeArray(r.key_observations),
    contributing_factors: safeArray(r.contributing_factors),
    recommended_actions: safeArray(r.recommended_actions),
    what_not_to_do: safeArray(r.what_not_to_do),
    monitoring_priorities: safeArray(r.monitoring_priorities),
    questions_for_grower: questions,
    missing_context,
    confidence: {
      level: automated.level,
      score: automated.score,
      explanation: safeString(automated.explanation, "Automated confidence result."),
      conflicts: safeArray(automated.conflicts_detected),
    },
    audit: {
      raw_model_confidence_level: rawLevel,
      automated_downgraded_model: LEVEL_RANK[automated.level] < LEVEL_RANK[rawLevel],
    },
  };
}
