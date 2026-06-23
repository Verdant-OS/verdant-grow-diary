/**
 * AlertsContextHeaderForGrow — data wrapper that loads tents, targets,
 * and latest snapshot for a single scoped grow, builds the operator
 * context view-model, and renders `AlertsContextHeader`.
 *
 * Read-only. Mirrors the safety contract of AlertsAutoPersistForGrow:
 *  - No writes. No automation. No device control.
 *  - Never claims persistence for non-persistable snapshots (the
 *    underlying view-model enforces this).
 *  - Only mounted when a single grow is in scope, keeping pages that
 *    aren't scoped free of TanStack Query dependencies.
 */
import { useMemo } from "react";
import AlertsContextHeader from "@/components/AlertsContextHeader";
import { useGrowTents } from "@/hooks/useGrowData";
import { useGrowTargets } from "@/hooks/useGrowTargets";
import { useLatestSensorSnapshot } from "@/hooks/useLatestSensorSnapshot";
import { buildAlertsHeaderContext } from "@/lib/alertFreshnessContext";

interface Props {
  growId: string;
  growName: string | null;
  stage: string | null;
}

export default function AlertsContextHeaderForGrow({
  growId,
  growName,
  stage,
}: Props) {
  const { data: tents = [] } = useGrowTents(growId);
  const tentIds = tents.map((t) => t.id);
  const sensorState = useLatestSensorSnapshot(growId, tentIds);
  const targetsState = useGrowTargets(growId);

  const vm = useMemo(
    () =>
      buildAlertsHeaderContext({
        growName,
        stage,
        targets: targetsState.status === "ok" ? targetsState.targets : null,
        snapshot: sensorState.status === "ok" ? sensorState.snapshot : null,
        status: sensorState.status,
      }),
    [
      growName,
      stage,
      targetsState.status,
      targetsState.targets,
      sensorState.status,
      sensorState.snapshot,
    ],
  );

  const freshnessArgs = {
    snapshot: sensorState.status === "ok" ? sensorState.snapshot : null,
    status: sensorState.status,
  } as const;

  return (
    <AlertsContextHeader vm={vm} growId={growId} freshnessArgs={freshnessArgs} />
  );
}
