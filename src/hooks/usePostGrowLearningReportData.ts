/**
 * usePostGrowLearningReportData — narrow data adapter for the Phase 1
 * Post-Grow Learning Report.
 *
 * Reads only existing tables. Writes are limited to:
 *  - diary_entries note save for grower-authored lessons
 *  - action_queue pending_approval advisory draft for applying a lesson
 *
 * No schema/RLS/Edge/auth changes. No device control. No AI calls.
 */
import { useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { subscribeManualSensorCorrections } from "@/lib/manualSensorCorrectionEvents";
import { supabase } from "@/integrations/supabase/client";
import {
  EFFECTIVE_SENSOR_QUERY_VERSION,
  effectiveSensorReadingsQuery,
  requireEffectiveSensorReadings,
} from "@/lib/effectiveSensorReadings";
import { useAuth } from "@/store/auth";
import {
  POST_GROW_LESSON_EVENT_TYPE,
  buildPostGrowLearningReportViewModel,
  buildPostGrowLessonActionQueueDraft,
  type PostGrowActionLike,
  type PostGrowDiaryLike,
  type PostGrowGrowLike,
  type PostGrowHarvestLike,
  type PostGrowLearningReportViewModel,
} from "@/lib/postGrowLearningReportRules";
import { selectWithRetractionCompat } from "@/lib/quick-log/retractionFilterCompat";
import { computeYieldEfficiency, type YieldEfficiencyReport } from "@/lib/yieldEfficiencyRules";
import { useTemperatureUnitPreference } from "@/hooks/useTemperatureUnitPreference";

export type PostGrowReportStatus = "idle" | "loading" | "ready" | "unavailable";

export interface UsePostGrowLearningReportDataResult {
  status: PostGrowReportStatus;
  report: PostGrowLearningReportViewModel | null;
  /** Derived read-only efficiency metrics; null until the report loads. */
  yieldEfficiency: YieldEfficiencyReport | null;
  error: string | null;
  reload: () => Promise<void>;
  saveLesson: (lesson: string) => Promise<{ ok: true } | { ok: false; message: string }>;
  applyLessonToNextGrow: (
    lesson: string,
  ) => Promise<{ ok: true; actionId: string | null } | { ok: false; message: string }>;
}

export async function fetchPostGrowLearningDiaryRows(growId: string) {
  return selectWithRetractionCompat((withRetractionFilter) => {
    let q = supabase
      .from("diary_entries")
      .select("id,note,photo_url,entry_at,details")
      .eq("grow_id", growId);
    if (withRetractionFilter) q = q.is("retracted_at", null);
    return q.order("entry_at", { ascending: false }).limit(250);
  });
}

async function signPhotoUrls(rows: PostGrowDiaryLike[]): Promise<PostGrowDiaryLike[]> {
  const paths = rows
    .map((r) => r.photo_url)
    .filter((p): p is string => !!p && !p.startsWith("http"));
  if (paths.length === 0) return rows;
  const { data, error } = await supabase.storage.from("diary-photos").createSignedUrls(paths, 3600);
  if (error || !Array.isArray(data)) throw new Error("Report photos unavailable.");
  const map = new Map(data.map((s) => [s.path as string, s.signedUrl]));
  if (paths.some((path) => !map.get(path)?.trim())) throw new Error("Report photos unavailable.");
  return rows.map((r) =>
    r.photo_url && map.has(r.photo_url) ? { ...r, photo_url: map.get(r.photo_url)! } : r,
  );
}

export function usePostGrowLearningReportData(
  growId: string | null | undefined,
): UsePostGrowLearningReportDataResult {
  const { user } = useAuth();
  const tempUnit = useTemperatureUnitPreference();
  const measurementSystem = tempUnit === "celsius" ? ("metric" as const) : ("imperial" as const);
  const query = useQuery<{
    report: PostGrowLearningReportViewModel;
    yieldEfficiency: YieldEfficiencyReport;
  }>({
    queryKey: [
      "post-grow-report",
      user?.id ?? "anon",
      growId ?? "none",
      measurementSystem,
      EFFECTIVE_SENSOR_QUERY_VERSION,
    ],
    enabled: !!user && !!growId,
    retry: false,
    queryFn: async () => {
      if (!user || !growId) throw new Error("Report unavailable.");
      const { data: grow, error: growErr } = await supabase
        .from("grows")
        .select("id,name,stage,is_archived,started_at")
        .eq("id", growId)
        .maybeSingle();
      if (growErr) throw growErr;
      if (!grow) throw new Error("Grow not found or unavailable.");

      const { data: tents, error: tentErr } = await supabase
        .from("tents")
        .select("id,size,light_wattage")
        .eq("grow_id", growId);
      if (tentErr || !Array.isArray(tents)) throw new Error("Unable to load report tents.");
      const tentIds = (tents ?? []).map((t) => t.id as string).filter(Boolean);

      const [harvestRes, diaryRes, sensorRes, actionRes] = await Promise.all([
        supabase
          .from("harvests")
          .select("harvested_at,yield_grams,medium,notes")
          .eq("grow_id", growId)
          .order("harvested_at", { ascending: false }),
        fetchPostGrowLearningDiaryRows(growId),
        tentIds.length > 0
          ? effectiveSensorReadingsQuery()
              .select(
                "id,user_id,tent_id,metric,value,ts,captured_at,created_at,device_id,source,quality,raw_payload,correction_valid",
              )
              .in("tent_id", tentIds)
              .in("metric", ["temperature_c", "humidity_pct", "vpd_kpa"])
              .order("captured_at", { ascending: true, nullsFirst: false })
              .order("ts", { ascending: true })
              .order("id", { ascending: true })
              .limit(1000)
          : Promise.resolve({ data: [], error: null } as { data: unknown[]; error: null }),
        supabase
          .from("action_queue")
          .select("id,action_type,suggested_change,status,completed_at,created_at")
          .eq("grow_id", growId)
          .order("created_at", { ascending: false })
          .limit(100),
      ]);

      if (harvestRes.error) throw harvestRes.error;
      if (diaryRes.error) throw diaryRes.error;
      if (sensorRes.error) throw sensorRes.error;
      if (actionRes.error) throw actionRes.error;
      for (const response of [harvestRes, diaryRes, actionRes]) {
        if (!Array.isArray(response.data)) throw new Error("Unable to load report evidence.");
      }

      const diaryRows = await signPhotoUrls((diaryRes.data ?? []) as PostGrowDiaryLike[]);
      const vm = buildPostGrowLearningReportViewModel({
        grow: grow as PostGrowGrowLike,
        harvests: (harvestRes.data ?? []) as PostGrowHarvestLike[],
        diaryEntries: diaryRows,
        sensorReadings: requireEffectiveSensorReadings(sensorRes.data).map(
          ({ id, metric, value, ts, captured_at, source, raw_payload }) => ({
            id,
            metric,
            value,
            ts,
            captured_at,
            source,
            raw_payload,
          }),
        ),
        actions: (actionRes.data ?? []) as PostGrowActionLike[],
      });
      return {
        report: vm,
        yieldEfficiency: computeYieldEfficiency({
          harvestEntries: diaryRows.map((r) => ({ details: r.details })),
          tents: (tents ?? []).map((t) => ({
            size: (t as { size?: string | null }).size ?? null,
            light: { wattage: (t as { light_wattage?: number | null }).light_wattage ?? null },
          })),
          system: measurementSystem,
        }),
      };
    },
  });
  const enabled = !!user && !!growId;
  const pending = query.isPending || query.isFetching || query.fetchStatus === "paused";
  const status: PostGrowReportStatus = !enabled
    ? "idle"
    : pending
      ? "loading"
      : query.isError
        ? "unavailable"
        : "ready";
  const report = status === "ready" ? (query.data?.report ?? null) : null;
  const yieldEfficiency = status === "ready" ? (query.data?.yieldEfficiency ?? null) : null;
  const error = status === "unavailable" ? "Unable to load post-grow report." : null;
  const refetch = query.refetch;
  const load = useCallback(async () => {
    if (user?.id && growId) await refetch();
  }, [user?.id, growId, refetch]);
  useEffect(
    () =>
      subscribeManualSensorCorrections(user?.id ?? null, () => {
        void load();
      }),
    [user?.id, load],
  );

  const saveLesson = useCallback(
    async (lesson: string): Promise<{ ok: true } | { ok: false; message: string }> => {
      if (!user || !growId || !report) return { ok: false, message: "Report unavailable." };
      const note = lesson.trim();
      const details = {
        event_type: POST_GROW_LESSON_EVENT_TYPE,
        source: "manual",
        report_kind: "post_grow_learning_phase1",
      };
      try {
        if (report.lesson.entryId) {
          const { error: updateErr } = await supabase
            .from("diary_entries")
            .update({ note, details, entry_at: new Date().toISOString() })
            .eq("id", report.lesson.entryId)
            .eq("grow_id", growId);
          if (updateErr) throw updateErr;
        } else {
          const { error: insertErr } = await supabase.from("diary_entries").insert({
            grow_id: growId,
            note,
            details,
            stage: "drying",
          });
          if (insertErr) throw insertErr;
        }
        await load();
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : "Unable to save lesson.",
        };
      }
    },
    [user, growId, report, load],
  );

  const applyLessonToNextGrow = useCallback(
    async (
      lesson: string,
    ): Promise<{ ok: true; actionId: string | null } | { ok: false; message: string }> => {
      if (!user || !growId) return { ok: false, message: "Grow unavailable." };
      const draft = buildPostGrowLessonActionQueueDraft({ growId, lessonText: lesson });
      try {
        const { data, error: insertErr } = await supabase
          .from("action_queue")
          .insert(draft)
          .select("id")
          .single();
        if (insertErr) throw insertErr;
        return { ok: true, actionId: (data?.id as string | undefined) ?? null };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : "Unable to create Action Queue item.",
        };
      }
    },
    [user, growId],
  );

  return {
    status,
    report,
    yieldEfficiency,
    error,
    reload: load,
    saveLesson,
    applyLessonToNextGrow,
  };
}
