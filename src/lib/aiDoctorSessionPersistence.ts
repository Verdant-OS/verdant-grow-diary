/**
 * aiDoctorSessionPersistence — read-only snapshot persistence for completed
 * AI Doctor responses.
 *
 * Safety envelope:
 *   - Never writes to `action_queue`. Never writes alerts. Never writes
 *     sensor readings. Never triggers automation or device control.
 *   - Snapshot only. The persisted row is a frozen copy of what the grower
 *     already saw on screen and never re-renders into new suggestions.
 *   - Never trusts a caller-supplied user_id. Ownership is resolved from the
 *     authenticated Supabase session and existing RLS still requires
 *     `auth.uid() = user_id` plus owned grow/tent/plant scope.
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
import type { Classification, SnapshotStatus } from "@/lib/sensorSnapshotStatusContract";
import {
  buildAiDoctorSessionPersistenceFailureDiagnostic,
  type AiDoctorSessionPersistenceAuthResolution,
  type AiDoctorSessionPersistenceFailureDiagnostic,
  type AiDoctorSessionPersistenceScopeContext,
} from "@/lib/aiDoctorSessionPersistenceFailureRules";
import { isUuid } from "@/lib/isUuid";

export type SensorEvidenceMode = "healthy" | "cautionary" | "unsafe" | "missing";

/**
 * Pure mapping: SnapshotStatus → SensorEvidenceMode.
 * Centralized so the timeline projection and persistence agree.
 */
