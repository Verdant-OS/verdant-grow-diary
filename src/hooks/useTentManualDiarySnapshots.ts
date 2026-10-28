import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useAuth } from "@/store/auth";
import { fetchTentManualSnapshotRows } from "@/hooks/useManualSnapshotTimelineCards";
import { TENT_MANUAL_ENVIRONMENT_EVENTS_QUERY_KEY_PREFIX } from "@/hooks/useTentManualEnvironmentEvents";
import {
  TENT_MANUAL_ENV_EVENT_LIMIT,
  type TentManualHistoryDiaryRow,
} from "@/lib/tentManualEnvironmentEventRules";

/**
 * Quick Log diary snapshots for this tent. A pH- or EC-only Plant Quick Log
 * writes only here (no environment grow_event), so the tent's manual history
 * reads it too. Shares the "grow_events" key prefix, so the frozen Quick Log
 * post-save refresh refetches it without a second refresh path.
 */
export function useTentManualDiarySnapshots(
  tentId: string | null | undefined,
): UseQueryResult<TentManualHistoryDiaryRow[]> {
  const { user } = useAuth();
  return useQuery({
    queryKey: [
      ...TENT_MANUAL_ENVIRONMENT_EVENTS_QUERY_KEY_PREFIX,
      "diary",
      tentId ?? "none",
      user?.id ?? "anon",
    ],
    enabled: !!tentId,
    queryFn: () => fetchTentManualSnapshotRows(tentId as string, TENT_MANUAL_ENV_EVENT_LIMIT),
  });
}
