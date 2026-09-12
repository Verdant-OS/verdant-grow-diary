/**
 * useSensorsQuickLogManualReadings — tent-scoped read of Quick Log manuals
 * for the Sensors chart/table series.
 *
 * SELECT only. RLS owns access. Query key is prefixed `grow_events` so a
 * successful Quick Log save (`applyQuickLogV2Refresh`) refetches this window
 * without a reload. Failures resolve to [] so a diary/events miss cannot
 * blank the existing sensor_readings series.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import { isUuid } from "@/lib/isUuid";
import { selectWithRetractionCompat } from "@/lib/quick-log/retractionFilterCompat";
import type { RawGrowEventRow } from "@/lib/quickLogGroupedTimelineRowAdapter";
import {
  collectSensorsQuickLogManualReadings,
  type SensorsQuickLogDiaryRow,
} from "@/lib/sensorsQuickLogManualSeriesRules";
import type { SensorReading } from "@/mock";

export const SENSORS_QL_MANUAL_READINGS_QUERY_PREFIX = "grow_events" as const;

const GROW_EVENT_SELECT =
  "id, plant_id, tent_id, occurred_at, event_type, source, is_deleted, environment_events ( temperature_c, humidity_pct, vpd_kpa )";

const DIARY_SELECT = "id, tent_id, entry_at, details";

export function buildSensorsQuickLogManualReadingsQueryKey(tentId: string | null | undefined) {
  return [SENSORS_QL_MANUAL_READINGS_QUERY_PREFIX, "sensors-ql-manuals", tentId ?? "none"] as const;
}

async function fetchSensorsQuickLogManualReadings(tentId: string): Promise<SensorReading[]> {
  const eventsQuery = supabase
    .from("grow_events")
    .select(GROW_EVENT_SELECT)
    .eq("tent_id", tentId)
    .eq("source", "manual")
    .eq("is_deleted", false)
    .eq("event_type", "environment")
    .order("occurred_at", { ascending: false })
    .limit(200);

  const diaryQuery = selectWithRetractionCompat((withRetractionFilter) => {
    let query = supabase.from("diary_entries").select(DIARY_SELECT);
    if (withRetractionFilter) query = query.is("retracted_at", null);
    return query.eq("tent_id", tentId).order("entry_at", { ascending: false }).limit(50);
  });

  const [eventsResult, diaryResult] = await Promise.all([eventsQuery, diaryQuery]);
  if (eventsResult.error) throw eventsResult.error;
  if (diaryResult.error) throw diaryResult.error;

  return collectSensorsQuickLogManualReadings({
    tentId,
    growEvents: (eventsResult.data ?? []) as unknown as RawGrowEventRow[],
    diaryEntries: (diaryResult.data ?? []) as SensorsQuickLogDiaryRow[],
  });
}

export function useSensorsQuickLogManualReadings(tentId?: string | null) {
  const { user } = useAuth();
  const enabled = Boolean(user) && isUuid(tentId);
  return useQuery({
    queryKey: [...buildSensorsQuickLogManualReadingsQueryKey(tentId), user?.id ?? "anon"],
    enabled,
    retry: false,
    queryFn: async () => {
      if (!enabled || !tentId) return [] as SensorReading[];
      try {
        return await fetchSensorsQuickLogManualReadings(tentId);
      } catch {
        // Network / permission miss must not fail the Sensors page or invent
        // a product defect. sensor_readings remain the surviving series.
        return [] as SensorReading[];
      }
    },
  });
}
