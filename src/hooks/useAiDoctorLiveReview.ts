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
 *  - Persistence remains non-blocking for the displayed review, but save
 *    state is explicit. A failed history save can be retried without a
 *    second model call or another AI credit.
 */
import { useCallback, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { AiDoctorReviewRequestPacket } from "@/lib/aiDoctorReviewRequestPacket";
import {
  buildAiDoctorReviewRequestEnvelope,
  createAiDoctorReviewIdempotencyKey,
  newAiDoctorReviewIdempotencyKey,
  type AiDoctorReviewRequestEnvelope,
} from "@/lib/aiDoctorReviewRequestTransportRules";
import {
  adaptCreditedAiResponse,
  type AiCreditedFailureReason,
} from "@/lib/aiCreditedResponseAdapter";
import { validateAiDoctorReviewResult } from "@/lib/aiDoctorReviewResultContract";
import type { AiDoctorReviewResult } from "@/lib/aiDoctorReviewResultContract";
import type { Classification } from "@/lib/sensorSnapshotStatusContract";
import type { AiCreditDenial } from "@/lib/aiCreditLimitNoticeViewModel";
import type { AiCreditRemainingInput } from "@/lib/aiCreditRemainingBadgeViewModel";
import {
  newAiDoctorSessionId,
  persistAiDoctorSession,
  type AiDoctorSessionInput,
  type PersistAiDoctorSessionResult,
} from "@/lib/aiDoctorSessionPersistence";
import type { AiDoctorSessionPersistenceFailureDiagnostic } from "@/lib/aiDoctorSessionPersistenceFailureRules";
import { buildAiDoctorSessionPersistenceFailureDiagnostic } from "@/lib/aiDoctorSessionPersistenceFailureRules";
import {
  adaptAiDoctorReviewResultToDiagnosis,
  AI_DOCTOR_REVIEW_CONFIDENCE_SCORE,
} from "@/lib/aiDoctorReviewHistoryRules";
import { shouldReuseAiDoctorReviewIdempotencyKeyAfterResponse } from "@/lib/aiDoctorLiveReviewRecoveryRules";

export type AiDoctorLiveReviewStatus = "idle" | "loading" | "result" | "error";

export type AiDoctorLiveReviewPersistenceState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved"; sessionId: string }
  | { status: "failed"; diagnostic: AiDoctorSessionPersistenceFailureDiagnostic }
  | { status: "skipped"; reason: "missing_grow_scope" };

export interface AiDoctorLiveReviewState {
  status: AiDoctorLiveReviewStatus;
  result: AiDoctorReviewResult | null;
  reason: AiCreditedFailureReason | null;
  /** Only populated when reason === 'credit_denied'. */
  credit?: AiCreditDenial;
  /** Only populated on successful runs when the server returned a credit payload. */
  creditRemaining?: AiCreditRemainingInput;
  /** Independent history-save lifecycle; never hides a validated result. */
  persistence: AiDoctorLiveReviewPersistenceState;
}

export interface UseAiDoctorLiveReviewOptions {
  /** Hook is inert until a packet is provided AND `enabled` is true. */
  enabled: boolean;
  packet: AiDoctorReviewRequestPacket | null;
  /** Override for tests — defaults to supabase.functions.invoke. */
  invoke?: (
    name: string,
    init: { body: AiDoctorReviewRequestEnvelope<AiDoctorReviewRequestPacket> },
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
  persist?: (input: AiDoctorSessionInput) => Promise<PersistAiDoctorSessionResult>;
  /** Called after durable persistence, even if the initiating component unmounts. */
  onPersisted?: (sessionId: string) => void;
  /** Deterministic test seam for the stable logical-session UUID. */
  createSessionId?: () => string;
  /** Deterministic test seam for the per-logical-request replay UUID. */
  createRequestIdempotencyKey?: () => string;
  /** Deterministic test seam for the frozen evidence-evaluation timestamp. */
  now?: () => Date;
}

export interface UseAiDoctorLiveReviewApi extends AiDoctorLiveReviewState {
  start: () => void;
  retry: () => void;
  /** Retries only the saved-session insert; never invokes AI or spends a credit. */
  retrySave: () => void;
  canStart: boolean;
  canRetrySave: boolean;
}

const INITIAL: AiDoctorLiveReviewState = {
  status: "idle",
  result: null,
  reason: null,
  persistence: { status: "idle" },
};

interface FrozenAiDoctorLiveReviewRequest {
  idempotencyKey: string;
  packet: AiDoctorReviewRequestPacket;
  growId: string | null;
  tentId: string | null;
  plantId: string | null;
  sensorClassification: Classification | null;
  sensorEvidenceEvaluatedAt: string | null;
  sensorEvidenceTimestampError: unknown;
}

function scopeFromInput(input: AiDoctorSessionInput) {
  return {
    hasGrowScope: typeof input.growId === "string" && input.growId.length > 0,
    hasTentScope: typeof input.tentId === "string" && input.tentId.length > 0,
    hasPlantScope: typeof input.plantId === "string" && input.plantId.length > 0,
  };
}

export function useAiDoctorLiveReview(
  opts: UseAiDoctorLiveReviewOptions,
): UseAiDoctorLiveReviewApi {
  const {
    enabled,
    packet,
    invoke: invokeOverride,
    growId,
    tentId,
    plantId,
    sensorClassification,
    persist: persistOverride,
    onPersisted,
    createSessionId,
    createRequestIdempotencyKey,
    now,
  } = opts;
  const [state, setState] = useState<AiDoctorLiveReviewState>(INITIAL);
  const inflight = useRef(false);
  const logicalRequest = useRef<FrozenAiDoctorLiveReviewRequest | null>(null);
  const persistenceInflight = useRef(false);
  const retryPersistenceInput = useRef<AiDoctorSessionInput | null>(null);

  const canStart = enabled && packet != null && !inflight.current;

  const saveToHistory = useCallback(
    async (input: AiDoctorSessionInput) => {
      if (persistenceInflight.current) return;
      persistenceInflight.current = true;
      setState((current) =>
        current.status === "result" ? { ...current, persistence: { status: "saving" } } : current,
      );

      const persist =
        persistOverride ??
        ((value: AiDoctorSessionInput) => persistAiDoctorSession(supabase, value));

      try {
        const saved = await persist(input);
        if (saved.ok === true) {
          retryPersistenceInput.current = null;
          // Cache refresh is best-effort and must never turn an already
          // durable row into a retryable failure. The callback executes from
          // this async lifecycle rather than a mount-dependent effect.
          try {
            onPersisted?.(saved.id);
          } catch {
            // The session is still saved; consumers may refresh on remount.
          }
          setState((current) =>
            current.status === "result"
              ? {
                  ...current,
                  persistence: { status: "saved", sessionId: saved.id },
                }
              : current,
          );
          return;
        }

        retryPersistenceInput.current = input;
        setState((current) =>
          current.status === "result"
            ? {
                ...current,
                persistence: { status: "failed", diagnostic: saved.diagnostic },
              }
            : current,
        );
      } catch (error) {
        retryPersistenceInput.current = input;
        const diagnostic = buildAiDoctorSessionPersistenceFailureDiagnostic({
          stage: "unexpected",
          error: error instanceof Error ? error : { message: "unknown" },
          authResolution: "unavailable",
          scope: scopeFromInput(input),
          fallbackMessage: "history_save_failed",
        });
        setState((current) =>
          current.status === "result"
            ? { ...current, persistence: { status: "failed", diagnostic } }
            : current,
        );
      } finally {
        persistenceInflight.current = false;
      }
    },
    [onPersisted, persistOverride],
  );

  const run = useCallback(
    async (requestKind: "start" | "retry") => {
      if (!enabled) return;
      if (inflight.current) return;
      inflight.current = true;
      retryPersistenceInput.current = null;

      // `start` always begins a new logical request. A retained retry reuses
      // the entire click-time request, not merely its UUID, so background
      // rerenders can never pair an old spend identity with a new packet,
      // scope, evidence classification, or evaluation time.
      if (requestKind === "start") logicalRequest.current = null;
      if (logicalRequest.current === null) {
        if (packet == null) {
          inflight.current = false;
          return;
        }
        const created = createAiDoctorReviewIdempotencyKey(
          createRequestIdempotencyKey ?? newAiDoctorReviewIdempotencyKey,
        );
        if (created.ok === false) {
          setState({
            status: "error",
            result: null,
            reason: "invalid",
            persistence: { status: "idle" },
          });
          inflight.current = false;
          return;
        }

        let sensorEvidenceEvaluatedAt: string | null = null;
        let sensorEvidenceTimestampError: unknown = null;
        if (sensorClassification) {
          try {
            sensorEvidenceEvaluatedAt = (now?.() ?? new Date()).toISOString();
          } catch (error) {
            sensorEvidenceTimestampError = error;
          }
        }

        logicalRequest.current = {
          idempotencyKey: created.key,
          packet,
          growId: growId ?? null,
          tentId: tentId ?? null,
          plantId: plantId ?? null,
          sensorClassification: sensorClassification ?? null,
          sensorEvidenceEvaluatedAt,
          sensorEvidenceTimestampError,
        };
      }

      const request = logicalRequest.current;
      if (request === null) {
        inflight.current = false;
        return;
      }

      const builtRequest = buildAiDoctorReviewRequestEnvelope(
        request.packet,
        request.growId,
        request.idempotencyKey,
      );
      if (builtRequest.ok === false) {
        logicalRequest.current = null;
        setState({
          status: "error",
          result: null,
          reason: "invalid",
          persistence: { status: "idle" },
        });
        inflight.current = false;
        return;
      }

      setState({ status: "loading", result: null, reason: null, persistence: { status: "idle" } });

      const invoke =
        invokeOverride ??
        ((name, init) =>
          supabase.functions.invoke(name, init) as Promise<{
            data: unknown;
            error: unknown;
          }>);

      try {
        const { data, error } = await invoke("ai-doctor-review", {
          // Grow scope stays outside the model context packet. The Edge Function
          // validates ownership before spending a Free per-grow credit.
          body: builtRequest.envelope,
        });
        if (error) {
          // The request may have reached the Edge Function. Preserve the UUID so
          // a grower retry asks the server for the same spend/result.
          setState({
            status: "error",
            result: null,
            reason: "http",
            persistence: { status: "idle" },
          });
          return;
        }
        const outcome = adaptCreditedAiResponse(data, validateAiDoctorReviewResult);
        if (outcome.ok === false) {
          if (!shouldReuseAiDoctorReviewIdempotencyKeyAfterResponse(data, outcome.reason)) {
            logicalRequest.current = null;
          }
          setState({
            status: "error",
            result: null,
            reason: outcome.reason,
            credit:
              outcome.reason === "credit_denied" || outcome.reason === "upstream_credit_exhausted"
                ? outcome.credit
                : undefined,
            persistence: { status: "idle" },
          });
          return;
        }

        // A validated response is complete. Retire its replay identity before
        // any independent history persistence work begins.
        logicalRequest.current = null;

        setState({
          status: "result",
          result: outcome.result,
          reason: null,
          creditRemaining: outcome.credit,
          persistence: request.growId
            ? { status: "saving" }
            : { status: "skipped", reason: "missing_grow_scope" },
        });

        // Audit-trail: explicit successful run only. The displayed review does
        // not depend on this insert, and a failed insert can be retried alone.
        // Skipped when there is no scope (growId is required for an
        // ownership-checked insert under existing RLS).
        if (request.growId) {
          try {
            if (request.sensorEvidenceTimestampError) {
              throw request.sensorEvidenceTimestampError;
            }
            const diagnosisReport = adaptAiDoctorReviewResultToDiagnosis(outcome.result);
            const confidenceScore = AI_DOCTOR_REVIEW_CONFIDENCE_SCORE[outcome.result.confidence];
            const persistenceInput: AiDoctorSessionInput = {
              sessionId: createSessionId?.() ?? newAiDoctorSessionId(),
              growId: request.growId,
              tentId: request.tentId,
              plantId: request.plantId,
              analysis: outcome.result,
              diagnosis: diagnosisReport.diagnosis,
              rawConfidence: confidenceScore,
              displayedConfidence: confidenceScore,
              sensorEvidence: request.sensorClassification,
              // Freeze this once per logical review. Manual save retries reuse
              // the same input object, so history cannot drift to retry time.
              sensorEvidenceEvaluatedAt: request.sensorEvidenceEvaluatedAt,
            };
            await saveToHistory(persistenceInput);
          } catch (error) {
            const diagnostic = buildAiDoctorSessionPersistenceFailureDiagnostic({
              stage: "unexpected",
              error: error instanceof Error ? error : { message: "unknown" },
              authResolution: "unavailable",
              scope: {
                hasGrowScope: true,
                hasTentScope: Boolean(request.tentId),
                hasPlantScope: Boolean(request.plantId),
              },
              fallbackMessage: "history_save_preparation_failed",
            });
            setState((current) =>
              current.status === "result"
                ? { ...current, persistence: { status: "failed", diagnostic } }
                : current,
            );
          }
        }
      } catch {
        // A thrown invoke is transport-ambiguous for the same reason as an
        // invoke `{ error }`: replay must retain the current UUID.
        setState({
          status: "error",
          result: null,
          reason: "http",
          persistence: { status: "idle" },
        });
      } finally {
        inflight.current = false;
      }
    },
    [
      enabled,
      packet,
      invokeOverride,
      growId,
      tentId,
      plantId,
      sensorClassification,
      createSessionId,
      createRequestIdempotencyKey,
      now,
      saveToHistory,
    ],
  );

  const start = useCallback(() => {
    void run("start");
  }, [run]);
  const retry = useCallback(() => {
    void run("retry");
  }, [run]);

  const retrySave = useCallback(() => {
    const input = retryPersistenceInput.current;
    if (!input || persistenceInflight.current) return;
    void saveToHistory(input);
  }, [saveToHistory]);

  return {
    ...state,
    start,
    retry,
    retrySave,
    canStart,
    canRetrySave: state.persistence.status === "failed" && retryPersistenceInput.current !== null,
  };
}
