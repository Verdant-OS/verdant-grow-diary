/**
 * PlantDetailTimelineEvidenceReadinessLaunch — read-only mount that
 * surfaces the Timeline Evidence Readiness preview on the plant detail
 * AI Doctor launch surface, BEFORE any AI call is run.
 *
 * Hard constraints (verified by tests):
 *  - Presenter-only. No AI/model calls. No fetch. No Supabase writes.
 *    No Edge Function invocations. No alert/Action Queue writes. No
 *    automation. No device control. No new write paths.
 *  - Buttons navigate to existing routes or dispatch the existing
 *    `verdant:open-quicklog` event — they NEVER persist data.
 *  - Source-quality is rendered by reusing `TimelineEvidenceReadinessPanel`,
 *    which never re-labels demo/csv/stale/invalid as live or healthy.
 *  - Never renders raw provider payloads, vendor metadata, tokens, or
 *    private IDs.
 *  - Caller-supplied extras (photo count, alerts count, medium/pot size
 *    known) degrade safely when omitted.
 */
import { useMemo, useCallback } from "react";
import { Link } from "@/lib/react-router-compat";
import { Camera, Droplet, Leaf, Activity } from "lucide-react";

import { Button } from "@/components/ui/button";
import TimelineEvidenceReadinessPanel from "@/components/TimelineEvidenceReadinessPanel";
import { buildTimelineEvidenceReadinessView } from "@/lib/timelineEvidenceReadinessViewModel";
import { usePlantRecentActivity } from "@/hooks/usePlantRecentActivity";
import { usePlantManualSensorLogs } from "@/hooks/usePlantManualSensorHistory";
import { useSensorReadingsByTents } from "@/hooks/use-sensor-readings";
import {
  AI_DOCTOR_CURRENT_SENSOR_ROW_CAP,
  AI_DOCTOR_MANUAL_SENSOR_SOURCES,
} from "@/lib/aiDoctorCurrentSensorSnapshotRules";
import { isUuid } from "@/lib/isUuid";
import {
  buildPlantAiDoctorContext,
  type DiaryEntryRowLike,
  type ManualSensorLogLike,
} from "@/lib/plantAiDoctorContextAdapter";
import {
  buildPlantQuickLogPrefill,
  PLANT_QUICKLOG_PREFILL_EVENT,
} from "@/lib/plantQuickLogPrefillRules";
import { withGrowId } from "@/lib/routes";
import { buildQuickLogStripSensorsHref } from "@/lib/quickLogSnapshotStripAdapter";
import type { PlantRowLike } from "@/lib/aiDoctorContextCompiler";
import { QUICK_LOG_V2_OPEN_EVENT, buildQuickLogV2OpenIntent } from "@/lib/quickLogV2OpenIntent";

export interface PlantDetailTimelineEvidenceReadinessLaunchProps {
  plantId: string;
  growId: string | null;
  tentId: string | null;
  plantName?: string | null;
  strain?: string | null;
  stage?: string | null;
  hasPlantPhoto?: boolean;
  openAlertsCount?: number | null;
}

export const READINESS_ACTION_COPY = {
  no_recent_photos:
    "Add a recent photo so AI Doctor can compare visual symptoms with logs and sensor context.",
  no_recent_watering:
    "Add recent watering history so AI Doctor can review irrigation frequency and root-zone stress.",
  no_recent_feeding:
    "Add recent feeding history so AI Doctor can avoid guessing on nutrient issues.",
  no_recent_sensor_snapshot:
    "Attach a recent sensor snapshot so AI Doctor can see the environment around this plant.",
  unknown_stage:
    "Complete stage, medium, and pot size so AI Doctor has the basics before diagnosis.",
} as const;

const NO_TENT_MANUAL_ROWS: never[] = [];

const ROOT_TEST_ID = "plant-detail-timeline-evidence-readiness-launch";

