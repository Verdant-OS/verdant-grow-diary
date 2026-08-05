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
import { resolveAlertContextStage } from "@/lib/alertStageResolution";
import { useTemperatureUnitPreference } from "@/hooks/useTemperatureUnitPreference";

interface Props {
  growId: string;
  growName: string | null;
  /** The grow row's stage. The rendered header stage is resolved from this
   * PLUS the grow's tents' stages via `resolveAlertContextStage`, so a
   * stale `grows.stage` cannot claim outdated targets (live audit #14). */
  stage: string | null;
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
      }).stage,
    [stage, tents],
  );

  const vm = useMemo(
    () =>
      buildAlertsHeaderContext({
        growName,
        stage: resolvedStage,
        targets: targetsState.status === "ok" ? targetsState.targets : null,
        snapshot: sensorState.status === "ok" ? sensorState.snapshot : null,
        status: sensorState.status,
        tempUnit,
      }),
    [
      growName,
      resolvedStage,
      targetsState.status,
      targetsState.targets,
      sensorState.status,
      sensorState.snapshot,
      tempUnit,
    ],
  );

  const freshnessArgs = {
    snapshot: sensorState.status === "ok" ? sensorState.snapshot : null,
    status: sensorState.status,
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
