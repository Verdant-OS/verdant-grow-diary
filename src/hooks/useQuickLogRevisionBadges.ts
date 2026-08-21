/**
 * useQuickLogRevisionBadges — best-effort "edited" badge data for Quick Log
 * surfaces (issue #786).
 *
 * Safety contract:
 *  - SELECT-only on public.quicklog_entry_revisions (owner-scoped by RLS).
 *  - Errors resolve to an empty map: a failed badge read must never break a
 *    timeline surface, and legacy entries without ledger rows stay badge-free.
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

export function buildQuickLogRevisionBadgesQueryKey(rootIds: readonly string[]) {
  return ["quicklog_entry_revisions", "badges", [...rootIds].sort().join(",")] as const;
}

export function useQuickLogRevisionBadges(rootIds: readonly string[]) {
  const ids = rootIds.filter((id) => typeof id === "string" && id.length > 0);
  const query = useQuery({
    queryKey: buildQuickLogRevisionBadgesQueryKey(ids),
    enabled: ids.length > 0,
    staleTime: 30_000,
    queryFn: async (): Promise<Map<string, QuickLogRevisionBadge>> => {
      const { data, error } = await supabase
        .from(QUICKLOG_REVISION_TABLE)
        .select(
          "id, grow_event_id, diary_entry_id, root_id, user_id, actor_id, revision_no, kind, reason_code, reason_note, previous_state, new_state, created_at",
        )
        .in("root_id", ids)
        .order("revision_no", { ascending: true });
      if (error) return new Map();
      return buildQuickLogRevisionBadges(adaptQuickLogRevisionDatabaseRows(data));
    },
  });
  return {
    badges: query.data ?? new Map<string, QuickLogRevisionBadge>(),
    isLoading: query.isLoading,
  };
}
