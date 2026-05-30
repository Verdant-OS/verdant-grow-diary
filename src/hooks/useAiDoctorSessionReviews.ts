/**
 * Read-only hook: AI Doctor session review events.
 *
 * Queries `public.ai_doctor_session_reviews` and returns the raw events plus a
 * latest-status projection map keyed by `session_id`, computed by the pure
 * helpers in `aiDoctorSessionReviewStatusRules`.
 *
 * Safety envelope:
 *   - SELECT-only. No insert/update/upsert/delete.
 *   - No edge function invocation.
 *   - No service_role; relies on RLS + the standard authenticated client.
 *   - No writes to action_queue / alerts / tasks.
 *   - No AI calls. No device-control paths.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  projectLatestReviewStateBySession,
  type AiDoctorSessionReviewEvent,
  type AiDoctorSessionReviewState,
} from "@/lib/aiDoctorSessionReviewStatusRules";

const REVIEW_SELECT =
  "id,user_id,session_id,event_type,note,created_at";

export const AI_DOCTOR_SESSION_REVIEWS_MAX_ROWS = 1000;

export interface UseAiDoctorSessionReviewsResult {
  events: AiDoctorSessionReviewEvent[];
  stateBySession: Map<string, AiDoctorSessionReviewState>;
}

/**
 * Normalize the optional session_id scoping input into a stable, sorted key
 * so callers passing the same logical scope in different orders share cache.
 * Returns:
 *   - `null` → fetch all review events for the current user (broad scope).
 *   - `string[]` → fetch only events for those session IDs (narrow scope).
 *     An empty array disables the query entirely (nothing to fetch).
 */
function normalizeSessionIds(
  sessionIds: ReadonlyArray<string> | null | undefined,
): string[] | null {
  if (sessionIds === null || sessionIds === undefined) return null;
  if (!Array.isArray(sessionIds)) return [];
  const cleaned = sessionIds.filter(
    (id): id is string => typeof id === "string" && id.length > 0,
  );
  // De-dupe + sort for a stable query key.
  return Array.from(new Set(cleaned)).sort();
}

export function useAiDoctorSessionReviews(
  sessionIds?: ReadonlyArray<string> | null,
) {
  const scope = normalizeSessionIds(sessionIds);
  // Empty array means caller explicitly scoped to no sessions → skip the fetch.
  const enabled = scope === null || scope.length > 0;

  return useQuery({
    queryKey: ["ai_doctor_session_reviews", scope],
    enabled,
    queryFn: async (): Promise<UseAiDoctorSessionReviewsResult> => {
      let q = supabase
        .from("ai_doctor_session_reviews" as never)
        .select(REVIEW_SELECT);

      if (scope !== null) {
        q = q.in("session_id", scope);
      }

      const { data, error } = await q
        .order("created_at", { ascending: true })
        .limit(AI_DOCTOR_SESSION_REVIEWS_MAX_ROWS);

      if (error) throw error;

      const events = (data ?? []) as AiDoctorSessionReviewEvent[];
      const stateBySession = projectLatestReviewStateBySession(events);
      return { events, stateBySession };
    },
  });
}
