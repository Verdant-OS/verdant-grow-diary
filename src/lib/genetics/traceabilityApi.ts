/**
 * Genetics & Propagation Traceability data-access layer.
 *
 * The ONLY module that touches Supabase for this feature. Reads go through the
 * typed boundary's SELECT-own tables; every mutation goes through a SECURITY
 * DEFINER RPC and requires an 8..200 char idempotency key that the caller mints
 * ONCE per logical submission and reuses across retries (so a retry can never
 * duplicate a write — the server collapses it to the original result).
 *
 * All functions return a discriminated Result. Under this repo's strict:false
 * config, narrow with `result.ok === true` / `result.ok === false`.
 */
import { supabase } from "@/integrations/supabase/client";
import { geneticsTraceabilityDb } from "@/integrations/supabase/geneticsTraceabilityTables";

export type MutationResult<T = Record<string, unknown>> =
  | { ok: true; data: T; reused: boolean }
  | { ok: false; error: string };

function newIdempotencyKey(): string {
  // 32-hex chars — comfortably within the server's 8..200 bound.
  return crypto.randomUUID().replace(/-/g, "");
}
export { newIdempotencyKey };

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function envelopeToResult(data: unknown, error: { message?: string } | null): MutationResult {
  if (error) return { ok: false, error: error.message ?? "request_failed" };
  if (!isRecord(data)) return { ok: false, error: "unexpected_response" };
  if (data.ok === true) {
    return { ok: true, data, reused: data.reused === true };
  }
  return { ok: false, error: typeof data.reason === "string" ? data.reason : "rejected" };
}

// ---------------------------------------------------------------------------
// Read DTOs (camelCase, readonly)
// ---------------------------------------------------------------------------
export interface AccessionDto {
  readonly id: string;
  readonly sourceKind: string;
  readonly sourceParty: string | null;
  readonly cultivarName: string | null;
  readonly lineName: string | null;
  readonly generation: string | null;
  readonly acquisitionDate: string | null;
  readonly knownState: string;
  readonly archivedAt: string | null;
}

export interface BatchDto {
  readonly id: string;
  readonly batchCode: string;
  readonly name: string | null;
  readonly propagationMethod: string;
  readonly sourceAccessionId: string | null;
  readonly motherPlantId: string | null;
  readonly originUnknown: boolean;
  readonly initialQuantity: number | null;
  readonly viableQuantity: number | null;
  readonly countsUnknown: boolean;
  readonly status: string;
}

export interface ScreeningDto {
  readonly id: string;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly target: string;
  readonly result: string;
  readonly laboratory: string | null;
  readonly collectedDate: string | null;
  readonly resultDate: string | null;
  readonly supersedesId: string | null;
  readonly recordedAt: string;
}

