/**
 * Idempotent mutation hooks for the Genetics Library.
 *
 * The core is useIdempotentAction: it mints ONE idempotency key per user
 * submission and holds the attempt so an explicit retry() reuses the SAME key.
 * The server's (user, operation, key) ledger then collapses a retried write to
 * its original result — a retry can never duplicate an assignment or evidence
 * row. There is no auto-retry (that would risk a fresh key on a landed write).
 */
import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/store/auth";
import {
  newIdempotencyKey,
  upsertAccession,
  archiveAccession,
  upsertBatch,
  assignPlants,
  recordScreening,
  openQuarantine,
  transitionQuarantine,
  type MutationResult,
} from "@/lib/genetics/traceabilityApi";

export type SaveStatus = "idle" | "pending" | "saved" | "failed";

export interface IdempotentAction<TInput> {
  readonly status: SaveStatus;
  readonly error: string | null;
  readonly submit: (input: TInput) => Promise<MutationResult>;
  readonly retry: () => Promise<MutationResult>;
  readonly reset: () => void;
}

function useIdempotentAction<TInput>(
  fn: (input: TInput, key: string) => Promise<MutationResult>,
  onSaved: () => void,
): IdempotentAction<TInput> {
  const attemptRef = useRef<{ key: string; input: TInput } | null>(null);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (attempt: { key: string; input: TInput }): Promise<MutationResult> => {
      setStatus("pending");
      setError(null);
      let res: MutationResult;
      try {
        res = await fn(attempt.input, attempt.key);
      } catch (e) {
        res = { ok: false, error: e instanceof Error ? e.message : "request_failed" };
      }
      if (res.ok === true) {
        attemptRef.current = null;
        setStatus("saved");
        onSaved();
      } else {
        setStatus("failed");
        setError(res.error);
      }
      return res;
    },
    [fn, onSaved],
  );

  const submit = useCallback(
    (input: TInput) => {
      const attempt = { key: newIdempotencyKey(), input };
      attemptRef.current = attempt;
      return run(attempt);
    },
    [run],
  );

  const retry = useCallback(() => {
    if (!attemptRef.current) {
      return Promise.resolve<MutationResult>({ ok: false, error: "nothing_to_retry" });
    }
    // Reuses the stored key → server dedupes; no duplicate write.
    return run(attemptRef.current);
  }, [run]);

  const reset = useCallback(() => {
    attemptRef.current = null;
    setStatus("idle");
    setError(null);
  }, []);

  return { status, error, submit, retry, reset };
}

function useInvalidateGenetics() {
  const qc = useQueryClient();
  const ownerId = useAuth().user?.id ?? null;
  return useCallback(() => {
    // Invalidate the whole owner-scoped genetics namespace; keys are prefixed
    // ["genetics", ...] so a single predicate covers lists, trace, and evidence.
    void qc.invalidateQueries({
      predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === "genetics" && q.queryKey.includes(ownerId ?? "anon"),
    });
  }, [qc, ownerId]);
}

export function useUpsertAccession() {
  const invalidate = useInvalidateGenetics();
  return useIdempotentAction<Record<string, unknown>>(
    (payload, key) => upsertAccession(payload, key),
    invalidate,
  );
}

export function useArchiveAccession() {
  const invalidate = useInvalidateGenetics();
  return useIdempotentAction<{ accessionId: string; archived: boolean }>(
    ({ accessionId, archived }, key) => archiveAccession(accessionId, archived, key),
    invalidate,
  );
}

export function useUpsertBatch() {
  const invalidate = useInvalidateGenetics();
  return useIdempotentAction<Record<string, unknown>>(
    (payload, key) => upsertBatch(payload, key),
    invalidate,
  );
}

export function useAssignPlants() {
  const invalidate = useInvalidateGenetics();
  return useIdempotentAction<{ batchId: string; plantIds: readonly string[]; reason: string | null }>(
    ({ batchId, plantIds, reason }, key) => assignPlants(batchId, plantIds, reason, key),
    invalidate,
  );
}

export function useRecordScreening() {
  const invalidate = useInvalidateGenetics();
  return useIdempotentAction<Record<string, unknown>>(
    (payload, key) => recordScreening(payload, key),
    invalidate,
  );
}

export function useOpenQuarantine() {
  const invalidate = useInvalidateGenetics();
  return useIdempotentAction<Record<string, unknown>>(
    (payload, key) => openQuarantine(payload, key),
    invalidate,
  );
}

export function useTransitionQuarantine() {
  const invalidate = useInvalidateGenetics();
  return useIdempotentAction<{
    episodeId: string;
    action: string;
    reason: string | null;
    screeningResultId: string | null;
  }>(
    ({ episodeId, action, reason, screeningResultId }, key) =>
      transitionQuarantine(episodeId, action, reason, screeningResultId, key),
    invalidate,
  );
}
