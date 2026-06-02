/**
 * useAiDoctorLiveReview — grower-initiated request lifecycle for the
 * server-side AI Doctor review endpoint.
 *
 * Hard constraints:
 *  - No auto-fire, no auto-retry, no polling. Manual `start()` / `retry()`.
 *  - Never writes DB rows. Never persists sessions, alerts, action queue,
 *    or sensor readings.
 *  - Server response is always re-validated client-side via the adapter;
 *    raw model text is never rendered.
 *  - Never logs raw responses, packets, secrets, or unvalidated AI output.
 */
import { useCallback, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { AiDoctorReviewRequestPacket } from "@/lib/aiDoctorReviewRequestPacket";
import {
  adaptAiDoctorReviewResponse,
  type AiDoctorLiveReviewFailureReason,
} from "@/lib/aiDoctorReviewResponseAdapter";
import type { AiDoctorReviewResult } from "@/lib/aiDoctorReviewResultContract";

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
    } catch {
      setState({ status: "error", result: null, reason: "http" });
    } finally {
      inflight.current = false;
    }
  }, [enabled, packet, opts.invoke]);

  const start = useCallback(() => {
    void run();
  }, [run]);
  const retry = useCallback(() => {
    void run();
  }, [run]);

  return { ...state, start, retry, canStart };
}
