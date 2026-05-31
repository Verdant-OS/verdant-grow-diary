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
 * On success, the existing review-events query cache is invalidated so the
 * panel and chips re-fetch from server truth.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { AiDoctorSessionReviewEventType } from "@/lib/aiDoctorSessionReviewStatusRules";

/** Allowed event types — narrower than the DB to keep the client honest. */
export const ALLOWED_REVIEW_EVENT_TYPES: ReadonlySet<AiDoctorSessionReviewEventType> =
  new Set(["marked_reviewed", "needs_follow_up", "cleared"]);

export const REVIEW_NOTE_MAX_LENGTH = 1000;

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

export function useMarkAiDoctorSessionReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: MarkAiDoctorSessionReviewInput): Promise<void> => {
      const payload = buildReviewInsertPayload(input);
      const { error } = await supabase
        .from("ai_doctor_session_reviews" as never)
        .insert(payload as never);
      if (error) throw error;
    },
    onSuccess: () => {
      // Invalidate every scoped variant of the reviews query.
      queryClient.invalidateQueries({ queryKey: ["ai_doctor_session_reviews"] });
    },
  });
}
