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
 *
 * Sensor Snapshot Status Contract v1 — audit-trail extension:
 *   - When an explicit AI Doctor run is performed, the caller MAY include
 *     the canonical `Classification` from
 *     `classificationFromStatusResult(...)`. The persisted row freezes the
 *     status/reason/healthy-evidence/mode values used at that time so the
 *     timeline projection cannot be rewritten by later sensor updates.
 *   - Classification is owned by `sensorSnapshotStatusContract.ts`.
 *     This module does NOT reclassify; it only maps an already-classified
 *     `Classification` to columns and `sensor_evidence_mode`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Diagnosis, DiagnosisSuggestedAction } from "@/lib/aiDoctorDiagnosisRules";
import type { AiContextConfidenceCeiling } from "@/lib/aiContextSufficiencyRules";
import type {
  Classification,
  SnapshotStatus,
} from "@/lib/sensorSnapshotStatusContract";

export type SensorEvidenceMode =
  | "healthy"
  | "cautionary"
  | "unsafe"
  | "missing";

/**
 * Pure mapping: SnapshotStatus → SensorEvidenceMode.
 * Centralized so the timeline projection and persistence agree.
 */
export function deriveSensorEvidenceMode(
  status: SnapshotStatus,
): SensorEvidenceMode {
  switch (status) {
    case "usable":
      return "healthy";
    case "stale":
      return "cautionary";
    case "invalid":
    case "needs_review":
      return "unsafe";
    case "no_data":
      return "missing";
  }
}

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
  /**
   * Frozen sensor evidence Classification at the moment of the explicit
   * AI Doctor run. Optional for back-compat; when present, the five
   * `sensor_*` columns are populated.
   */
  sensorEvidence?: Classification | null;
  /**
   * Optional evaluation timestamp override (deterministic tests). When
   * omitted, `new Date().toISOString()` is used.
   */
  sensorEvidenceEvaluatedAt?: string | Date | null;
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
  sensor_snapshot_status: SnapshotStatus | null;
  sensor_snapshot_reason_code: string | null;
  counts_as_healthy_evidence: boolean | null;
  sensor_evidence_mode: SensorEvidenceMode | null;
  sensor_evidence_evaluated_at: string | null;
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
  for (const a of dx.suggestedActions) {
    if (!a || typeof a !== "object") return false;
    if ((a as { approvalRequired?: unknown }).approvalRequired !== true) {
      return false;
    }
  }
  return true;
}

function toIsoOrNull(v: string | Date | null | undefined): string | null {
  if (v == null) return null;
  if (v instanceof Date) {
    const t = v.getTime();
    return Number.isFinite(t) ? v.toISOString() : null;
  }
  if (typeof v === "string" && v.length > 0) return v;
  return null;
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

  const ev = input.sensorEvidence ?? null;
  const hasEvidence = ev != null;
  const evaluatedAt = hasEvidence
    ? (toIsoOrNull(input.sensorEvidenceEvaluatedAt ?? null) ??
        new Date().toISOString())
    : null;

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
    sensor_snapshot_status: hasEvidence ? ev.status : null,
    sensor_snapshot_reason_code: hasEvidence ? ev.reason : null,
    counts_as_healthy_evidence: hasEvidence ? ev.isHealthyEvidence : null,
    sensor_evidence_mode: hasEvidence ? deriveSensorEvidenceMode(ev.status) : null,
    sensor_evidence_evaluated_at: evaluatedAt,
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
    if (!row.diagnosis && !row.analysis && !row.sensor_snapshot_status) {
      return { ok: false, error: "no_diagnosis_or_analysis_to_persist" };
    }
    const { data, error } = await client
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
