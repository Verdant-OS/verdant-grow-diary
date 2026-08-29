/**
 * quickLogRevisionService — client write path for Quick Log corrections and
 * retractions (issue #786).
 *
 * Calls public.quicklog_correct_entry / public.quicklog_retract_entry. Both
 * RPCs are SECURITY DEFINER, derive the owner from auth.uid(), append an
 * immutable quicklog_entry_revisions ledger row, and never hard-delete.
 *
 * Never sends user_id. No entitlement/plan checks anywhere on this path —
 * corrections and retractions are core Free behavior for every plan.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import {
  parseQuickLogRevisionRow,
  validateQuickLogCorrection,
  type QuickLogCorrectionChanges,
  type QuickLogRevisionReasonCode,
  type QuickLogRevisionRow,
} from "@/lib/quick-log/quickLogRevisionRules";

type PublicTableName = keyof Database["public"]["Tables"];
type PublicFunctionName = keyof Database["public"]["Functions"];

export const QUICKLOG_REVISION_TABLE = "quicklog_entry_revisions" satisfies PublicTableName;
export const QUICKLOG_CORRECT_RPC = "quicklog_correct_entry" satisfies PublicFunctionName;
export const QUICKLOG_RETRACT_RPC = "quicklog_retract_entry" satisfies PublicFunctionName;

type QuickLogRevisionDatabaseRow =
  Database["public"]["Tables"][typeof QUICKLOG_REVISION_TABLE]["Row"];

export interface QuickLogEntryHandle {
  growEventId?: string | null;
  diaryEntryId?: string | null;
}

export type QuickLogRevisionWriteResult =
  | {
      ok: true;
      revisionId: string;
      revisionNo: number;
      growEventId: string | null;
      diaryEntryIds: string[];
    }
  | { ok: false; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isJson(value: unknown, seen: Set<object> = new Set(), depth = 0): value is Json {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return true;
  }
  if (depth >= 100 || typeof value !== "object" || value === null || seen.has(value)) {
    return false;
  }

  const nestedSeen = new Set(seen);
  nestedSeen.add(value);
  if (Array.isArray(value)) {
    return value.every((nested) => isJson(nested, nestedSeen, depth + 1));
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return false;
  }
  return Object.values(value).every(
    (nested) => nested === undefined || isJson(nested, nestedSeen, depth + 1),
  );
}

/**
 * Validate the physical PostgREST row before handing it to the pure revision
 * rules. This keeps malformed or stale API payloads out of timeline state.
 */
export function adaptQuickLogRevisionDatabaseRow(value: unknown): QuickLogRevisionRow | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.actor_id !== "string" ||
    typeof value.created_at !== "string" ||
    !isNullableString(value.diary_entry_id) ||
    !isNullableString(value.grow_event_id) ||
    typeof value.id !== "string" ||
    typeof value.kind !== "string" ||
    !isJson(value.new_state) ||
    !isJson(value.previous_state) ||
    typeof value.reason_code !== "string" ||
    !isNullableString(value.reason_note) ||
    typeof value.revision_no !== "number" ||
    !Number.isFinite(value.revision_no) ||
    typeof value.root_id !== "string" ||
    typeof value.user_id !== "string"
  ) {
    return null;
  }

  const row: QuickLogRevisionDatabaseRow = {
    actor_id: value.actor_id,
    created_at: value.created_at,
    diary_entry_id: value.diary_entry_id,
    grow_event_id: value.grow_event_id,
    id: value.id,
    kind: value.kind,
    new_state: value.new_state,
    previous_state: value.previous_state,
    reason_code: value.reason_code,
    reason_note: value.reason_note,
    revision_no: value.revision_no,
    root_id: value.root_id,
    user_id: value.user_id,
  };
  return row;
}

export function adaptQuickLogRevisionDatabaseRows(data: unknown): QuickLogRevisionRow[] {
  if (!Array.isArray(data)) return [];
  return data
    .map(adaptQuickLogRevisionDatabaseRow)
    .filter((row): row is QuickLogRevisionRow => row !== null);
}

