/**
 * alertSnapshotStageScopeRules — which tent and plant stages count toward the
 * stage an environment alert is judged against, once the reading's tent is
 * known.
 *
 * Why (field-notebook walk, 2026-11-19, friction item 1): the Alerts page
 * resolved ONE stage for the whole grow from every tent and every plant in
 * it. When plants in different tents sit at different stages, the plant
 * consensus abstains (alertStageResolution rule 3) and a stale grow row can
 * govern, so a reading from a tent holding a Flower plant could be judged
 * by seedling or veg bands. The reading comes from one tent; that tent and
 * the plants in it are what the alert is about.
 *
 * Rules:
 *  - The snapshot names a tent that belongs to this grow: only that tent's
 *    stage, the plants assigned to that tent, and the grow's plants with no
 *    tent (their place is unknown, so they keep their vote) count. Plants
 *    assigned to another tent of the grow do not.
 *  - The snapshot names no tent, or a tent outside this grow: unchanged
 *    grow-wide inputs (every tent, every plant), exactly as before.
 *  - `plantStages` null (read pending or failed) and undefined (no plant
 *    signal) pass through untouched so persistence keeps waiting.
 *  - Precedence (grow row, consensus, harvest cap, most advanced wins) stays
 *    in resolveAlertContextStage; this helper only chooses its inputs.
 *
 * Pure: no I/O, no React, no Supabase, no time.
 */

export interface SnapshotStageScopeTent {
  readonly id: string;
  readonly stage?: string | null;
}

export interface SnapshotStageScopePlant {
  readonly tent_id?: string | null;
  readonly stage?: string | null;
}

export interface SnapshotStageScopeInput {
  /** Tent the confirmed snapshot came from; null when it spans tents. */
  readonly snapshotTentId: string | null | undefined;
  /** This grow's tents. */
  readonly tents: ReadonlyArray<SnapshotStageScopeTent>;
  /**
   * Plants already attributed to this grow (resolveGrowPlantStages input
   * rows). null = read pending/failed; undefined = no plant signal.
   */
  readonly plants: ReadonlyArray<SnapshotStageScopePlant> | null | undefined;
}

export interface SnapshotStageScope {
  readonly tentStages: ReadonlyArray<string | null>;
  readonly plantStages: ReadonlyArray<string | null> | null | undefined;
  /** "tent" when scoped to the snapshot's tent, "grow" when grow-wide. */
  readonly scope: "tent" | "grow";
}

function isAssignedElsewhere(plantTentId: string | null | undefined, tentId: string): boolean {
  return typeof plantTentId === "string" && plantTentId.trim() !== "" && plantTentId !== tentId;
}

export function resolveSnapshotStageScope(input: SnapshotStageScopeInput): SnapshotStageScope {
  const tents = input.tents ?? [];
  const tentId =
    typeof input.snapshotTentId === "string" && input.snapshotTentId.trim() !== ""
      ? input.snapshotTentId
      : null;
  const scopedTent = tentId === null ? undefined : tents.find((t) => t.id === tentId);

  if (!scopedTent) {
    return {
      tentStages: tents.map((t) => t.stage ?? null),
      plantStages:
        input.plants === null || input.plants === undefined
          ? input.plants
          : input.plants.map((p) => p.stage ?? null),
      scope: "grow",
    };
  }

  return {
    tentStages: [scopedTent.stage ?? null],
    plantStages:
      input.plants === null || input.plants === undefined
        ? input.plants
        : input.plants
            .filter((p) => !isAssignedElsewhere(p.tent_id, scopedTent.id))
            .map((p) => p.stage ?? null),
    scope: "tent",
  };
}
