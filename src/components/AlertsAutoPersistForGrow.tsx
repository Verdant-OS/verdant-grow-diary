/**
 * AlertsAutoPersistForGrow — mounts the existing
 * `usePersistEnvironmentAlerts` hook for one grow so that simply viewing
 * the Alerts page closes the loop:
 *
 *   manual / real sensor reading → derived breach → persisted alert row
 *
 * Background: previously only the Dashboard fired alert persistence, and
 * only when scoped via `?growId=`. Growers who entered a breaching manual
 * reading but never opened the Dashboard in scoped mode never saw alerts
 * appear. This component fixes the trigger coverage without changing any
 * persistence rules.
 *
 * Strict constraints (mirror usePersistEnvironmentAlerts):
 *   - No automation. No device control. No Action Queue writes.
 *   - Persistence happens only when the snapshot is real and valid.
 *   - Never sends a client `user_id`; RLS + DB defaults enforce ownership.
 *   - Renders nothing. Side-effect only.
 */
import { useGrowTents } from "@/hooks/useGrowData";
import { useLatestSensorSnapshot } from "@/hooks/useLatestSensorSnapshot";
import { useGrowTargets } from "@/hooks/useGrowTargets";
import { usePersistEnvironmentAlerts } from "@/hooks/usePersistEnvironmentAlerts";
import { evaluateSensorQuality } from "@/lib/sensorQuality";
import { compareSnapshotToTargets } from "@/lib/environmentTargetComparison";
import { resolveAlertContextStage } from "@/lib/alertStageResolution";

interface Props {
  growId: string | null | undefined;
  /** The grow row's stage. Persisted alerts evaluate against the stage
   * resolved from this PLUS the grow's tents' stages, so a stale
   * `grows.stage` cannot drive outdated stage bands (live audit #14). */
  stage?: string | null;
}

export default function AlertsAutoPersistForGrow({ growId, stage }: Props) {
  const safeGrowId = growId ?? null;
  const { data: tents = [] } = useGrowTents(safeGrowId ?? undefined);
  const tentIds = tents.map((t) => t.id);
  const sensorState = useLatestSensorSnapshot(safeGrowId, tentIds);
  const targetsState = useGrowTargets(safeGrowId);
  // Stage precedence lives in resolveAlertContextStage: grow stage + tent
  // stages, most advanced known stage wins on disagreement.
  const resolvedStage = resolveAlertContextStage({
    growStage: stage,
    tentStages: tents.map((t) => t.stage),
  }).stage;

  usePersistEnvironmentAlerts({
    growId: safeGrowId,
    snapshot: sensorState.status === "ok" ? sensorState.snapshot : null,
    quality: evaluateSensorQuality(
      sensorState.status === "ok" ? sensorState.snapshot : null,
    ),
    targets: compareSnapshotToTargets(
      sensorState.status === "ok" ? sensorState.snapshot : null,
      targetsState.status === "ok" ? targetsState.targets : null,
    ),
    enabled: !!safeGrowId,
    stage: resolvedStage,
  });

  return null;
}
