/**
 * useQuickLogEnvironmentManuals — Quick Log whole-tent snapshots for a set of
 * tents, for `useLatestSensorSnapshotsByTent` (#2821), which merges them into
 * each tent's snapshot per metric with `LatestSnapshotQuickLogMerge`.
 *
 * One batched SELECT for all tents (`.in("tent_id", ids)`), from `grow_events`
 * + `environment_events`; no `diary_entries` read, so the snapshot read's own
 * sensor and diary reads are unchanged. An empty scope (for example only tents
 * without a grow) issues no read at all. The key keeps the `grow_events`
 * prefix, so a Quick Log save (`applyQuickLogV2Refresh` invalidates
 * ["grow_events"]) refetches it without a second refresh path. A failed read
 * contributes nothing: each base snapshot stays as it was.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/store/auth";
import { useNowTick } from "@/hooks/useNowTick";
import {
  buildSensorsQuickLogManualReadingsQueryKey,
  fetchManualEventsForTents,
} from "@/hooks/useSensorsQuickLogManualReadings";
import { isUuid } from "@/lib/isUuid";
import { collectSensorsQuickLogManualReadingsForTents } from "@/lib/sensorsQuickLogManualSeriesRules";
import type { SensorReading } from "@/mock";

export function useQuickLogEnvironmentManuals(tentIds: readonly string[]): {
  data: SensorReading[];
} {
  const { user } = useAuth();
  const nowMs = useNowTick();
  const ids = useMemo(() => [...new Set(tentIds.filter((id) => isUuid(id)))].sort(), [tentIds]);
  const query = useQuery({
    queryKey: [...buildSensorsQuickLogManualReadingsQueryKey(ids), user?.id ?? "anon", "events"],
    enabled: Boolean(user) && ids.length > 0,
    retry: false,
    queryFn: () => fetchManualEventsForTents(ids),
  });
  const data = useMemo(
    () =>
      ids.length === 0
        ? []
        : collectSensorsQuickLogManualReadingsForTents({
            tentIds: ids,
            growEvents: query.data,
            now: new Date(nowMs),
          }),
    [ids, query.data, nowMs],
  );
  return { data };
}