export default function PlantDetailTimelineEvidenceReadinessLaunch({
  plantId,
  growId,
  tentId,
  plantName,
  strain,
  stage,
  hasPlantPhoto,
  openAlertsCount,
}: PlantDetailTimelineEvidenceReadinessLaunchProps) {
  const recentActivity = usePlantRecentActivity(plantId);
  const manualLogs = usePlantManualSensorLogs(plantId);
  const tentUuid = isUuid(tentId) ? tentId : null;
  const tentReadings = useSensorReadingsByTents(
    tentUuid ? [tentUuid] : [],
    AI_DOCTOR_CURRENT_SENSOR_ROW_CAP,
    AI_DOCTOR_MANUAL_SENSOR_SOURCES,
  );
  const tentSensorStatus = tentUuid
    ? (tentReadings.statusByTent[tentUuid] ?? "loading")
    : "success";
  const tentSensorFailed = tentSensorStatus === "error" || tentSensorStatus === "refresh_error";
  const tentSensorRows =
    tentUuid && !tentSensorFailed
      ? (tentReadings.byTent[tentUuid] ?? NO_TENT_MANUAL_ROWS)
      : NO_TENT_MANUAL_ROWS;
  const hasReadError = recentActivity.isError || manualLogs.isError || tentSensorFailed;
  const isLoading =
    recentActivity.isLoading ||
    recentActivity.isFetching ||
    recentActivity.data === undefined ||
    manualLogs.isLoading ||
    manualLogs.isFetching ||
    manualLogs.data === undefined ||
    Boolean(
      tentUuid &&
        (tentSensorStatus === "loading" || tentReadings.refreshingByTent?.[tentUuid]),
    );

  const retryContextReads = () => {
    void recentActivity.refetch();
    void manualLogs.refetch();
    void tentReadings.refetch();
  };

  const plantRow: PlantRowLike = useMemo(
    () => ({
      id: plantId,
      name: plantName ?? null,
      strain: strain ?? null,
      stage: stage ?? null,
      grow_id: growId,
      tent_id: tentId,
    }),
    [plantId, plantName, strain, stage, growId, tentId],
  );

  const context = useMemo(() => {
    try {
      const diary = (recentActivity.data ?? []) as readonly DiaryEntryRowLike[];
      const logs = (manualLogs.data ?? []) as readonly ManualSensorLogLike[];
      return buildPlantAiDoctorContext({
        plant: plantRow,
        diaryEntries: diary,
        manualSensorLogs: logs,
        tentSensorRows,
        tentId: tentUuid,
      });
    } catch {
      return null;
    }
  }, [plantRow, recentActivity.data, manualLogs.data, tentSensorRows, tentUuid]);

  const extras = useMemo(
    () => ({
      recentPhotoCount: hasPlantPhoto ? 1 : 0,
      openAlertsCount: openAlertsCount ?? 0,
    }),
    [hasPlantPhoto, openAlertsCount],
  );

  const view = useMemo(
    () => (context ? buildTimelineEvidenceReadinessView(context, extras) : null),
    [context, extras],
  );

  const dispatchQuickLog = useCallback((detail: Record<string, unknown>) => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent(PLANT_QUICKLOG_PREFILL_EVENT, { detail }));
  }, []);

  const prefill = useMemo(
    () =>
      buildPlantQuickLogPrefill({
        plantId,
        plantName: plantName ?? null,
        growId,
        tentId,
        tentName: null,
      }),
    [plantId, plantName, growId, tentId],
  );

  const handleAddPhoto = useCallback(() => {
    dispatchQuickLog(prefill ? { ...prefill, suggestPhoto: true } : { suggestPhoto: true });
  }, [dispatchQuickLog, prefill]);

  const handleAddWatering = useCallback(() => {
    if (typeof window === "undefined") return;
    const intent = buildQuickLogV2OpenIntent({ plantId, tentId, action: "water" });
    if (!intent) return;
    window.dispatchEvent(new CustomEvent(QUICK_LOG_V2_OPEN_EVENT, { detail: intent }));
  }, [plantId, tentId]);

  const handleAddFeeding = useCallback(() => {
    dispatchQuickLog(prefill ? { ...prefill, eventType: "feeding" } : { eventType: "feeding" });
  }, [dispatchQuickLog, prefill]);

  if (!plantId) return null;

  if (hasReadError) {
    return (
      <section
        data-testid={`${ROOT_TEST_ID}-error`}
        role="alert"
        className="my-3 rounded-md border border-border/40 p-3 space-y-2"
      >
        <p className="text-sm font-medium">Context preview unavailable.</p>
        <p className="text-xs text-muted-foreground">
          Some plant or tent records could not be loaded. Try again to check what is available.
        </p>
        <Button type="button" size="sm" variant="outline" onClick={retryContextReads}>
          Try context read again
        </Button>
      </section>
    );
  }

  if (isLoading) {
    return (
      <section
        data-testid={`${ROOT_TEST_ID}-loading`}
        role="status"
        className="my-3 rounded-md border border-border/40 p-3 text-xs text-muted-foreground"
      >
        Checking plant and tent context…
      </section>
    );
  }

  if (!view) return null;

  const missingCodes = new Set(view.missing.map((m) => m.code));

  return (
    <section
      data-testid={ROOT_TEST_ID}
      data-tone={view.tone}
      className="my-3 space-y-2"
      aria-label="AI Doctor context readiness"
    >
      <p className="text-xs text-muted-foreground" data-testid={`${ROOT_TEST_ID}-scope`}>
        This preview uses recent plant diary records and manual sensor readings from its assigned
        tent. Sensor readings are limited to the last 7 days. Current sensor health is shown in AI
        Doctor readiness.
      </p>
      <TimelineEvidenceReadinessPanel context={context!} extras={extras} />

      {(missingCodes.has("no_recent_photos") ||
        missingCodes.has("no_recent_watering") ||
        missingCodes.has("no_recent_feeding") ||
        missingCodes.has("no_recent_sensor_snapshot")) && (
        <div
          data-testid={`${ROOT_TEST_ID}-actions`}
          className="rounded-md border border-border/40 bg-background/30 p-3 space-y-2"
        >
          <p className="text-[11px] text-muted-foreground">
            These buttons open existing capture flows. They never call AI Doctor and never save data
            on their own.
          </p>
          <div className="flex flex-wrap gap-2">
            {missingCodes.has("no_recent_photos") && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1"
                onClick={handleAddPhoto}
                data-testid={`${ROOT_TEST_ID}-action-add-photo`}
                aria-label="Fast add a recent photo for AI Doctor context"
                title={READINESS_ACTION_COPY.no_recent_photos}
              >
                <Camera className="h-3.5 w-3.5" aria-hidden="true" /> Fast Add Photo
              </Button>
            )}
            {missingCodes.has("no_recent_watering") && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1"
                onClick={handleAddWatering}
                data-testid={`${ROOT_TEST_ID}-action-add-watering`}
                aria-label="Add recent watering history for AI Doctor context"
                title={READINESS_ACTION_COPY.no_recent_watering}
              >
                <Droplet className="h-3.5 w-3.5" aria-hidden="true" /> Add Watering
              </Button>
            )}
            {missingCodes.has("no_recent_feeding") && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1"
                onClick={handleAddFeeding}
                data-testid={`${ROOT_TEST_ID}-action-add-feeding`}
                aria-label="Add recent feeding history for AI Doctor context"
                title={READINESS_ACTION_COPY.no_recent_feeding}
              >
                <Leaf className="h-3.5 w-3.5" aria-hidden="true" /> Add Feeding
              </Button>
            )}
            {missingCodes.has("no_recent_sensor_snapshot") && (
              <Button
                asChild
                size="sm"
                variant="outline"
                className="gap-1"
                data-testid={`${ROOT_TEST_ID}-action-add-sensor-snapshot`}
                title={READINESS_ACTION_COPY.no_recent_sensor_snapshot}
              >
                <Link
                  to={withGrowId(
                    buildQuickLogStripSensorsHref(tentId, { hash: "manual-reading" }),
                    growId,
                  )}
                  aria-label="Add sensor snapshot for AI Doctor context"
                >
                  <Activity className="h-3.5 w-3.5" aria-hidden="true" /> Add Sensor Snapshot
                </Link>
              </Button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
