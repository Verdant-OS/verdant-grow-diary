/**
 * PlantDetailAiDoctorContextReadinessMount — read-only mount that
 * compiles plant context from existing RLS-safe hooks and renders
 * `AiDoctorContextReadinessPanel`.
 *
 * Hard constraints:
 *  - No model/API calls. No Supabase writes. No alerts. No Action Queue writes.
 *  - Sensor data comes from manual logs already on file; never fabricated.
 *  - Compilation failures degrade to a safe fallback, never crash the page.
 */
import { useCallback, useMemo } from "react";
import { Activity } from "lucide-react";
import AiDoctorContextReadinessPanel from "@/components/AiDoctorContextReadinessPanel";
import AiDoctorCheckInPreviewPanel from "@/components/AiDoctorCheckInPreviewPanel";
import PlantSensorContextAuditPanel from "@/components/PlantSensorContextAuditPanel";
import { usePlantRecentActivity } from "@/hooks/usePlantRecentActivity";
import { usePlantManualSensorLogs } from "@/hooks/usePlantManualSensorHistory";
import { usePlantAssignedTentAlerts } from "@/hooks/usePlantAssignedTentAlerts";
import {
  buildPlantAiDoctorContext,
  type DiaryEntryRowLike,
  type ManualSensorLogLike,
} from "@/lib/plantAiDoctorContextAdapter";
import { PLANT_QUICKLOG_PREFILL_EVENT } from "@/lib/plantQuickLogPrefillRules";
import type { ManualSensorLog } from "@/lib/manualSensorChronologyDeltaRules";
import type { PlantRowLike } from "@/lib/aiDoctorContextCompiler";

export interface PlantDetailAiDoctorContextReadinessMountProps {
  plantId: string;
  growId: string | null;
  tentId: string | null;
  plantName?: string | null;
  strain?: string | null;
  stage?: string | null;
  /**
   * Optional pass-through for growing medium. The Plant Detail data
   * source (`useGrowPlant` / `plants` table) does NOT yet expose this
   * field — callers may thread it in when a future profile/metadata
   * source provides it. Never inferred from notes / strain / freeform.
   */
  medium?: string | null;
  /**
   * Optional pass-through for container / pot size. Same provenance
   * rules as `medium` — null when the underlying data source has no
   * value to surface.
   */
  potSize?: string | null;
}

function FallbackShell({
  testId,
  message,
}: {
  testId: string;
  message: string;
}) {
  return (
    <section
      data-testid={testId}
      className="glass rounded-2xl p-4 my-3 text-xs text-muted-foreground flex items-center gap-2"
    >
      <Activity className="h-4 w-4" aria-hidden="true" />
      {message}
    </section>
  );
}

export default function PlantDetailAiDoctorContextReadinessMount({
  plantId,
  growId,
  tentId,
  plantName,
  strain,
  stage,
}: PlantDetailAiDoctorContextReadinessMountProps) {
  const recentActivity = usePlantRecentActivity(plantId);
  const manualLogs = usePlantManualSensorLogs(plantId);
  const alerts = usePlantAssignedTentAlerts(tentId, growId);

  const isLoading = recentActivity.isLoading || manualLogs.isLoading;

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

  const built = useMemo(() => {
    try {
      const diary = (recentActivity.data ?? []) as readonly DiaryEntryRowLike[];
      const logs = (manualLogs.data ?? []) as readonly ManualSensorLogLike[];
      const context = buildPlantAiDoctorContext({
        plant: plantRow,
        diaryEntries: diary,
        manualSensorLogs: logs,
      });
      return { context, error: null as Error | null };
    } catch (e) {
      return {
        context: null,
        error: e instanceof Error ? e : new Error("Failed to compile AI Doctor context"),
      };
    }
  }, [plantRow, recentActivity.data, manualLogs.data]);

  // NOTE: All hooks below MUST be called unconditionally on every render.
  // Previously `useMemo(auditIdentity)` and `useCallback(openManualSensorEntry)`
  // lived AFTER the early returns for !plantId / isLoading / built.error,
  // which caused "Rendered more hooks than during the previous render."
  // when context flipped from missing/loading to available. Keep these
  // declarations above any conditional return.
  const auditIdentity = useMemo(
    () => ({
      plantId,
      plantName: plantName ?? null,
      growId,
      tentId,
      tentName: null as string | null,
    }),
    [plantId, plantName, growId, tentId],
  );

  const openManualSensorEntry = useCallback(
    (prefill: { plantId: string; growId: string; tentId: string }) => {
      if (typeof window === "undefined") return;
      window.dispatchEvent(
        new CustomEvent(PLANT_QUICKLOG_PREFILL_EVENT, { detail: prefill }),
      );
    },
    [],
  );

  if (!plantId) {
    return (
      <FallbackShell
        testId="plant-detail-ai-doctor-context-readiness-mount-empty"
        message="AI Doctor context is not available yet."
      />
    );
  }

  if (isLoading) {
    return (
      <FallbackShell
        testId="plant-detail-ai-doctor-context-readiness-mount-loading"
        message="Checking AI Doctor context…"
      />
    );
  }

  if (built.error || !built.context) {
    return (
      <FallbackShell
        testId="plant-detail-ai-doctor-context-readiness-mount-fallback"
        message="AI Doctor context is not available yet."
      />
    );
  }

  const auditLogs = (manualLogs.data ?? []) as ReadonlyArray<ManualSensorLog>;

  const safeOpenQuickLog =
    growId && tentId
      ? () =>
          openManualSensorEntry({
            plantId,
            growId,
            tentId,
          })
      : undefined;

  return (
    <div
      data-testid="plant-detail-ai-doctor-context-readiness-mount"
      className="my-3 space-y-2"
    >
      <AiDoctorContextReadinessPanel
        context={built.context}
        openAlertsCount={alerts.rows.length}
        quickActions={{
          // Watering / Feeding route into the existing QuickLog prefill
          // surface; the grower still confirms and saves. No writes here.
          onAddWatering: safeOpenQuickLog,
          onAddFeeding: safeOpenQuickLog,
          // Fast Add Photo and Add Sensor Snapshot have no safe single-
          // tap entry yet — leave undefined so the panel renders them
          // disabled with clear "coming soon" copy rather than inventing
          // a route.
        }}
      />
      <PlantSensorContextAuditPanel
        logs={auditLogs}
        identity={auditIdentity}
        onOpenManualSensorEntry={openManualSensorEntry}
      />
      <AiDoctorCheckInPreviewPanel context={built.context} />
    </div>
  );
}

