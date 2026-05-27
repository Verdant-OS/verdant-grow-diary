/**
 * aiDoctorSessionPersistence — read-only snapshot persistence for completed
 * AI Doctor responses.
 *
 * Safety envelope:
 *   - Never writes to `action_queue`. Never writes alerts. Never writes
 *     sensor readings. Never triggers automation or device control.
 *   - Snapshot only. The persisted row is a frozen copy of what the grower
 *     already saw on screen and never re-renders into new suggestions.
 *   - Never trusts a client-supplied user_id. The DB default `auth.uid()`
 *     is the only source of ownership; this helper omits user_id entirely.
 *   - Only the *sanitized* diagnosis is persisted. Callers must run
 *     `validateAndSanitizeDiagnosis` first; this module re-validates the
 *     shape defensively and refuses to persist unsanitized payloads.
 *   - Non-blocking: failures bubble up as a structured result; the caller
 *     decides whether to surface a soft warning. Coach rendering must not
 *     depend on this returning success.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Diagnosis, DiagnosisSuggestedAction } from "@/lib/aiDoctorDiagnosisRules";
import type { AiContextConfidenceCeiling } from "@/lib/aiContextSufficiencyRules";

export interface AiDoctorSessionInput {
  growId: string | null;
  tentId?: string | null;
  plantId?: string | null;
  question?: string | null;
  /** Legacy free-text analysis block (already rendered to the grower). */
  analysis: unknown;
  /** Sanitized structured diagnosis. MUST be the output of validateAndSanitizeDiagnosis. */
  diagnosis: Diagnosis | null;
  /** Raw model confidence before any harmonization (informational only). */
  rawConfidence?: number | null;
  /** Harmonized confidence actually shown to the grower. */
  displayedConfidence?: number | null;
  /** Confidence ceiling from context sufficiency at render time. */
  contextConfidenceCeiling?: AiContextConfidenceCeiling | null;
  /** Snapshot of the context sufficiency evaluation. Optional. */
  contextSufficiency?: unknown;
}

export interface AiDoctorSessionInsertRow {
  grow_id: string | null;
  tent_id: string | null;
  plant_id: string | null;
  question: string | null;
  analysis: unknown;
  diagnosis: Diagnosis | null;
  raw_confidence: number | null;
  displayed_confidence: number | null;
  context_confidence_ceiling: AiContextConfidenceCeiling | null;
  context_sufficiency: unknown;
  suggested_actions: DiagnosisSuggestedAction[];
}

export type PersistAiDoctorSessionResult =
  | { ok: true; id: string | null }
  | { ok: false; error: string };

function isSanitizedDiagnosis(d: unknown): d is Diagnosis {
  if (!d || typeof d !== "object") return false;
  const dx = d as Record<string, unknown>;
  if (typeof dx.summary !== "string") return false;
  if (typeof dx.confidence !== "number") return false;
  if (!Array.isArray(dx.suggestedActions)) return false;
  // Every suggested action must be approval-required. This is the marker
  // that the value came from validateAndSanitizeDiagnosis.
  for (const a of dx.suggestedActions) {
    if (!a || typeof a !== "object") return false;
    if ((a as { approvalRequired?: unknown }).approvalRequired !== true) {
      return false;
    }
  }
  return true;
}

/**
 * Build the insert payload. Pure & deterministic — used in tests and by
 * `persistAiDoctorSession`. Never includes user_id (DB default auth.uid()).
 */
export function buildAiDoctorSessionInsert(
  input: AiDoctorSessionInput,
): AiDoctorSessionInsertRow {
  const diagnosis =
    input.diagnosis && isSanitizedDiagnosis(input.diagnosis)
      ? input.diagnosis
      : null;
  const suggested = diagnosis ? diagnosis.suggestedActions.slice(0, 2) : [];
  return {
    grow_id: input.growId ?? null,
    tent_id: input.tentId ?? null,
    plant_id: input.plantId ?? null,
    question: input.question?.trim() ? input.question.trim() : null,
    analysis: input.analysis ?? null,
    diagnosis,
    raw_confidence:
      typeof input.rawConfidence === "number" && Number.isFinite(input.rawConfidence)
        ? input.rawConfidence
        : null,
    displayed_confidence:
      typeof input.displayedConfidence === "number" &&
      Number.isFinite(input.displayedConfidence)
        ? input.displayedConfidence
        : null,
    context_confidence_ceiling: input.contextConfidenceCeiling ?? null,
    context_sufficiency: input.contextSufficiency ?? null,
    suggested_actions: suggested,
  };
}

/**
 * Persist a sanitized AI Doctor snapshot. Always non-blocking from the
 * caller's perspective — returns a result instead of throwing so a failed
 * insert never prevents the Coach response from rendering.
 */
export async function persistAiDoctorSession(
  client: Pick<SupabaseClient, "from">,
  input: AiDoctorSessionInput,
): Promise<PersistAiDoctorSessionResult> {
  try {
    const row = buildAiDoctorSessionInsert(input);
    // Refuse to persist when there's literally nothing to remember.
    if (!row.diagnosis && !row.analysis) {
      return { ok: false, error: "no_diagnosis_or_analysis_to_persist" };
    }
    const { data, error } = await client
      // The table is created by migration; types.ts is regenerated by Lovable.
      // Cast is required until the regenerated types include the new table.
      .from("ai_doctor_sessions" as never)
      .insert(row as never)
      .select("id")
      .single();
    if (error) return { ok: false, error: error.message || "insert_failed" };
    const id =
      (data && typeof (data as { id?: unknown }).id === "string"
        ? (data as { id: string }).id
        : null) ?? null;
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}
