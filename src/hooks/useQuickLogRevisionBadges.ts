/**
 * useQuickLogRevisionBadges — best-effort "edited" badge data for Quick Log
 * surfaces (issue #786).
 *
 * Safety contract:
 *  - SELECT-only on public.quicklog_entry_revisions (owner-scoped by RLS).
 *  - Errors resolve to an empty map + status "unavailable": a failed badge
 *    read must never break a timeline surface, and must not look like a
 *    confident empty-success ("truly no edits").
 *  - Empty map + status "ok" means the ledger was readable and had no rows
 *    for these roots (legacy entries without ledger rows stay badge-free).
 *  - No entitlement/plan checks — identical for every plan.
 */
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import {
  buildQuickLogRevisionBadges,
  type QuickLogRevisionBadge,
} from "@/lib/quick-log/quickLogRevisionRules";
import {
  adaptQuickLogRevisionDatabaseRows,
  QUICKLOG_REVISION_TABLE,
} from "@/lib/quickLogRevisionService";

/** Quiet section note when the revision ledger could not be read. */
export const QUICK_LOG_REVISION_BADGES_UNAVAILABLE_NOTE =
  "Edit history is unavailable right now." as const;

export type QuickLogRevisionBadgesStatus = "ok" | "unavailable";

type QuickLogRevisionBadgesQueryResult = {
  badges: Map<string, QuickLogRevisionBadge>;
  status: QuickLogRevisionBadgesStatus;
};

const EMPTY_UNAVAILABLE: QuickLogRevisionBadgesQueryResult = {
  badges: new Map(),
  status: "unavailable",
};

export function buildQuickLogRevisionBadgesQueryKey(rootIds: readonly string[]) {
  return ["quicklog_entry_revisions", "badges", [...rootIds].sort().join(",")] as const;
}

export function useQuickLogRevisionBadges(rootIds: readonly string[]) {
  const ids = rootIds.filter((id) => typeof id === "string" && id.length > 0);
  const query = useQuery({
    queryKey: buildQuickLogRevisionBadgesQueryKey(ids),
    enabled: ids.length > 0,
    staleTime: 30_000,
    queryFn: async (): Promise<QuickLogRevisionBadgesQueryResult> => {
      try {
        const { data, error } = await supabase
          .from(QUICKLOG_REVISION_TABLE)
          .select(
            "id, grow_event_id, diary_entry_id, root_id, user_id, actor_id, revision_no, kind, reason_code, reason_note, previous_state, new_state, created_at",
          )
          .in("root_id", ids)
          .order("revision_no", { ascending: true });
        if (error) return EMPTY_UNAVAILABLE;
        return {
          badges: buildQuickLogRevisionBadges(adaptQuickLogRevisionDatabaseRows(data)),
          status: "ok",
        };
      } catch {
        // Fail-soft: never let a thrown client/network error crash Timeline/Tent/Plant.
        return EMPTY_UNAVAILABLE;
      }
    },
  });

  const resolved = query.data;

  return {
    badges: resolved?.badges ?? new Map<string, QuickLogRevisionBadge>(),
    status: resolved?.status ?? "ok",
    isLoading: query.isLoading,
  };
}
