/**
 * useSensorsQuickLogManualReadings — tent-scoped read of Quick Log manuals
 * for the Sensors chart/table series.
 *
 * SELECT only. RLS owns access. Query key is prefixed `grow_events` so a
 * successful Quick Log save (`applyQuickLogV2Refresh`) refetches this window
 * without a reload. Each source retains its own data and read state, so a
 * failed source cannot erase the survivor or pretend history is empty.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import { useNowTick } from "@/hooks/useNowTick";
import { isUuid } from "@/lib/isUuid";
import { selectWithRetractionCompat } from "@/lib/quick-log/retractionFilterCompat";
import type { RawGrowEventRow } from "@/lib/quickLogGroupedTimelineRowAdapter";
import {
  collectSensorsQuickLogManualReadings,
  collectSensorsQuickLogManualReadingsForTents,
  type SensorsQuickLogDiaryRow,
} from "@/lib/sensorsQuickLogManualSeriesRules";
import type { SensorReading } from "@/mock";

export const SENSORS_QL_MANUAL_READINGS_QUERY_PREFIX = "grow_events" as const;

const GROW_EVENT_SELECT =
  "id, plant_id, tent_id, occurred_at, event_type, source, is_deleted, environment_events ( temperature_c, humidity_pct, vpd_kpa )";

const DIARY_SELECT = "id, tent_id, entry_at, details";

export function buildSensorsQuickLogManualReadingsQueryKey(
  tentScope: string | readonly (string | null | undefined)[] | null | undefined,
) {
  if (Array.isArray(tentScope)) {
    const ids = Array.from(
      new Set(tentScope.filter((id): id is string => typeof id === "string" && isUuid(id))),
    ).sort();
    return [
      SENSORS_QL_MANUAL_READINGS_QUERY_PREFIX,
      "sensors-ql-manuals",
      ids.length > 0 ? ids.join(",") : "none",
    ] as const;
  }
  return [
    SENSORS_QL_MANUAL_READINGS_QUERY_PREFIX,
    "sensors-ql-manuals",
    (tentScope as string | null | undefined) ?? "none",
  ] as const;
}

async function fetchManualEvents(tentId: string): Promise<RawGrowEventRow[]> {
  const { data, error } = await supabase
    .from("grow_events")
    .select(GROW_EVENT_SELECT)
    .eq("tent_id", tentId)
    .eq("source", "manual")
    .eq("is_deleted", false)
    .eq("event_type", "environment")
    .order("occurred_at", { ascending: false })
    .limit(200);

  if (error) throw error;
  if (!Array.isArray(data)) throw new Error("Quick Log environment history unavailable");
  return data as unknown as RawGrowEventRow[];
}

async function fetchManualDiary(tentId: string): Promise<SensorsQuickLogDiaryRow[]> {
  const { data, error } = await selectWithRetractionCompat((withRetractionFilter) => {
    let query = supabase.from("diary_entries").select(DIARY_SELECT);
    if (withRetractionFilter) query = query.is("retracted_at", null);
    return query.eq("tent_id", tentId).order("entry_at", { ascending: false }).limit(50);
  });

  if (error) throw error;
  if (!Array.isArray(data)) throw new Error("Quick Log diary history unavailable");
  return data as SensorsQuickLogDiaryRow[];
}

export function useSensorsQuickLogManualReadings(
  tentScope?: string | readonly (string | null | undefined)[] | null,
) {
  const { user } = useAuth();
  const nowMs = useNowTick();
  const isMultiTent = Array.isArray(tentScope);
  const validTentIds = useMemo(
    () =>
      isMultiTent
        ? Array.from(
            new Set(tentScope.filter((id): id is string => typeof id === "string" && isUuid(id))),
          ).sort()
        : isUuid(tentScope as string | null | undefined)
          ? [tentScope as string]
          : [],
    [isMultiTent, tentScope],
  );
  const enabled = Boolean(user) && validTentIds.length > 0;
  const queryKey = [...buildSensorsQuickLogManualReadingsQueryKey(tentScope), user?.id ?? "anon"];
  const events = useQuery({
    queryKey: [...queryKey, "events"],
    enabled,
    retry: false,
    queryFn: async () => {
      if (!isMultiTent) return fetchManualEvents(validTentIds[0]!);
      const perTent = await Promise.all(validTentIds.map((id) => fetchManualEvents(id)));
      return perTent.flat();
    },
  });
  const diary = useQuery({
    queryKey: [...queryKey, "diary"],
    enabled,
    retry: false,
    queryFn: async () => {
      if (!isMultiTent) return fetchManualDiary(validTentIds[0]!);
      const perTent = await Promise.all(validTentIds.map((id) => fetchManualDiary(id)));
      return perTent.flat();
    },
  });
  const data = useMemo<SensorReading[]>(
    () =>
      enabled
        ? isMultiTent
          ? collectSensorsQuickLogManualReadingsForTents({
              tentIds: validTentIds,
              growEvents: events.data,
              diaryEntries: diary.data,
              now: new Date(nowMs),
            })
          : collectSensorsQuickLogManualReadings({
              tentId: validTentIds[0],
              growEvents: events.data,
              diaryEntries: diary.data,
              now: new Date(nowMs),
            })
        : [],
    [enabled, isMultiTent, validTentIds, events.data, diary.data, nowMs],
  );
  return {
    data,
    isPending: enabled && (events.isPending || diary.isPending),
    isLoading: enabled && (events.isLoading || diary.isLoading),
    isError: enabled && (events.isError || diary.isError),
    isSuccess: enabled && events.isSuccess && diary.isSuccess,
    fetchStatus:
      events.fetchStatus === "paused" || diary.fetchStatus === "paused"
        ? "paused"
        : events.isFetching || diary.isFetching
          ? "fetching"
          : "idle",
    // Explicit retry rechecks both sources, retaining each successful cache
    // until that source's own replacement read succeeds.
    refetch: () =>
      enabled ? Promise.all([events.refetch(), diary.refetch()]) : Promise.resolve([]),
  };
}
