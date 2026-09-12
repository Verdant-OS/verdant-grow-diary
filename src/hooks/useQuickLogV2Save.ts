import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { classifyQuickLogThrownSaveError } from "@/lib/quickLogSaveErrorMessage";
import type { QuickLogV2SavePayload } from "@/lib/quickLogV2SavePayload";
import { trackQuickLogSuccess, type QuickLogSuccessInput } from "@/lib/quickLogSuccessTelemetry";

export interface QuickLogV2SaveResult {
  ok: boolean;
  reason?: string;
  growEventId?: string | null;
  environmentEventId?: string | null;
  reused?: boolean;
  /** Confirmed Note text; null represents a note-free observation. */
  persistedNote?: string | null;
  /** A recognized structured rejection before any logical event write. */
  definitiveRejected?: boolean;
}

interface RpcResponse {
  ok?: boolean;
  reason?: string;
  grow_event_id?: string | null;
  environment_event_id?: string | null;
  reused?: boolean;
}

export interface QuickLogV2SaveOptions {
  /**
   * Explicit, closed grower Quick Log intent. Omit for adapters and other
   * workflows that reuse this persistence hook without representing a
   * grower-authored Quick Log activation.
   */
  telemetryIntent?: QuickLogSuccessInput;
  /** Resolve an uncertain Note save against its persisted event before success. */
  verifyPersistedNote?: boolean;
}

// These normal RPC responses are emitted before the manual event insert.
// Missing/malformed replies, exceptions, save_failed and receipt failures do
// not establish non-commit and must retain the caller's original submission.
const DEFINITIVE_MANUAL_REJECTIONS = new Set([
  "not_authenticated",
  "invalid_idempotency_key",
  "invalid_target_type",
  "missing_target_id",
  "unsupported_action",
  "invalid_volume",
  "invalid_details",
  "invalid_logged_at",
  "target_not_owned",
  "grow_not_owned",
]);

export function useQuickLogV2Save() {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = useCallback(
    async (
      payload: QuickLogV2SavePayload,
      options: QuickLogV2SaveOptions = {},
    ): Promise<QuickLogV2SaveResult> => {
      setSaving(true);
      setError(null);
      try {
        const { data, error: rpcError } = await supabase.rpc(
          "quicklog_save_manual" as any,
          payload as unknown as Record<string, unknown>,
        );
        if (rpcError) {
          // Transport/Postgres-level failure (malformed uuid literal, missing
          // function, revoked EXECUTE, offline) — classify so surfaces can
          // show a specific message instead of a blanket "save failed".
          const reason = classifyQuickLogThrownSaveError(rpcError);
          setError(reason);
          return { ok: false, reason };
        }
        const r = (data ?? {}) as RpcResponse;
        if (!r.ok) {
          const reason = r.reason || "save_failed";
          setError(reason);
          return {
            ok: false,
            reason,
            ...(r.ok === false && DEFINITIVE_MANUAL_REJECTIONS.has(reason)
              ? { definitiveRejected: true }
              : {}),
          };
        }
        let persistedNote: string | null | undefined;
        if (payload.p_action === "note") {
          // A new successful atomic RPC confirms the submitted text. A reused
          // key does not: manual-save deliberately returns its original row
          // even if a caller supplies different text. Resolve that row before
          // reporting success for retries or reuse.
          persistedNote = payload.p_note;
          if (r.reused === true || options.verifyPersistedNote === true) {
            if (!r.grow_event_id) {
              setError("receipt_unverified");
              return { ok: false, reason: "receipt_unverified" };
            }
            const { data: event, error: readError } = await supabase
              .from("grow_events")
              .select("id,note,plant_id,tent_id")
              .eq("id", r.grow_event_id)
              .maybeSingle();
            if (readError || !event) {
              setError("receipt_unverified");
              return { ok: false, reason: "receipt_unverified" };
            }
            const targetId = payload.p_target_type === "plant" ? event.plant_id : event.tent_id;
            if (event.id !== r.grow_event_id || targetId !== payload.p_target_id) {
              setError("receipt_mismatch");
              return { ok: false, reason: "receipt_mismatch" };
            }
            if (event.note !== payload.p_note) {
              setError("receipt_mismatch");
              return {
                ok: false,
                reason: "receipt_mismatch",
                growEventId: event.id,
                persistedNote: event.note,
              };
            }
            persistedNote = event.note;
          }
        }
        if (options.telemetryIntent !== undefined) {
          trackQuickLogSuccess(options.telemetryIntent, { reused: r.reused === true });
        }
        return {
          ok: true,
          growEventId: r.grow_event_id ?? null,
          environmentEventId: r.environment_event_id ?? null,
          reused: r.reused === true,
          ...(persistedNote !== undefined ? { persistedNote } : {}),
        };
      } catch (thrown) {
        const reason = classifyQuickLogThrownSaveError(thrown);
        setError(reason);
        return { ok: false, reason };
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  return { save, saving, error };
}
