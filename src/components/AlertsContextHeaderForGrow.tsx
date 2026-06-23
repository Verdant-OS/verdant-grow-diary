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
import { useTemperatureUnitPreference } from "@/hooks/useTemperatureUnitPreference";

interface Props {
  growId: string;
  growName: string | null;
  stage: string | null;
  /** When true, shows a small "Showing alert context for X" note so the
   * operator can tell the header is using a fallback grow, not the one
   * in the URL. */
  isFallback?: boolean;
}

export default function AlertsContextHeaderForGrow({
  growId,
  growName,
  stage,
  isFallback = false,
}: Props) {
  const { data: tents = [] } = useGrowTents(growId);
  const tentIds = tents.map((t) => t.id);
  const sensorState = useLatestSensorSnapshot(growId, tentIds);
  const targetsState = useGrowTargets(growId);
  const tempUnit = useTemperatureUnitPreference();

  const vm = useMemo(
    () =>
      buildAlertsHeaderContext({
        growName,
        stage,
        targets: targetsState.status === "ok" ? targetsState.targets : null,
        snapshot: sensorState.status === "ok" ? sensorState.snapshot : null,
        status: sensorState.status,
        tempUnit,
      }),
    [
      growName,
      stage,
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
    />
  );
}
