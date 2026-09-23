/**
 * useDiaryRangeReportData — bounded, read-only data adapter for the
 * date-range diary report.
 *
 * Mirrors usePostGrowLearningReportData's read pattern: grow row, tent
 * ids, diary entries / grow events / harvests / sensor readings bounded
 * to the requested range, and 1-hour signed URLs for storage photo
 * paths. Strictly read-only: no inserts, no updates, no RPCs.
 */
import { useCallback, useEffect } from "react";
import { subscribeManualSensorCorrections } from "@/lib/manualSensorCorrectionEvents";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import type {
  DiaryRangeDiaryRow,
  DiaryRangeGrowEventRow,
  DiaryRangeHarvestRow,
  DiaryRangeSensorReadingRow,
} from "@/lib/diaryRangeReportRules";
import { selectWithRetractionCompat } from "@/lib/quick-log/retractionFilterCompat";
import {
  EFFECTIVE_SENSOR_QUERY_VERSION,
  effectiveSensorReadingsQuery,
  requireEffectiveSensorReadings,
} from "@/lib/effectiveSensorReadings";

export type DiaryRangeReportDataStatus = "idle" | "loading" | "ready" | "unavailable";

export interface DiaryRangeReportData {
  grow: { id: string; name: string | null; stage: string | null } | null;
  diaryEntries: DiaryRangeDiaryRow[];
  growEvents: DiaryRangeGrowEventRow[];
  harvests: DiaryRangeHarvestRow[];
  sensorReadings: DiaryRangeSensorReadingRow[];
}

export interface UseDiaryRangeReportDataResult {
  status: DiaryRangeReportDataStatus;
  data: DiaryRangeReportData | null;
  error: string | null;
  retry: () => void;
}

const EMPTY: DiaryRangeReportData = {
  grow: null,
  diaryEntries: [],
  growEvents: [],
  harvests: [],
  sensorReadings: [],
};

export async function fetchDiaryRangeReportDiaryRows(
  growId: string,
  startIso: string,
  endIso: string,
) {
  return selectWithRetractionCompat((withRetractionFilter) => {
    let q = supabase
      .from("diary_entries")
      .select("id,grow_id,note,photo_url,entry_at,details")
      .eq("grow_id", growId);
    if (withRetractionFilter) q = q.is("retracted_at", null);
    return q
      .gte("entry_at", startIso)
      .lte("entry_at", endIso)
      .order("entry_at", { ascending: true })
      .limit(250);
  });
}

async function signPhotoUrls(rows: DiaryRangeDiaryRow[]): Promise<DiaryRangeDiaryRow[]> {
  const paths = rows
    .map((r) => r.photo_url)
    .filter((p): p is string => !!p && !p.startsWith("http"));
  if (paths.length === 0) return rows;
  const { data, error } = await supabase.storage.from("diary-photos").createSignedUrls(paths, 3600);
  if (error || !Array.isArray(data)) throw new Error("Diary report photos unavailable.");
  const map = new Map(data.map((s) => [s.path as string, s.signedUrl]));
  if (paths.some((path) => !map.get(path)?.trim()))
    throw new Error("Diary report photos unavailable.");
  return rows.map((r) =>
    r.photo_url && map.has(r.photo_url) ? { ...r, photo_url: map.get(r.photo_url)! } : r,
  );
}

