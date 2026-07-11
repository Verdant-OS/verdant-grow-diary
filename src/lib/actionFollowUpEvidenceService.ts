/**
 * actionFollowUpEvidenceService — authenticated persistence for
 * grower-entered Action Queue follow-up evidence (Slice 2 / V1).
 *
 * Contract:
 *  - Reuses the existing marker-level `action_followup` diary_entries
 *    contract (details.event_type + details.action_queue_id). No new
 *    table, no migration, no RLS change.
 *  - Reverifies the action row through the authenticated client. RLS
 *    is authoritative; no service_role.
 *  - Never accepts user_id / auth headers / tokens from callers.
 *  - Never emits device commands, AI outcomes, or signed URLs.
 *  - Deterministic in-process in-flight guard prevents same-tab
 *    double submission; database reconciliation is the durable fence.
 */
import type { PostgrestError } from "@supabase/supabase-js";
import { supabase as defaultSupabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import {
  ACTION_FOLLOWUP_EVENT_TYPE,
  followupMatchesAction,
} from "@/lib/actionFollowupRules";
import {
  validateActionFollowUpDraft,
  type ActionFollowUpDraft,
  type ActionFollowUpOutcome,
} from "@/lib/actionFollowUpEvidenceRules";

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

export interface ActionFollowUpEvidenceRecord {
  diaryEntryId: string;
  actionQueueId: string;
  growId: string;
  tentId: string | null;
  plantId: string | null;
  outcome: ActionFollowUpOutcome;
  note: string;
  observedAt: string;
  photoReference: string | null;
  sensorSnapshotId: string | null;
  idempotencyKey: string;
}

export type ActionFollowUpEvidenceSaveResult =
  | { status: "created"; followUp: ActionFollowUpEvidenceRecord }
  | { status: "existing"; followUp: ActionFollowUpEvidenceRecord }
  | {
      status: "blocked";
      reason:
        | "invalid_draft"
        | "action_not_found"
        | "action_not_completed"
        | "relationship_mismatch"
        | "wrong_owner"
        | "existing_follow_up_unreadable";
      fieldErrors?: Record<string, string>;
    }
  | {
      status: "failed";
      reason:
        | "action_query_failed"
        | "follow_up_query_failed"
        | "insert_failed"
        | "reconciliation_failed";
    };

export type AuthenticatedSupabaseClient = typeof defaultSupabase;

export interface ActionFollowUpEvidenceServiceDependencies {
  supabase?: AuthenticatedSupabaseClient;
  now?: () => string;
}

/* -------------------------------------------------------------------------- */
/* Constants                                                                   */
/* -------------------------------------------------------------------------- */

const CONSERVATIVE_EMPTY_NOTE_LABEL = "Follow-up recorded.";

/** Deterministic; contains the actionQueueId; no time, no randomness. */
export function buildActionFollowUpIdempotencyKey(actionQueueId: string): string {
  return `action-followup:${actionQueueId}`;
}

/* -------------------------------------------------------------------------- */
/* In-flight guard (module scope, outside React)                               */
/* -------------------------------------------------------------------------- */

const inflight = new Map<string, Promise<ActionFollowUpEvidenceSaveResult>>();

/* -------------------------------------------------------------------------- */
/* Payload builder (pure, exported for tests)                                  */
/* -------------------------------------------------------------------------- */

export interface DiaryEntryInsertPayload {
  grow_id: string;
  tent_id: string | null;
  plant_id: string | null;
  note: string;
  details: Json;
}

interface VerifiedActionRow {
  id: string;
  grow_id: string;
  tent_id: string | null;
  plant_id: string | null;
  status: string;
}

export function buildActionFollowUpInsertPayload(
  draft: ActionFollowUpDraft,
  verifiedAction: VerifiedActionRow,
): DiaryEntryInsertPayload {
  const trimmedNote = draft.note.trim();
  const noteForRow = trimmedNote.length > 0 ? trimmedNote : CONSERVATIVE_EMPTY_NOTE_LABEL;
  return {
    grow_id: verifiedAction.grow_id,
    tent_id: verifiedAction.tent_id,
    plant_id: verifiedAction.plant_id,
    note: noteForRow,
    details: {
      event_type: ACTION_FOLLOWUP_EVENT_TYPE,
      action_queue_id: verifiedAction.id,
      outcome: draft.outcome,
      observed_at: draft.observedAt,
      note: trimmedNote,
      photo_reference: draft.photoReference ?? null,
      sensor_snapshot_id: draft.sensorSnapshotId ?? null,
      idempotency_key: buildActionFollowUpIdempotencyKey(verifiedAction.id),
    } as unknown as Json,
  };
}

/* -------------------------------------------------------------------------- */
/* Row projection                                                              */
/* -------------------------------------------------------------------------- */

interface DiaryRowShape {
  id: string | null;
  grow_id: string | null;
  tent_id: string | null;
  plant_id: string | null;
  note: string | null;
  details: unknown;
}

function projectRecord(row: DiaryRowShape): ActionFollowUpEvidenceRecord | null {
  if (!row.id || !row.grow_id) return null;
  const d =
    row.details && typeof row.details === "object" ? (row.details as Record<string, unknown>) : {};
  const outcome = d.outcome;
  const validOutcomes: readonly string[] = [
    "improved",
    "unchanged",
    "declined",
    "too_soon",
    "unclear",
  ];
  const outcomeSafe: ActionFollowUpOutcome = validOutcomes.includes(outcome as string)
    ? (outcome as ActionFollowUpOutcome)
    : "unclear";
  const actionId = typeof d.action_queue_id === "string" ? d.action_queue_id : "";
  return {
    diaryEntryId: row.id,
    actionQueueId: actionId,
    growId: row.grow_id,
    tentId: row.tent_id,
    plantId: row.plant_id,
    outcome: outcomeSafe,
    note: typeof d.note === "string" ? d.note : (row.note ?? ""),
    observedAt: typeof d.observed_at === "string" ? d.observed_at : "",
    photoReference: typeof d.photo_reference === "string" ? d.photo_reference : null,
    sensorSnapshotId: typeof d.sensor_snapshot_id === "string" ? d.sensor_snapshot_id : null,
    idempotencyKey:
      typeof d.idempotency_key === "string"
        ? d.idempotency_key
        : buildActionFollowUpIdempotencyKey(actionId),
  };
}

/** Chronological reconciliation: earliest valid follow-up wins. */
function pickPrimary(rows: DiaryRowShape[], actionId: string): DiaryRowShape | null {
  const matched = rows.filter((r) =>
    followupMatchesAction(
      { details: r.details as { event_type?: unknown; action_queue_id?: unknown } | null },
      actionId,
    ),
  );
  if (matched.length === 0) return null;
  return matched.reduce((earliest, cur) => {
    if (!earliest) return cur;
    const a = String(earliest.id ?? "");
    const b = String(cur.id ?? "");
    return a <= b ? earliest : cur;
  }, matched[0]);
}

/* -------------------------------------------------------------------------- */
/* Duplicate/conflict detection                                                */
/* -------------------------------------------------------------------------- */

function looksLikeDuplicateError(err: PostgrestError | null | undefined): boolean {
  if (!err) return false;
  const code = (err.code ?? "").toString();
  if (code === "23505") return true;
  const msg = (err.message ?? "").toLowerCase();
  return msg.includes("duplicate") || msg.includes("conflict") || msg.includes("unique");
}

/* -------------------------------------------------------------------------- */
/* Main entry                                                                  */
/* -------------------------------------------------------------------------- */

export async function saveActionFollowUpEvidence(
  draft: ActionFollowUpDraft,
  dependencies?: ActionFollowUpEvidenceServiceDependencies,
): Promise<ActionFollowUpEvidenceSaveResult> {
  const client = dependencies?.supabase ?? defaultSupabase;

  const validation = validateActionFollowUpDraft(draft);
  if (!validation.ok) {
    return {
      status: "blocked",
      reason: "invalid_draft",
      fieldErrors: { form: validation.reason },
    };
  }
  const validDraft = validation.draft;
  const key = buildActionFollowUpIdempotencyKey(validDraft.actionQueueId);

  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = (async (): Promise<ActionFollowUpEvidenceSaveResult> => {
    // 1. Reverify action row through the authenticated client (RLS-scoped).
    const actionQuery = await client
      .from("action_queue")
      .select("id,grow_id,tent_id,plant_id,status")
      .eq("id", validDraft.actionQueueId)
      .maybeSingle();
    if (actionQuery.error) {
      return { status: "failed", reason: "action_query_failed" };
    }
    const action = actionQuery.data as VerifiedActionRow | null;
    if (!action) {
      // RLS hides cross-user rows as not-found. Do not distinguish.
      return { status: "blocked", reason: "action_not_found" };
    }
    if (action.status !== "completed") {
      return { status: "blocked", reason: "action_not_completed" };
    }
    if (action.grow_id !== validDraft.growId) {
      return { status: "blocked", reason: "relationship_mismatch" };
    }
    if (validDraft.tentId && action.tent_id && action.tent_id !== validDraft.tentId) {
      return { status: "blocked", reason: "relationship_mismatch" };
    }
    if (validDraft.plantId && action.plant_id && action.plant_id !== validDraft.plantId) {
      return { status: "blocked", reason: "relationship_mismatch" };
    }

    // 2. Existing follow-up lookup.
    const lookup = await client
      .from("diary_entries")
      .select("id,grow_id,tent_id,plant_id,note,details")
      .eq("grow_id", action.grow_id)
      .contains("details", {
        event_type: ACTION_FOLLOWUP_EVENT_TYPE,
        action_queue_id: action.id,
      });
    if (lookup.error) {
      return { status: "failed", reason: "follow_up_query_failed" };
    }
    const rows = (lookup.data ?? []) as DiaryRowShape[];
    if (rows.length > 0) {
      const primary = pickPrimary(rows, action.id);
      if (!primary) {
        return { status: "blocked", reason: "existing_follow_up_unreadable" };
      }
      const projected = projectRecord(primary);
      if (!projected) {
        return { status: "blocked", reason: "existing_follow_up_unreadable" };
      }
      return { status: "existing", followUp: projected };
    }

    // 3. Insert.
    const payload = buildActionFollowUpInsertPayload(validDraft, action);
    const insertRes = await client
      .from("diary_entries")
      .insert(payload)
      .select("id,grow_id,tent_id,plant_id,note,details")
      .maybeSingle();

    if (insertRes.error) {
      // Reconcile: duplicate or ambiguous failure — re-query.
      const recon = await client
        .from("diary_entries")
        .select("id,grow_id,tent_id,plant_id,note,details")
        .eq("grow_id", action.grow_id)
        .contains("details", {
          event_type: ACTION_FOLLOWUP_EVENT_TYPE,
          action_queue_id: action.id,
        });
      if (recon.error) {
        return { status: "failed", reason: "reconciliation_failed" };
      }
      const reconRows = (recon.data ?? []) as DiaryRowShape[];
      if (reconRows.length > 0) {
        const primary = pickPrimary(reconRows, action.id);
        const projected = primary ? projectRecord(primary) : null;
        if (projected) return { status: "existing", followUp: projected };
      }
      // No reconciled row.
      return {
        status: "failed",
        reason: looksLikeDuplicateError(insertRes.error) ? "insert_failed" : "insert_failed",
      };
    }
    const createdRow = insertRes.data as DiaryRowShape | null;
    if (!createdRow) {
      return { status: "failed", reason: "insert_failed" };
    }
    const projected = projectRecord(createdRow);
    if (!projected) {
      return { status: "failed", reason: "insert_failed" };
    }
    return { status: "created", followUp: projected };
  })();

  inflight.set(key, promise);
  try {
    return await promise;
  } finally {
    inflight.delete(key);
  }
}

/** Test-only helper. Not used in production paths. */
export function __resetActionFollowUpInflightForTests(): void {
  inflight.clear();
}
