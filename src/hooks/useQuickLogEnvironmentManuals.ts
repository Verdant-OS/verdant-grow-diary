/**
 * useQuickLogEnvironmentManuals — Quick Log whole-tent snapshots for a set of
 * tents, for `useLatestSensorSnapshotsByTent` (#2821), which merges them into
 * each tent's snapshot with `LatestSnapshotQuickLogMerge` (newest capture wins).
 *
 * SELECT only, from `grow_events` + `environment_events`; no `diary_entries`
 * read, so the snapshot read's own sensor and diary reads are unchanged. Each
 * tent shares the cache entry `useSensorsQuickLogManualReadings` uses for that
 * tent's events, and the key keeps the `grow_events` prefix so a Quick Log save
 * (`applyQuickLogV2Refresh`) refetches it without a second refresh path. A
 * failed read contributes nothing: the base snapshot stays as it was.
 */
import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { useAuth } from "@/store/auth";
import { useNowTick } from "@/hooks/useNowTick";
import {
  buildSensorsQuickLogManualReadingsQueryKey,
  fetchManualEvents,
} from "@/hooks/useSensorsQuickLogManualReadings";
import { isUuid } from "@/lib/isUuid";
import { collectSensorsQuickLogManualReadings } from "@/lib/sensorsQuickLogManualSeriesRules";
import type { SensorReading } from "@/mock";

export function useQuickLogEnvironmentManuals(tentIds: readonly string[]): {
  data: SensorReading[];
} {
  const { user } = useAuth();
  const nowMs = useNowTick();
  const ids = useMemo(() => [...new Set(tentIds.filter((id) => isUuid(id)))].sort(), [tentIds]);
  const results = useQueries({
    queries: ids.map((tentId) => ({
      queryKey: [
        ...buildSensorsQuickLogManualReadingsQueryKey(tentId),
        user?.id ?? "anon",
        "events",
      ],
      enabled: Boolean(user),
      retry: false,
      queryFn: () => fetchManualEvents(tentId),
    })),
  });
  const dataKey = results.map((result) => result.dataUpdatedAt).join("|");
  const data = useMemo(
    () =>
      ids.flatMap((tentId, index) =>
        collectSensorsQuickLogManualReadings({
          tentId,
          growEvents: results[index]?.data,
          now: new Date(nowMs),
        }),
      ),
    // `results` is a fresh array each render; its data timestamps are the real inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ids, dataKey, nowMs],
  );
  return { data };
}
