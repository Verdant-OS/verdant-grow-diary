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
import { buildSensorSnapshotReadState } from "@/lib/sensorSnapshotReadStateRules";

interface Props {
  growId: string | null | undefined;
  /** The grow row's stage. Persisted alerts evaluate against the stage
   * resolved from this PLUS the grow's tents' stages, so a stale
   * `grows.stage` cannot drive outdated stage bands (live audit #14). */
  stage?: string | null;
  /**
   * Stages of the grow's active plants (QA 2026-09-24, BUG-006). `null`
   * means the plant read has not settled: persistence waits, as it does for
   * tents. Omitted keeps the grow + tent resolution.
   */
  plantStages?: ReadonlyArray<string | null> | null;
}

export default function AlertsAutoPersistForGrow({ growId, stage, plantStages }: Props) {
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
  const snapshot = buildSensorSnapshotReadState(sensorState).confirmedSnapshot;
  const targetsState = useGrowTargets(safeGrowId);
  // Stage precedence lives in resolveAlertContextStage: grow stage + tent
  // stages, most advanced known stage wins on disagreement.
  const resolvedStage = resolveAlertContextStage({
    growStage: stage,
    tentStages: tents.map((t) => t.stage),
    plantStages: plantStages ?? null,
  }).stage;
  const plantsSettled = plantStages !== null;

  usePersistEnvironmentAlerts({
    growId: safeGrowId,
    // Attribution rides on the snapshot, so it always describes the same
    // evidence the alert was derived from. Null when that evidence spans
    // tents (this component scopes every tent in the grow).
    tentId: snapshot ? (snapshot.tent_id ?? null) : null,
    snapshot,
    quality: evaluateSensorQuality(snapshot),
    targets: compareSnapshotToTargets(
      snapshot,
      targetsState.status === "ok" ? targetsState.targets : null,
    ),
    enabled: !!safeGrowId && tentsSettled && plantsSettled,
    stage: resolvedStage,
  });

  return null;
}
