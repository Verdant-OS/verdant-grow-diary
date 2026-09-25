/**
 * AlertsContextHeaderForGrow — data wrapper that loads tents, targets,
 * and latest snapshot for a single grow (scoped or fallback), builds the
 * operator context view-model, and renders `AlertsContextHeader`.
 *
 * Read-only. Mirrors the safety contract of AlertsAutoPersistForGrow:
 *  - No writes. No automation. No device control.
 *  - Never claims persistence for non-persistable snapshots (the
 *    underlying view-model enforces this).
 *  - Temperature ranges are displayed in the operator's preferred unit
 *    via `convertCelsiusForDisplay`.
 */
import { useMemo } from "react";
import AlertsContextHeader from "@/components/AlertsContextHeader";
import { useGrowTents } from "@/hooks/useGrowData";
import { useGrowTargets } from "@/hooks/useGrowTargets";
import { useLatestSensorSnapshot } from "@/hooks/useLatestSensorSnapshot";
import { buildAlertsHeaderContext } from "@/lib/alertFreshnessContext";
import { buildSensorSnapshotReadState } from "@/lib/sensorSnapshotReadStateRules";
import { resolveAlertContextStage } from "@/lib/alertStageResolution";
import { type AlertStagePlant, resolveGrowPlantStages } from "@/lib/alertPlantStageScopeRules";
import { useTemperatureUnitPreference } from "@/hooks/useTemperatureUnitPreference";

interface Props {
  growId: string;
  growName: string | null;
  /** The grow row's stage. The rendered header stage is resolved from this
   * PLUS the grow's tents' stages via `resolveAlertContextStage`, so a
   * stale `grows.stage` cannot claim outdated targets (live audit #14). */
  stage: string | null;
  /**
   * Active plants (any grow). The ones that resolve to this grow, by their own
   * grow_id or else through one of this grow's tents, add their stages; see
   * resolveAlertContextStage rule 8. `null` while the plant read is pending.
   */
  plants?: ReadonlyArray<AlertStagePlant> | null;
  /** When true, shows a small "Showing alert context for X" note so the
   * operator can tell the header is using a fallback grow, not the one
   * in the URL. */
  isFallback?: boolean;
  /** True when the relevant grow already has at least one open alert.
   * Drives the duplicate-prevention reassurance banner. */
  hasOpenAlerts?: boolean;
}

export default function AlertsContextHeaderForGrow({
  growId,
  growName,
  stage,
  plants,
  isFallback = false,
  hasOpenAlerts = false,
}: Props) {
  const { data: tents = [] } = useGrowTents(growId);
  const tentIds = tents.map((t) => t.id);
  const sensorState = useLatestSensorSnapshot(growId, tentIds);
  const targetsState = useGrowTargets(growId);
  const tempUnit = useTemperatureUnitPreference();
  // Stage precedence lives in resolveAlertContextStage: grow stage + tent
  // stages, most advanced known stage wins on disagreement.
  const resolvedStage = useMemo(
    () =>
      resolveAlertContextStage({
        growStage: stage,
        tentStages: tents.map((t) => t.stage),
        plantStages: resolveGrowPlantStages(plants, growId, tents) ?? null,
      }).stage,
    [stage, tents, plants, growId],
  );

  const snapshotReadState = buildSensorSnapshotReadState(sensorState);
  const confirmedSnapshot = snapshotReadState.confirmedSnapshot;
  const headerStatus =
    sensorState.status === "unavailable"
      ? "unavailable"
      : confirmedSnapshot
        ? "ok"
        : snapshotReadState.pendingNotice
          ? "loading"
          : sensorState.status;

  const vm = useMemo(
    () =>
      buildAlertsHeaderContext({
        growName,
        stage: resolvedStage,
        targets: targetsState.status === "ok" ? targetsState.targets : null,
        snapshot: confirmedSnapshot,
        status: headerStatus,
        tempUnit,
      }),
    [
      growName,
      resolvedStage,
      targetsState.status,
      targetsState.targets,
      confirmedSnapshot,
      headerStatus,
      tempUnit,
    ],
  );

  const freshnessArgs = {
    snapshot: confirmedSnapshot,
    status: headerStatus,
  } as const;

  return (
    <AlertsContextHeader
      vm={vm}
      growId={growId}
      freshnessArgs={freshnessArgs}
      isFallback={isFallback}
      hasOpenAlerts={hasOpenAlerts}
    />
  );
}
