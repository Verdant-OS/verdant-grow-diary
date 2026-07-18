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
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
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
  type PostGrowSensorReadingLike,
} from "@/lib/postGrowLearningReportRules";

export type PostGrowReportStatus = "idle" | "loading" | "ready" | "unavailable";

export interface UsePostGrowLearningReportDataResult {
  status: PostGrowReportStatus;
  report: PostGrowLearningReportViewModel | null;
  error: string | null;
  reload: () => Promise<void>;
  saveLesson: (lesson: string) => Promise<{ ok: true } | { ok: false; message: string }>;
  applyLessonToNextGrow: (
    lesson: string,
  ) => Promise<{ ok: true; actionId: string | null } | { ok: false; message: string }>;
}

async function signPhotoUrls(rows: PostGrowDiaryLike[]): Promise<PostGrowDiaryLike[]> {
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

export function usePostGrowLearningReportData(
  growId: string | null | undefined,
): UsePostGrowLearningReportDataResult {
  const { user } = useAuth();
  const [status, setStatus] = useState<PostGrowReportStatus>("idle");
  const [report, setReport] = useState<PostGrowLearningReportViewModel | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user || !growId) {
      setStatus("idle");
      setReport(null);
      setError(null);
      return;
    }
    setStatus("loading");
    setError(null);
    try {
      const { data: grow, error: growErr } = await supabase
        .from("grows")
        .select("id,name,stage,is_archived,started_at")
        .eq("id", growId)
        .maybeSingle();
      if (growErr) throw growErr;
      if (!grow) {
        setReport(null);
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

      const [harvestRes, diaryRes, sensorRes, actionRes] = await Promise.all([
        supabase
          .from("harvests")
          .select("harvested_at,yield_grams,medium,notes")
          .eq("grow_id", growId)
          .order("harvested_at", { ascending: false }),
        supabase
          .from("diary_entries")
          .select("id,note,photo_url,entry_at,details")
          .eq("grow_id", growId)
          .order("entry_at", { ascending: false })
          .limit(250),
        tentIds.length > 0
          ? supabase
              .from("sensor_readings")
              .select("metric,value,ts,source,quality,raw_payload")
              .in("tent_id", tentIds)
              .in("metric", ["temperature_c", "humidity_pct", "vpd_kpa"])
              .order("ts", { ascending: true })
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

      const diaryRows = await signPhotoUrls((diaryRes.data ?? []) as PostGrowDiaryLike[]);
      const vm = buildPostGrowLearningReportViewModel({
        grow: grow as PostGrowGrowLike,
        harvests: (harvestRes.data ?? []) as PostGrowHarvestLike[],
        diaryEntries: diaryRows,
        sensorReadings: (sensorRes.data ?? []) as PostGrowSensorReadingLike[],
        actions: (actionRes.data ?? []) as PostGrowActionLike[],
      });
      setReport(vm);
      setStatus("ready");
    } catch (err) {
      setReport(null);
      setStatus("unavailable");
      setError(err instanceof Error ? err.message : "Unable to load post-grow report.");
    }
  }, [user, growId]);

  useEffect(() => {
    load();
  }, [load]);

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

  return { status, report, error, reload: load, saveLesson, applyLessonToNextGrow };
}
