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
  const tentsQuery = useGrowTents(safeGrowId ?? undefined);
  const tents = tentsQuery.data ?? [];
  // Persistence is gated on the tent read having SETTLED (success or
  // error): while the query is pending, `tents` is a placeholder empty
  // array and the resolver would fall back to the grow row alone — an
  // alert persisted against a stale grow stage in that window would not
  // be removed when the tent stages arrive. After an error, proceeding
  // with the grow row alone matches the pre-resolver behavior.
  const tentsSettled = tentsQuery.isFetched;
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
    enabled: !!safeGrowId && tentsSettled,
    stage: resolvedStage,
  });

  return null;
}
