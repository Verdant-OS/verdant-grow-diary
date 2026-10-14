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
    .limit(limit);
  if (error) throw error;
  return parseTentManualEnvironmentEvents((data ?? []) as TentManualEnvEventRow[]);
}

/**
 * Quick Log manual readings for this tent. They live only in grow_events +
 * environment_events, never in sensor_readings, so the tent page reads them
 * separately and merges them into its manual snapshot history. A failed
 * read leaves the sensor rows exactly as before.
 */
export function useTentManualEnvironmentEvents(
  tentId: string | null | undefined,
): UseQueryResult<TentManualEnvironmentEvent[]> {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["tent-manual-environment-events", tentId ?? "none", user?.id ?? "anon"],
    enabled: !!tentId,
    queryFn: () => fetchTentManualEnvironmentEvents(tentId as string),
  });
}
