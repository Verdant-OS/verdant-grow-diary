/**
 * useEndOfRunGrowReportData — narrow, read-only data adapter for the
 * End-of-Run Grow Report preview.
 *
 * Reads only existing tables and selects narrow column sets (never raw
 * sensor payloads). Performs NO writes: no insert, update, delete, upsert, or
 * RPC. No schema/RLS/Edge/auth changes. No AI calls, no automation, no
 * device control. All aggregation lives in the pure view-model builder.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import {
  buildEndOfRunGrowReportViewModel,
  type GrowReportActionLike,
  type GrowReportAiDoctorLike,
  type GrowReportAlertLike,
  type GrowReportEventLike,
  type GrowReportGrowLike,
  type GrowReportPlantLike,
  type GrowReportSensorReadingLike,
  type GrowReportTentLike,
  type GrowReportViewModel,
} from "@/lib/endOfRunGrowReportViewModel";

export type EndOfRunGrowReportStatus = "idle" | "loading" | "ready" | "unavailable";

export interface UseEndOfRunGrowReportDataResult {
  status: EndOfRunGrowReportStatus;
  report: GrowReportViewModel | null;
  error: string | null;
  reload: () => Promise<void>;
}

export function useEndOfRunGrowReportData(
  growId: string | null | undefined,
): UseEndOfRunGrowReportDataResult {
  const { user } = useAuth();
  const [status, setStatus] = useState<EndOfRunGrowReportStatus>("idle");
  const [report, setReport] = useState<GrowReportViewModel | null>(null);
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
        .select("id,name,stage,started_at,is_archived,grow_type")
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
        .select("id,name,grow_id")
        .eq("grow_id", growId);
      if (tentErr) throw tentErr;
      const tentIds = (tents ?? []).map((t) => t.id as string).filter(Boolean);

      const [plantRes, eventRes, sensorRes, alertRes, actionRes, aiDoctorRes] = await Promise.all([
        supabase
          .from("plants")
          .select("id,name,strain,stage,grow_id,tent_id,started_at")
          .eq("grow_id", growId)
          .limit(500),
        supabase
          .from("grow_events")
          .select("id,event_type,source,occurred_at,plant_id,tent_id,is_deleted")
          .eq("grow_id", growId)
          .order("occurred_at", { ascending: true })
          .limit(2000),
        tentIds.length > 0
          ? supabase
              .from("sensor_readings")
              .select("id,source,quality,ts,captured_at,tent_id")
              .in("tent_id", tentIds)
              .order("ts", { ascending: true })
              .limit(2000)
          : Promise.resolve({
              data: [],
              error: null,
            } as { data: unknown[]; error: null }),
        supabase
          .from("alerts")
          .select("id,status,severity,metric,plant_id,resolved_at")
          .eq("grow_id", growId)
          .limit(500),
        supabase.from("action_queue").select("id,status,plant_id").eq("grow_id", growId).limit(500),
        supabase.from("ai_doctor_sessions").select("id,plant_id").eq("grow_id", growId).limit(500),
      ]);

      if (plantRes.error) throw plantRes.error;
      if (eventRes.error) throw eventRes.error;
      if (sensorRes.error) throw sensorRes.error;
      if (alertRes.error) throw alertRes.error;
      if (actionRes.error) throw actionRes.error;
      if (aiDoctorRes.error) throw aiDoctorRes.error;

      const vm = buildEndOfRunGrowReportViewModel({
        grow: grow as GrowReportGrowLike,
        tents: (tents ?? []) as GrowReportTentLike[],
        plants: (plantRes.data ?? []) as GrowReportPlantLike[],
        events: (eventRes.data ?? []) as GrowReportEventLike[],
        sensorReadings: (sensorRes.data ?? []) as GrowReportSensorReadingLike[],
        alerts: (alertRes.data ?? []) as GrowReportAlertLike[],
        actions: (actionRes.data ?? []) as GrowReportActionLike[],
        aiDoctorSessions: (aiDoctorRes.data ?? []) as GrowReportAiDoctorLike[],
      });
      setReport(vm);
      setStatus("ready");
    } catch (err) {
      setReport(null);
      setStatus("unavailable");
      setError(err instanceof Error ? err.message : "Unable to load end-of-run grow report.");
    }
  }, [user, growId]);

  useEffect(() => {
    load();
  }, [load]);

  return { status, report, error, reload: load };
}