export interface QuarantineEpisodeDto {
  readonly id: string;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly target: string;
  readonly status: string;
  readonly openedAt: string;
  readonly reopenedAt: string | null;
  readonly closedAt: string | null;
  readonly closureKind: string | null;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------
export async function listAccessions(includeArchived = false): Promise<AccessionDto[]> {
  const uid = await currentUserId();
  if (!uid) return [];
  let q = geneticsTraceabilityDb
    .from("genetics_accessions")
    .select(
      "id, source_kind, source_party, cultivar_name, line_name, generation, acquisition_date, known_state, archived_at",
    )
    .eq("user_id", uid)
    .order("created_at", { ascending: false })
    .limit(2000);
  if (!includeArchived) q = q.is("archived_at", null);
  const { data, error } = await q;
  if (error || !data) return [];
  return data.map((r) => ({
    id: r.id,
    sourceKind: r.source_kind,
    sourceParty: r.source_party ?? null,
    cultivarName: r.cultivar_name ?? null,
    lineName: r.line_name ?? null,
    generation: r.generation ?? null,
    acquisitionDate: r.acquisition_date ?? null,
    knownState: r.known_state,
    archivedAt: r.archived_at ?? null,
  }));
}

export async function listBatches(): Promise<BatchDto[]> {
  const uid = await currentUserId();
  if (!uid) return [];
  const { data, error } = await geneticsTraceabilityDb
    .from("propagation_batches")
    .select(
      "id, batch_code, name, propagation_method, source_accession_id, mother_plant_id, origin_unknown, initial_quantity, viable_quantity, counts_unknown, status",
    )
    .eq("user_id", uid)
    .order("created_at", { ascending: false })
    .limit(2000);
  if (error || !data) return [];
  return data.map((r) => ({
    id: r.id,
    batchCode: r.batch_code,
    name: r.name ?? null,
    propagationMethod: r.propagation_method,
    sourceAccessionId: r.source_accession_id ?? null,
    motherPlantId: r.mother_plant_id ?? null,
    originUnknown: r.origin_unknown === true,
    initialQuantity: r.initial_quantity ?? null,
    viableQuantity: r.viable_quantity ?? null,
    countsUnknown: r.counts_unknown === true,
    status: r.status,
  }));
}

export async function listScreeningForSubject(
  subjectType: string,
  subjectId: string,
): Promise<ScreeningDto[]> {
  const uid = await currentUserId();
  if (!uid || !subjectId) return [];
  const { data, error } = await geneticsTraceabilityDb
    .from("genetics_screening_results")
    .select(
      "id, subject_type, subject_id, target, result, laboratory, collected_date, result_date, supersedes_id, recorded_at",
    )
    .eq("user_id", uid)
    .eq("subject_type", subjectType)
    .eq("subject_id", subjectId)
    .order("collected_date", { ascending: false })
    .limit(1000);
  if (error || !data) return [];
  return data.map((r) => ({
    id: r.id,
    subjectType: r.subject_type,
    subjectId: r.subject_id,
    target: r.target,
    result: r.result,
    laboratory: r.laboratory ?? null,
    collectedDate: r.collected_date ?? null,
    resultDate: r.result_date ?? null,
    supersedesId: r.supersedes_id ?? null,
    recordedAt: r.recorded_at,
  }));
}

export async function listQuarantineForSubject(
  subjectType: string,
  subjectId: string,
): Promise<QuarantineEpisodeDto[]> {
  const uid = await currentUserId();
  if (!uid || !subjectId) return [];
  const { data, error } = await geneticsTraceabilityDb
    .from("quarantine_episodes")
    .select(
      "id, subject_type, subject_id, target, status, opened_at, reopened_at, closed_at, closure_kind",
    )
    .eq("user_id", uid)
    .eq("subject_type", subjectType)
    .eq("subject_id", subjectId)
    .order("opened_at", { ascending: false })
    .limit(500);
  if (error || !data) return [];
  return data.map((r) => ({
    id: r.id,
    subjectType: r.subject_type,
    subjectId: r.subject_id,
    target: r.target,
    status: r.status,
    openedAt: r.opened_at,
    reopenedAt: r.reopened_at ?? null,
    closedAt: r.closed_at ?? null,
    closureKind: r.closure_kind ?? null,
  }));
}

export async function resolveTrace(
  subjectType: string,
  subjectId: string,
  direction: "ancestors" | "descendants" | "both" = "both",
): Promise<unknown> {
  const { data, error } = await geneticsTraceabilityDb.rpc("genetics_trace_resolve", {
    p_subject_type: subjectType,
    p_subject_id: subjectId,
    p_direction: direction,
  });
  if (error) return { ok: false, reason: error.message };
  return data;
}

// ---------------------------------------------------------------------------
// Mutations (idempotency key supplied by the caller and reused across retries)
// ---------------------------------------------------------------------------
export async function upsertAccession(
  payload: Record<string, unknown>,
  idempotencyKey: string,
): Promise<MutationResult> {
  const { data, error } = await geneticsTraceabilityDb.rpc("genetics_accession_upsert", {
    p_idempotency_key: idempotencyKey,
    p_payload: payload,
  });
  return envelopeToResult(data, error);
}

export async function archiveAccession(
  accessionId: string,
  archived: boolean,
  idempotencyKey: string,
): Promise<MutationResult> {
  const { data, error } = await geneticsTraceabilityDb.rpc("genetics_accession_archive", {
    p_idempotency_key: idempotencyKey,
    p_accession_id: accessionId,
    p_archived: archived,
  });
  return envelopeToResult(data, error);
}

export async function upsertBatch(
  payload: Record<string, unknown>,
  idempotencyKey: string,
): Promise<MutationResult> {
  const { data, error } = await geneticsTraceabilityDb.rpc("genetics_batch_upsert", {
    p_idempotency_key: idempotencyKey,
    p_payload: payload,
  });
  return envelopeToResult(data, error);
}

export async function assignPlants(
  batchId: string,
  plantIds: readonly string[],
  reason: string | null,
  idempotencyKey: string,
): Promise<MutationResult> {
  const { data, error } = await geneticsTraceabilityDb.rpc("genetics_assign_plants", {
    p_idempotency_key: idempotencyKey,
    p_batch_id: batchId,
    p_plant_ids: [...plantIds],
    p_reason: reason,
  });
  return envelopeToResult(data, error);
}

export async function recordScreening(
  payload: Record<string, unknown>,
  idempotencyKey: string,
): Promise<MutationResult> {
  const { data, error } = await geneticsTraceabilityDb.rpc("genetics_screening_record", {
    p_idempotency_key: idempotencyKey,
    p_payload: payload,
  });
  return envelopeToResult(data, error);
}

export async function openQuarantine(
  payload: Record<string, unknown>,
  idempotencyKey: string,
): Promise<MutationResult> {
  const { data, error } = await geneticsTraceabilityDb.rpc("genetics_quarantine_open", {
    p_idempotency_key: idempotencyKey,
    p_payload: payload,
  });
  return envelopeToResult(data, error);
}

export async function transitionQuarantine(
  episodeId: string,
  action: string,
  reason: string | null,
  screeningResultId: string | null,
  idempotencyKey: string,
): Promise<MutationResult> {
  const { data, error } = await geneticsTraceabilityDb.rpc("genetics_quarantine_transition", {
    p_idempotency_key: idempotencyKey,
    p_episode_id: episodeId,
    p_action: action,
    p_reason: reason,
    p_screening_result_id: screeningResultId,
  });
  return envelopeToResult(data, error);
}
