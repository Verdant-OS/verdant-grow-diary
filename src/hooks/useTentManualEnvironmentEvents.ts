import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useAuth } from "@/store/auth";
import { supabase } from "@/integrations/supabase/client";
import {
  TENT_MANUAL_ENV_EVENT_LIMIT,
  TENT_MANUAL_ENV_EVENT_SELECT,
  TENT_MANUAL_ENV_EVENT_SOURCE,
  parseTentManualEnvironmentEvents,
  type TentManualEnvEventRow,
  type TentManualEnvironmentEvent,
} from "@/lib/tentManualEnvironmentEventRules";

/** SELECT only: Quick Log V2 manual snapshots (tent- and plant-level) for one tent. */
export async function fetchTentManualEnvironmentEvents(
  tentId: string,
  limit: number = TENT_MANUAL_ENV_EVENT_LIMIT,
): Promise<TentManualEnvironmentEvent[]> {
  const { data, error } = await supabase
    .from("grow_events")
    .select(TENT_MANUAL_ENV_EVENT_SELECT)
    .eq("tent_id", tentId)
    .eq("source", TENT_MANUAL_ENV_EVENT_SOURCE)
    .eq("is_deleted", false)
    .eq("event_type", "environment")
    .order("occurred_at", { ascending: false })
    // occurred_at is not unique (backdated Quick Logs can share a time), so
    // a unique final key keeps the limited subset deterministic.
    .order("id", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return parseTentManualEnvironmentEvents((data ?? []) as TentManualEnvEventRow[]);
}

export const TENT_MANUAL_ENVIRONMENT_EVENTS_QUERY_KEY_PREFIX = [
  "grow_events",
  "tent-manual-environment-events",
] as const;

/**
 * Quick Log manual readings for this tent. They live only in grow_events +
 * environment_events, never in sensor_readings, so the tent page reads them
 * separately and merges them into its manual snapshot history. A failed
 * read is not hidden: `buildTentManualHistoryRead` marks the whole merged
 * history as an error, so a partial history never reads as complete.
 */
export function useTentManualEnvironmentEvents(
  tentId: string | null | undefined,
): UseQueryResult<TentManualEnvironmentEvent[]> {
  const { user } = useAuth();
  return useQuery({
    // Prefixed with "grow_events" so the frozen Quick Log post-save refresh
    // (applyQuickLogV2Refresh, which always invalidates ["grow_events"])
    // refetches this read without a second refresh path.
    queryKey: [
      ...TENT_MANUAL_ENVIRONMENT_EVENTS_QUERY_KEY_PREFIX,
      tentId ?? "none",
      user?.id ?? "anon",
    ],
    enabled: !!tentId,
    queryFn: () => fetchTentManualEnvironmentEvents(tentId as string),
  });
}
