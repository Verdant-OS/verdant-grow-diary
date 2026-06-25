/**
 * useSaveAiDoctorPhase1TimelineEvidence — grower-initiated save hook.
 *
 * Wraps the existing safe Quick Log v2 manual-save RPC path. Tracks
 * idempotency keys already saved in this session so a duplicate click on
 * the same derived result does not create a duplicate timeline row.
 *
 * Hard constraints:
 *  - Only calls `quicklog_save_manual` RPC. No Action Queue, no alerts,
 *    no edge functions, no AI/model endpoints, no device control.
 *  - Save is grower-initiated. No auto-save.
 *  - Refuses to save a blocked draft.
 */

import { useCallback, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  buildAiDoctorPhase1TimelineDraft,
  isOkPhase1TimelineDraft,
  type AiDoctorPhase1TimelineDraftInput,
} from "@/lib/aiDoctorPhase1TimelineDraft";

export type SaveAiDoctorPhase1EvidenceStatus =
  | "idle"
  | "saving"
  | "saved"
  | "duplicate"
  | "blocked"
  | "error";

export interface SaveAiDoctorPhase1EvidenceResult {
  status: SaveAiDoctorPhase1EvidenceStatus;
  reason?: string;
  growEventId?: string | null;
  idempotencyKey?: string;
}

interface RpcResponse {
  ok?: boolean;
  reason?: string;
  grow_event_id?: string | null;
}

export interface UseSaveAiDoctorPhase1TimelineEvidenceApi {
  status: SaveAiDoctorPhase1EvidenceStatus;
  save: (
    input: AiDoctorPhase1TimelineDraftInput,
  ) => Promise<SaveAiDoctorPhase1EvidenceResult>;
  /** Visible for tests — clears in-session dedupe cache. */
  resetSeen: () => void;
  /** Visible for tests — has a key been seen this session? */
  hasSeen: (key: string) => boolean;
}

export function useSaveAiDoctorPhase1TimelineEvidence(): UseSaveAiDoctorPhase1TimelineEvidenceApi {
  const [status, setStatus] =
    useState<SaveAiDoctorPhase1EvidenceStatus>("idle");
  const seenRef = useRef<Set<string>>(new Set());

  const save = useCallback(
    async (
      input: AiDoctorPhase1TimelineDraftInput,
    ): Promise<SaveAiDoctorPhase1EvidenceResult> => {
      const draft = buildAiDoctorPhase1TimelineDraft(input);
      if (!isOkPhase1TimelineDraft(draft)) {
        setStatus("blocked");
        return { status: "blocked", reason: draft.reasons.join(",") };
      }

      if (seenRef.current.has(draft.idempotency_key)) {
        setStatus("duplicate");
        return {
          status: "duplicate",
          idempotencyKey: draft.idempotency_key,
        };
      }

      setStatus("saving");
      try {
        const { data, error } = await supabase.rpc(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          "quicklog_save_manual" as any,
          draft.payload as unknown as Record<string, unknown>,
        );
        if (error) {
          setStatus("error");
          return { status: "error", reason: "save_failed" };
        }
        const r = (data ?? {}) as RpcResponse;
        if (!r.ok) {
          setStatus("error");
          return { status: "error", reason: r.reason || "save_failed" };
        }
        seenRef.current.add(draft.idempotency_key);
        setStatus("saved");
        return {
          status: "saved",
          growEventId: r.grow_event_id ?? null,
          idempotencyKey: draft.idempotency_key,
        };
      } catch {
        setStatus("error");
        return { status: "error", reason: "save_failed" };
      }
    },
    [],
  );

  const resetSeen = useCallback(() => {
    seenRef.current.clear();
  }, []);

  const hasSeen = useCallback((key: string) => seenRef.current.has(key), []);

  return { status, save, resetSeen, hasSeen };
}
