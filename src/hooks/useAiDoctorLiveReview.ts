/**
 * useAiDoctorLiveReview — grower-initiated request lifecycle for the
 * server-side AI Doctor review endpoint.
 *
 * Hard constraints:
 *  - No auto-fire, no auto-retry, no polling. Manual `start()` / `retry()`.
 *  - Never writes sensor readings, alerts, or action_queue rows.
 *  - Server response is always re-validated client-side via the adapter;
 *    raw model text is never rendered.
 *  - Never logs raw responses, packets, secrets, or unvalidated AI output.
 *
 * Sensor Snapshot Status Contract v1 — audit-trail:
 *  - ONLY on a successful adapted result does this hook freeze the
 *    sensor evidence Classification used at run-time into
 *    `ai_doctor_sessions` via `persistAiDoctorSession`. One explicit
 *    successful run = one persisted session snapshot. No write on
 *    render, readiness, refetch, page-load, hover, mount, StrictMode
 *    double-invoke, or HTTP error.
 *  - Persistence failures are swallowed (non-blocking) — the audit row
 *    is best-effort and never blocks the grower's review.
 */
import { useCallback, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { AiDoctorReviewRequestPacket } from "@/lib/aiDoctorReviewRequestPacket";
import {
  adaptAiDoctorReviewResponse,
  type AiDoctorLiveReviewFailureReason,
} from "@/lib/aiDoctorReviewResponseAdapter";
import type { AiDoctorReviewResult } from "@/lib/aiDoctorReviewResultContract";
import type { Classification } from "@/lib/sensorSnapshotStatusContract";
import {
  persistAiDoctorSession,
  type AiDoctorSessionInput,
  type PersistAiDoctorSessionResult,
} from "@/lib/aiDoctorSessionPersistence";

export type AiDoctorLiveReviewStatus =
  | "idle"
  | "loading"
  | "result"
  | "error";

export interface AiDoctorLiveReviewState {
  status: AiDoctorLiveReviewStatus;
  result: AiDoctorReviewResult | null;
  reason: AiDoctorLiveReviewFailureReason | null;
}

export interface UseAiDoctorLiveReviewOptions {
  /** Hook is inert until a packet is provided AND `enabled` is true. */
  enabled: boolean;
  packet: AiDoctorReviewRequestPacket | null;
  /** Override for tests — defaults to supabase.functions.invoke. */
  invoke?: (
    name: string,
    init: { body: AiDoctorReviewRequestPacket },
  ) => Promise<{ data: unknown; error: unknown }>;
  /** Scope IDs used for the audit-trail row. Optional for back-compat. */
  growId?: string | null;
  tentId?: string | null;
  plantId?: string | null;
  /**
   * Frozen sensor evidence Classification at run-time. If null/undefined,
   * the audit row is still written so the timeline shows that no sensor
   * evidence was available; the row's status is `no_data` via the
   * persistence layer's caller. To suppress persistence entirely, omit
   * `growId` (the audit row has no useful scope without it).
   */
  sensorClassification?: Classification | null;
  /** Override for tests — defaults to `persistAiDoctorSession(supabase, ...)`. */
  persist?: (
    input: AiDoctorSessionInput,
  ) => Promise<PersistAiDoctorSessionResult>;
}

export interface UseAiDoctorLiveReviewApi extends AiDoctorLiveReviewState {
  start: () => void;
  retry: () => void;
  canStart: boolean;
}

const INITIAL: AiDoctorLiveReviewState = {
  status: "idle",
  result: null,
  reason: null,
};

export function useAiDoctorLiveReview(
  opts: UseAiDoctorLiveReviewOptions,
): UseAiDoctorLiveReviewApi {
  const { enabled, packet } = opts;
  const [state, setState] = useState<AiDoctorLiveReviewState>(INITIAL);
  const inflight = useRef(false);

  const canStart = enabled && packet != null && !inflight.current;

  const run = useCallback(async () => {
    if (!enabled || packet == null) return;
    if (inflight.current) return;
    inflight.current = true;
    setState({ status: "loading", result: null, reason: null });

    const invoke =
      opts.invoke ??
      ((name, init) =>
        supabase.functions.invoke(name, init) as Promise<{
          data: unknown;
          error: unknown;
        }>);

    try {
      const { data, error } = await invoke("ai-doctor-review", {
        body: packet,
      });
      if (error) {
        setState({ status: "error", result: null, reason: "http" });
        return;
      }
      const outcome = adaptAiDoctorReviewResponse(data);
      if (outcome.ok === false) {
        setState({ status: "error", result: null, reason: outcome.reason });
        return;
      }
      setState({ status: "result", result: outcome.result, reason: null });

      // Audit-trail: explicit successful run only. Best-effort, non-blocking.
      // Skipped when there is no scope (growId is required for an
      // ownership-checked insert under existing RLS).
      if (opts.growId) {
        const persist =
          opts.persist ??
          ((input: AiDoctorSessionInput) =>
            persistAiDoctorSession(supabase, input));
        try {
          await persist({
            growId: opts.growId,
            tentId: opts.tentId ?? null,
            plantId: opts.plantId ?? null,
            analysis: outcome.result,
            diagnosis: null,
            sensorEvidence: opts.sensorClassification ?? null,
          });
        } catch {
          /* swallow — audit is best-effort */
        }
      }
    } catch {
      setState({ status: "error", result: null, reason: "http" });
    } finally {
      inflight.current = false;
    }
  }, [
    enabled,
    packet,
    opts.invoke,
    opts.growId,
    opts.tentId,
    opts.plantId,
    opts.sensorClassification,
    opts.persist,
  ]);

  const start = useCallback(() => {
    void run();
  }, [run]);
  const retry = useCallback(() => {
    void run();
  }, [run]);

  return { ...state, start, retry, canStart };
}