export function deriveSensorEvidenceMode(status: SnapshotStatus): SensorEvidenceMode {
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
  /** Stable client-generated row id. Reuse it for retries of the same review. */
  sessionId?: string | null;
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
  id?: string;
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
  | { ok: true; id: string }
  | {
      ok: false;
      error: string;
      diagnostic: AiDoctorSessionPersistenceFailureDiagnostic;
    };

function persistenceScope(input: AiDoctorSessionInput): AiDoctorSessionPersistenceScopeContext {
  return {
    hasGrowScope: typeof input.growId === "string" && input.growId.length > 0,
    hasTentScope: typeof input.tentId === "string" && input.tentId.length > 0,
    hasPlantScope: typeof input.plantId === "string" && input.plantId.length > 0,
  };
}

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
 * Mint one opaque row id per logical AI Doctor review. Callers that expose a
 * manual persistence retry must retain and reuse this id.
 */
export function newAiDoctorSessionId(): string {
  const webCrypto = globalThis.crypto;
  if (webCrypto && typeof webCrypto.randomUUID === "function") {
    return webCrypto.randomUUID();
  }

  if (!webCrypto) throw new Error("secure_random_unavailable");
  const bytes = new Uint8Array(16);
  webCrypto.getRandomValues(bytes);
  // RFC 4122 version 4 + variant bits.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Build the insert payload. Pure & deterministic — used in tests and by
 * `persistAiDoctorSession`. Never includes user_id (DB default auth.uid()).
 */
export function buildAiDoctorSessionInsert(input: AiDoctorSessionInput): AiDoctorSessionInsertRow {
  const diagnosis =
    input.diagnosis && isSanitizedDiagnosis(input.diagnosis) ? input.diagnosis : null;
  const suggested = diagnosis ? diagnosis.suggestedActions.slice(0, 2) : [];

  const ev = input.sensorEvidence ?? null;
  const hasEvidence = ev != null;
  const evaluatedAt = hasEvidence
    ? (toIsoOrNull(input.sensorEvidenceEvaluatedAt ?? null) ?? new Date().toISOString())
    : null;

  return {
    ...(input.sessionId ? { id: input.sessionId } : {}),
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
      typeof input.displayedConfidence === "number" && Number.isFinite(input.displayedConfidence)
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

async function confirmOwnedSessionExists(
  client: Pick<SupabaseClient, "from">,
  sessionId: string,
): Promise<boolean> {
  try {
    const { data, error } = await client
      .from("ai_doctor_sessions" as never)
      .select("id")
      .eq("id", sessionId)
      .maybeSingle();
    return (
      !error &&
      data != null &&
      typeof (data as { id?: unknown }).id === "string" &&
      (data as { id: string }).id === sessionId
    );
  } catch {
    return false;
  }
}

/**
 * Persist a sanitized AI Doctor snapshot. Always non-blocking from the
 * caller's perspective — returns a result instead of throwing so a failed
 * insert never prevents the Coach response from rendering.
 */
export async function persistAiDoctorSession(
  client: Pick<SupabaseClient, "from"> & { auth?: SupabaseClient["auth"] },
  input: AiDoctorSessionInput,
): Promise<PersistAiDoctorSessionResult> {
  const scope = persistenceScope(input);
  let authResolution: AiDoctorSessionPersistenceAuthResolution = client.auth
    ? "anonymous"
    : "unavailable";
  try {
    const requestedSessionId = input.sessionId ?? newAiDoctorSessionId();
    if (!isUuid(requestedSessionId)) {
      const error = "invalid_session_id";
      return {
        ok: false,
        error,
        diagnostic: buildAiDoctorSessionPersistenceFailureDiagnostic({
          stage: "validation",
          error: { message: error },
          authResolution,
          scope,
          fallbackMessage: error,
        }),
      };
    }
    // PostgreSQL renders UUID text in lowercase. Canonicalize before insert
    // so response/conflict confirmation comparisons cannot fail on casing.
    const sessionId = requestedSessionId.toLowerCase();
    const row = buildAiDoctorSessionInsert({ ...input, sessionId });
    // Refuse to persist when there's literally nothing to remember.
    if (!row.diagnosis && !row.analysis && !row.sensor_snapshot_status) {
      const error = "no_diagnosis_or_analysis_to_persist";
      return {
        ok: false,
        error,
        diagnostic: buildAiDoctorSessionPersistenceFailureDiagnostic({
          stage: "validation",
          error: { message: error },
          authResolution,
          scope,
          fallbackMessage: error,
        }),
      };
    }
    // Resolve the owner from the authenticated session and send `user_id`
    // explicitly. RLS still enforces `auth.uid() = user_id`, so sending it
    // never widens trust — it only prevents silent RLS rejections when the
    // DB DEFAULT auth.uid() is not applied on the PostgREST insert path.
    let userId: string | null = null;
    if (client.auth && typeof client.auth.getUser === "function") {
      try {
        const { data, error } = await client.auth.getUser();
        userId = error ? null : (data?.user?.id ?? null);
        authResolution = error ? "lookup_failed" : userId ? "resolved" : "anonymous";
      } catch {
        authResolution = "lookup_failed";
        // Fall through — the insert will still attempt via the DB default.
      }
    }
    const rowToInsert = userId ? { ...row, user_id: userId } : row;
    const { data, error } = await client
      .from("ai_doctor_sessions" as never)
      .insert(rowToInsert as never)
      .select("id")
      .single();
    if (error) {
      // An ambiguous transport failure may mean the first insert committed
      // even though the client never received its response. A retry reuses
      // the same UUID. Confirm the row through normal owner-scoped SELECT RLS
      // before treating that primary-key conflict as a durable success.
      if (
        (error as { code?: unknown }).code === "23505" &&
        (await confirmOwnedSessionExists(client, sessionId))
      ) {
        return { ok: true, id: sessionId };
      }
      const diagnostic = buildAiDoctorSessionPersistenceFailureDiagnostic({
        stage: "insert",
        error,
        authResolution,
        scope,
        fallbackMessage: "insert_failed",
      });
      return { ok: false, error: diagnostic.safeMessage, diagnostic };
    }
    const id =
      data && typeof (data as { id?: unknown }).id === "string"
        ? (data as { id: string }).id
        : null;
    if (id !== sessionId) {
      const diagnostic = buildAiDoctorSessionPersistenceFailureDiagnostic({
        stage: "insert",
        error: { message: "missing_or_mismatched_saved_session_id" },
        authResolution,
        scope,
        fallbackMessage: "missing_or_mismatched_saved_session_id",
      });
      return { ok: false, error: diagnostic.safeMessage, diagnostic };
    }
    return { ok: true, id: sessionId };
  } catch (e) {
    const diagnostic = buildAiDoctorSessionPersistenceFailureDiagnostic({
      stage: "unexpected",
      error: e instanceof Error ? e : { message: "unknown" },
      authResolution,
      scope,
      fallbackMessage: "unknown",
    });
    return { ok: false, error: diagnostic.safeMessage, diagnostic };
  }
}
