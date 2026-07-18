/**
 * useDiaryRangeReportData — bounded, read-only data adapter for the
 * date-range diary report.
 *
 * Mirrors usePostGrowLearningReportData's read pattern: grow row, tent
 * ids, diary entries / grow events / harvests / sensor readings bounded
 * to the requested range, and 1-hour signed URLs for storage photo
 * paths. Strictly read-only: no inserts, no updates, no RPCs.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import type {
  DiaryRangeDiaryRow,
  DiaryRangeGrowEventRow,
  DiaryRangeHarvestRow,
  DiaryRangeSensorReadingRow,
} from "@/lib/diaryRangeReportRules";

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
}

const EMPTY: DiaryRangeReportData = {
  grow: null,
  diaryEntries: [],
  growEvents: [],
  harvests: [],
  sensorReadings: [],
};

async function signPhotoUrls(rows: DiaryRangeDiaryRow[]): Promise<DiaryRangeDiaryRow[]> {
  const paths = rows
    .map((r) => r.photo_url)
    .filter((p): p is string => !!p && !p.startsWith("http"));
  if (paths.length === 0) return rows;
  const { data } = await supabase.storage.from("diary-photos").createSignedUrls(paths, 3600);
  const map = new Map((data ?? []).map((s) => [s.path as string, s.signedUrl]));
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
  const [status, setStatus] = useState<DiaryRangeReportDataStatus>("idle");
  const [data, setData] = useState<DiaryRangeReportData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user || !growId || !startDate || !endDate) {
      setStatus("idle");
      setData(null);
      setError(null);
      return;
    }
    setStatus("loading");
    setError(null);
    const startIso = `${startDate}T00:00:00.000Z`;
    const endIso = `${endDate}T23:59:59.999Z`;
    try {
      const { data: grow, error: growErr } = await supabase
        .from("grows")
        .select("id,name,stage")
        .eq("id", growId)
        .maybeSingle();
      if (growErr) throw growErr;
      if (!grow) {
        setData(null);
        setStatus("unavailable");
        setError("Grow not found or unavailable.");
        return;
      }

      const { data: tents, error: tentErr } = await supabase
        .from("tents")
        .select("id")
        .eq("grow_id", growId);
      if (tentErr) throw tentErr;
      const tentIds = (tents ?? []).map((t) => t.id as string).filter(Boolean);

      const [diaryRes, eventsRes, harvestRes, sensorRes] = await Promise.all([
        supabase
          .from("diary_entries")
          .select("id,note,photo_url,entry_at,details")
          .eq("grow_id", growId)
          .gte("entry_at", startIso)
          .lte("entry_at", endIso)
          .order("entry_at", { ascending: true })
          .limit(250),
        supabase
          .from("grow_events")
          .select("id,event_type,occurred_at,note")
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
          ? supabase
              .from("sensor_readings")
              .select("metric,value,ts,captured_at,source,raw_payload")
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

      if (diaryRes.error) throw diaryRes.error;
      if (eventsRes.error) throw eventsRes.error;
      if (harvestRes.error) throw harvestRes.error;
      if (sensorRes.error) throw sensorRes.error;

      const diaryRows = await signPhotoUrls((diaryRes.data ?? []) as DiaryRangeDiaryRow[]);
      setData({
        grow: grow as DiaryRangeReportData["grow"],
        diaryEntries: diaryRows,
        growEvents: (eventsRes.data ?? []) as DiaryRangeGrowEventRow[],
        harvests: (harvestRes.data ?? []) as DiaryRangeHarvestRow[],
        sensorReadings: (sensorRes.data ?? []) as DiaryRangeSensorReadingRow[],
      });
      setStatus("ready");
    } catch (err) {
      setData(EMPTY);
      setStatus("unavailable");
      setError(err instanceof Error ? err.message : "Unable to load diary report data.");
    }
  }, [user, growId, startDate, endDate]);

  useEffect(() => {
    load();
  }, [load]);

  return { status, data, error };
}
