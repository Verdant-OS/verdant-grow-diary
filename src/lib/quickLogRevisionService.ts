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
import {
  validateQuickLogCorrection,
  type QuickLogCorrectionChanges,
  type QuickLogRevisionReasonCode,
} from "@/lib/quick-log/quickLogRevisionRules";

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

function parseRpcResult(data: unknown): QuickLogRevisionWriteResult {
  if (typeof data !== "object" || data === null) {
    return { ok: false, reason: "rpc_error" };
  }
  const record = data as Record<string, unknown>;
  if (record.ok !== true) {
    return {
      ok: false,
      reason: typeof record.reason === "string" ? record.reason : "rpc_error",
    };
  }
  return {
    ok: true,
    revisionId: typeof record.revision_id === "string" ? record.revision_id : "",
    revisionNo: typeof record.revision_no === "number" ? record.revision_no : 0,
    growEventId: typeof record.grow_event_id === "string" ? record.grow_event_id : null,
    diaryEntryIds: Array.isArray(record.diary_entry_ids)
      ? record.diary_entry_ids.filter((v): v is string => typeof v === "string")
      : [],
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
  const { data, error } = await supabase.rpc("quicklog_retract_entry", {
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
  const { data, error } = await supabase.rpc("quicklog_correct_entry", {
    p_reason_code: reasonCode,
    p_changes: validated.changes as never,
    p_grow_event_id: handle.growEventId ?? undefined,
    p_diary_entry_id: handle.diaryEntryId ?? undefined,
    p_reason_note: reasonNote?.trim() ? reasonNote.trim() : undefined,
  });
  if (error) return { ok: false, reason: rpcErrorReason(error) };
  return parseRpcResult(data);
}