export type QuickLogRevisionRowsDecodeResult =
  { ok: true; rows: QuickLogRevisionRow[] } | { ok: false };

/**
 * Decode a complete physical revision-row response for confidence-bearing UI.
 * A non-array payload or one rejected row makes the entire response unreadable;
 * partial rows are never exposed as a trustworthy ledger result.
 */
export function decodeQuickLogRevisionDatabaseRows(
  data: unknown,
): QuickLogRevisionRowsDecodeResult {
  if (!Array.isArray(data)) return { ok: false };

  const rows: QuickLogRevisionRow[] = [];
  for (const value of data) {
    const row = adaptQuickLogRevisionDatabaseRow(value);
    if (row === null || parseQuickLogRevisionRow(row) === null) {
      return { ok: false };
    }
    rows.push(row);
  }
  return { ok: true, rows };
}

function parseRpcResult(data: unknown): QuickLogRevisionWriteResult {
  if (!isRecord(data)) {
    return { ok: false, reason: "rpc_error" };
  }
  if (data.ok !== true) {
    return {
      ok: false,
      reason: typeof data.reason === "string" ? data.reason : "rpc_error",
    };
  }
  if (
    typeof data.revision_id !== "string" ||
    data.revision_id.length === 0 ||
    typeof data.revision_no !== "number" ||
    !Number.isInteger(data.revision_no) ||
    data.revision_no < 1 ||
    !isNullableString(data.grow_event_id) ||
    !Array.isArray(data.diary_entry_ids) ||
    !data.diary_entry_ids.every(
      (value): value is string => typeof value === "string" && value.length > 0,
    )
  ) {
    return { ok: false, reason: "rpc_error" };
  }
  return {
    ok: true,
    revisionId: data.revision_id,
    revisionNo: data.revision_no,
    growEventId: data.grow_event_id,
    diaryEntryIds: data.diary_entry_ids,
  };
}

function rpcErrorReason(error: { code?: string | null }): string {
  const code = typeof error.code === "string" ? error.code : "";
  if (code === "PGRST202" || code === "42883") return "rpc_unavailable";
  if (code === "42501") return "forbidden";
  return "rpc_error";
}

export async function retractQuickLogEntry(
  handle: QuickLogEntryHandle,
  reasonCode: QuickLogRevisionReasonCode,
  reasonNote?: string | null,
): Promise<QuickLogRevisionWriteResult> {
  if (!handle.growEventId && !handle.diaryEntryId) {
    return { ok: false, reason: "missing_root" };
  }
  const { data, error } = await supabase.rpc(QUICKLOG_RETRACT_RPC, {
    p_reason_code: reasonCode,
    p_grow_event_id: handle.growEventId ?? undefined,
    p_diary_entry_id: handle.diaryEntryId ?? undefined,
    p_reason_note: reasonNote?.trim() ? reasonNote.trim() : undefined,
  });
  if (error) return { ok: false, reason: rpcErrorReason(error) };
  return parseRpcResult(data);
}

export async function correctQuickLogEntry(
  handle: QuickLogEntryHandle,
  reasonCode: QuickLogRevisionReasonCode,
  changes: QuickLogCorrectionChanges,
  reasonNote?: string | null,
): Promise<QuickLogRevisionWriteResult> {
  if (!handle.growEventId && !handle.diaryEntryId) {
    return { ok: false, reason: "missing_root" };
  }
  const validated = validateQuickLogCorrection(changes, reasonNote ?? null);
  if (!validated.ok) return { ok: false, reason: validated.reason };
  if (!isJson(validated.changes)) return { ok: false, reason: "invalid_changes" };
  const { data, error } = await supabase.rpc(QUICKLOG_CORRECT_RPC, {
    p_reason_code: reasonCode,
    p_changes: validated.changes,
    p_grow_event_id: handle.growEventId ?? undefined,
    p_diary_entry_id: handle.diaryEntryId ?? undefined,
    p_reason_note: reasonNote?.trim() ? reasonNote.trim() : undefined,
  });
  if (error) return { ok: false, reason: rpcErrorReason(error) };
  return parseRpcResult(data);
}