export function useDiaryRangeReportData(
  growId: string | null | undefined,
  startDate: string | null | undefined,
  endDate: string | null | undefined,
): UseDiaryRangeReportDataResult {
  const { user } = useAuth();
  const query = useQuery<DiaryRangeReportData>({
    queryKey: [
      "diary-range-report",
      user?.id ?? "anon",
      growId ?? "none",
      startDate ?? "none",
      endDate ?? "none",
      EFFECTIVE_SENSOR_QUERY_VERSION,
    ],
    enabled: !!user && !!growId && !!startDate && !!endDate,
    retry: false,
    queryFn: async () => {
      if (!user || !growId || !startDate || !endDate) return EMPTY;
      const startIso = `${startDate}T00:00:00.000Z`;
      const endIso = `${endDate}T23:59:59.999Z`;
      const { data: grow, error: growErr } = await supabase
        .from("grows")
        .select("id,name,stage")
        .eq("id", growId)
        .maybeSingle();
      if (growErr) throw growErr;
      if (!grow) throw new Error("Grow not found or unavailable.");

      const { data: tents, error: tentErr } = await supabase
        .from("tents")
        .select("id")
        .eq("grow_id", growId);
      if (tentErr || !Array.isArray(tents)) throw new Error("Diary report scope unavailable.");
      const tentIds = (tents ?? []).map((t) => t.id as string).filter(Boolean);

      const [diaryRes, eventsRes, harvestRes, sensorRes] = await Promise.all([
        fetchDiaryRangeReportDiaryRows(growId, startIso, endIso),
        supabase
          .from("grow_events")
          .select("id,grow_id,event_type,occurred_at,note")
          .eq("grow_id", growId)
          .eq("is_deleted", false)
          .gte("occurred_at", startIso)
          .lte("occurred_at", endIso)
          .order("occurred_at", { ascending: true })
          .limit(100),
        supabase
          .from("harvests")
          .select("harvested_at,yield_grams")
          .eq("grow_id", growId)
          .order("harvested_at", { ascending: false })
          .limit(50),
        tentIds.length > 0
          ? effectiveSensorReadingsQuery()
              .select(
                "id,user_id,tent_id,metric,value,ts,captured_at,created_at,device_id,source,quality,raw_payload,correction_valid",
              )
              .in("tent_id", tentIds)
              .in("metric", ["temperature_c", "humidity_pct", "vpd_kpa"])
              // Preserve the requested grower-observation range for CSV
              // imports; only legacy rows fall back to server ts.
              .or(
                `and(captured_at.gte.${startIso},captured_at.lte.${endIso}),and(captured_at.is.null,ts.gte.${startIso},ts.lte.${endIso})`,
              )
              .order("captured_at", { ascending: true, nullsFirst: false })
              .order("ts", { ascending: true })
              .limit(1000)
          : Promise.resolve({ data: [], error: null } as { data: unknown[]; error: null }),
      ]);

      for (const response of [diaryRes, eventsRes, harvestRes, sensorRes]) {
        if (response.error || !Array.isArray(response.data))
          throw new Error("Diary report evidence unavailable.");
      }

      const diaryRows = await signPhotoUrls((diaryRes.data ?? []) as DiaryRangeDiaryRow[]);
      return {
        grow: grow as DiaryRangeReportData["grow"],
        diaryEntries: diaryRows,
        growEvents: (eventsRes.data ?? []) as DiaryRangeGrowEventRow[],
        harvests: (harvestRes.data ?? []) as DiaryRangeHarvestRow[],
        sensorReadings: requireEffectiveSensorReadings(sensorRes.data).map((row) => ({
          metric: row.metric,
          value: row.value,
          ts: row.ts,
          captured_at: row.captured_at,
          source: row.source,
          raw_payload: row.raw_payload,
        })),
      };
    },
  });
  const ownerId = user?.id ?? null;
  const enabled = !!ownerId && !!growId && !!startDate && !!endDate;
  const refetch = query.refetch;
  const retry = useCallback(() => {
    if (enabled) void refetch();
  }, [enabled, refetch]);
  useEffect(() => subscribeManualSensorCorrections(ownerId, retry), [ownerId, retry]);
  if (!enabled) return { status: "idle", data: null, error: null, retry };
  if (query.isPending || query.isFetching || query.fetchStatus === "paused")
    return { status: "loading", data: null, error: null, retry };
  if (query.isError)
    return {
      status: "unavailable",
      data: null,
      error: "Unable to load diary report data. Try again.",
      retry,
    };
  return { status: "ready", data: query.data, error: null, retry };
}
