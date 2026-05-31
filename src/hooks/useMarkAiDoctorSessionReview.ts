/**
 * Mutation hook: append a review event for an AI Doctor session.
 *
 * Inserts exactly one row into `public.ai_doctor_session_reviews`. The table is
 * append-only (no UPDATE / DELETE policy for authenticated users); this hook
 * mirrors that — it never updates, upserts, or deletes.
 *
 * Safety envelope:
 *   - INSERT-only into the review-events table.
 *   - No edge function invocation.
 *   - No privileged keys.
 *   - No writes to any other table.
 *   - No AI calls.
 *   - No automation / device-control side effects.
 *   - user_id is NOT sent from the client — the DB column default and the
 *     row-level policy own ownership via auth.uid().
 *
 * Optimistic cache strategy:
 *   - onMutate: cancel in-flight review queries, snapshot prior cache values,
 *     and prepend a temporary event to every relevant
 *     `["ai_doctor_session_reviews", scope]` cache entry. Projection is
 *     recomputed via the existing pure helper so callers see the new status
 *     immediately.
 *   - onError: restore the snapshotted values.
 *   - onSettled: invalidate review-event queries so server truth wins.
 */
import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  projectLatestReviewStateBySession,
  type AiDoctorSessionReviewEvent,
  type AiDoctorSessionReviewEventType,
} from "@/lib/aiDoctorSessionReviewStatusRules";
import type { UseAiDoctorSessionReviewsResult } from "@/hooks/useAiDoctorSessionReviews";

/** Allowed event types — narrower than the DB to keep the client honest. */
export const ALLOWED_REVIEW_EVENT_TYPES: ReadonlySet<AiDoctorSessionReviewEventType> =
  new Set(["marked_reviewed", "needs_follow_up", "cleared"]);

export const REVIEW_NOTE_MAX_LENGTH = 1000;

/** Prefix used to mark optimistic, not-yet-persisted events in the cache. */
export const OPTIMISTIC_REVIEW_EVENT_ID_PREFIX = "optimistic:";

export interface MarkAiDoctorSessionReviewInput {
  sessionId: string;
  eventType: AiDoctorSessionReviewEventType;
  note?: string | null;
}

export interface ReviewInsertPayload {
  session_id: string;
  event_type: AiDoctorSessionReviewEventType;
  note?: string | null;
}

/**
 * Trim → empty-omit → 1000-char cap. Pure helper, exported for tests.
 * Returns `null` to indicate "omit note" (do not send the column at all).
 */
export function normalizeReviewNote(note: string | null | undefined): string | null {
  if (typeof note !== "string") return null;
  const trimmed = note.trim();
  if (trimmed.length === 0) return null;
  return trimmed.length > REVIEW_NOTE_MAX_LENGTH
    ? trimmed.slice(0, REVIEW_NOTE_MAX_LENGTH)
    : trimmed;
}

/**
 * Build the insert payload. Pure helper, exported for tests. Throws on invalid
 * inputs so the mutation never sends a malformed row.
 */
export function buildReviewInsertPayload(
  input: MarkAiDoctorSessionReviewInput,
): ReviewInsertPayload {
  if (!input || typeof input.sessionId !== "string" || input.sessionId.length === 0) {
    throw new Error("sessionId is required");
  }
  if (!ALLOWED_REVIEW_EVENT_TYPES.has(input.eventType)) {
    throw new Error(`invalid event_type: ${String(input.eventType)}`);
  }
  const note = normalizeReviewNote(input.note);
  const payload: ReviewInsertPayload = {
    session_id: input.sessionId,
    event_type: input.eventType,
  };
  if (note !== null) payload.note = note;
  return payload;
}

/**
 * Build a temporary, client-only review event used to update caches
 * optimistically. The placeholder user_id ("") satisfies the event type but is
 * never sent to the server — see `buildReviewInsertPayload`. Pure helper,
 * exported for tests.
 */
export function buildOptimisticReviewEvent(
  input: MarkAiDoctorSessionReviewInput,
  now: Date = new Date(),
): AiDoctorSessionReviewEvent {
  if (!input || typeof input.sessionId !== "string" || input.sessionId.length === 0) {
    throw new Error("sessionId is required");
  }
  if (!ALLOWED_REVIEW_EVENT_TYPES.has(input.eventType)) {
    throw new Error(`invalid event_type: ${String(input.eventType)}`);
  }
  return {
    id: `${OPTIMISTIC_REVIEW_EVENT_ID_PREFIX}${now.getTime()}-${Math.random()
      .toString(36)
      .slice(2, 10)}`,
    user_id: "", // placeholder — server assigns real user_id via auth.uid()
    session_id: input.sessionId,
    event_type: input.eventType,
    note: normalizeReviewNote(input.note),
    created_at: now.toISOString(),
  };
}

/** True when a cached query's scope tuple includes the target session. */
function scopeMatchesSession(scope: unknown, sessionId: string): boolean {
  if (scope === null || scope === undefined) return true; // broad scope
  if (Array.isArray(scope)) return scope.includes(sessionId);
  return false;
}

interface OptimisticContext {
  snapshots: Array<{
    queryKey: QueryKey;
    previous: UseAiDoctorSessionReviewsResult | undefined;
  }>;
}

export function useMarkAiDoctorSessionReview() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, MarkAiDoctorSessionReviewInput, OptimisticContext>({
    mutationFn: async (input): Promise<void> => {
      const payload = buildReviewInsertPayload(input);
      const { error } = await supabase
        .from("ai_doctor_session_reviews" as never)
        .insert(payload as never);
      if (error) throw error;
    },
    onMutate: async (input) => {
      // Halt any in-flight review fetches so they don't overwrite our optimistic state.
      await queryClient.cancelQueries({ queryKey: ["ai_doctor_session_reviews"] });

      const optimisticEvent = buildOptimisticReviewEvent(input);
      const snapshots: OptimisticContext["snapshots"] = [];

      const entries = queryClient.getQueriesData<UseAiDoctorSessionReviewsResult>({
        queryKey: ["ai_doctor_session_reviews"],
      });

      for (const [queryKey, previous] of entries) {
        const scope = Array.isArray(queryKey) ? queryKey[1] : undefined;
        if (!scopeMatchesSession(scope, input.sessionId)) continue;

        snapshots.push({ queryKey, previous });

        const prevEvents = previous?.events ?? [];
        const nextEvents = [optimisticEvent, ...prevEvents];
        queryClient.setQueryData<UseAiDoctorSessionReviewsResult>(queryKey, {
          events: nextEvents,
          stateBySession: projectLatestReviewStateBySession(nextEvents),
        });
      }

      return { snapshots };
    },
    onError: (_err, _input, context) => {
      // Rollback every cache we touched.
      if (!context) return;
      for (const { queryKey, previous } of context.snapshots) {
        queryClient.setQueryData(queryKey, previous);
      }
    },
    onSettled: () => {
      // Reconcile with server truth regardless of success/failure.
      queryClient.invalidateQueries({ queryKey: ["ai_doctor_session_reviews"] });
    },
  });
}
