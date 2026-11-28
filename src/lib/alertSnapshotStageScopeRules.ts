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
 *    in resolveAlertContextStage; resolveSnapshotStageScope only chooses its
 *    inputs.
 *  - resolveSnapshotAlertStage is the one path from a grow's rows and a
 *    confirmed snapshot to the stage. The Alerts header and the alerts it
 *    saves both call it, so the "Using <stage> targets" line names the stage
 *    the saved alert was judged by (Sour Diesel on #3021).
 *
 * Pure: no I/O, no React, no Supabase, no time.
 */
import { type AlertStagePlant, resolveGrowStagePlants } from "@/lib/alertPlantStageScopeRules";
import { resolveAlertContextStage } from "@/lib/alertStageResolution";

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

export interface SnapshotAlertStageInput {
  /** The grow the alerts belong to; null/undefined when none is known. */
  readonly growId: string | null | undefined;
  /** The grow row's stage. */
  readonly growStage: string | null | undefined;
  /** This grow's tents. */
  readonly tents: ReadonlyArray<SnapshotStageScopeTent>;
  /**
   * Active plants (any grow); the ones that resolve to growId vote. null =
   * read pending/failed; undefined = no plant signal.
   */
  readonly plants: ReadonlyArray<AlertStagePlant> | null | undefined;
  /** Tent of the confirmed snapshot; null when there is none or it spans tents. */
  readonly snapshotTentId: string | null | undefined;
}

/** The stage a confirmed reading's alerts are judged by, scoped to its tent. */
export function resolveSnapshotAlertStage(input: SnapshotAlertStageInput): string | null {
  const growStagePlants = input.growId
    ? resolveGrowStagePlants(input.plants, input.growId, input.tents)
    : input.plants;
  const scope = resolveSnapshotStageScope({
    snapshotTentId: input.snapshotTentId ?? null,
    tents: input.tents,
    plants: growStagePlants,
  });
  return resolveAlertContextStage({
    growStage: input.growStage,
    tentStages: scope.tentStages,
    plantStages: scope.plantStages ?? null,
  }).stage;
}

export interface TentAlertStageForViewInput {
  /** The grow the tent belongs to. */
  readonly growId: string | null | undefined;
  /**
   * The grow row, once the grows read has it; null/undefined while it is
   * unknown. Only its stage is read.
   */
  readonly growRow: { readonly stage?: string | null } | null | undefined;
  /** The tent whose open alerts are on screen. */
  readonly tentId: string | null | undefined;
  /** This grow's tents; null/undefined while the read is pending or failed. */
  readonly tents: ReadonlyArray<SnapshotStageScopeTent> | null | undefined;
  /**
   * The grow's active plants; null/undefined while the read is pending or
   * failed.
   */
  readonly plants: ReadonlyArray<AlertStagePlant> | null | undefined;
}

/**
 * The stage a tent's alerts are judged by now: the stage a confirmed reading
 * from that tent would be judged against, through the same helper the Alerts
 * page saves alerts with (resolveSnapshotAlertStage).
 *
 * Why (Reviewer C on #3021, round 3): a plant's own stage is not what its
 * tent's alerts were judged by. In a Veg tent that also holds a Flower plant
 * the plant vote abstains and Veg governs, so a Veg-range alert saved a
 * minute ago is current; comparing it with the Flower plant's stage said it
 * "may no longer apply". The staleness note compares with this stage instead.
 *
 * Never guess: null when the grow row, the tents or the plants are not read
 * yet, or the tent is not one of this grow's tents (the saved alert would
 * then have used grow-wide inputs, which this view cannot confirm).
 */
export function resolveTentAlertStageForView(input: TentAlertStageForViewInput): string | null {
  const growId =
    typeof input.growId === "string" && input.growId.trim() !== "" ? input.growId : null;
  const tentId =
    typeof input.tentId === "string" && input.tentId.trim() !== "" ? input.tentId : null;
  if (growId === null || tentId === null) return null;
  if (!input.growRow) return null;
  if (!Array.isArray(input.tents) || !Array.isArray(input.plants)) return null;
  if (!input.tents.some((t) => t.id === tentId)) return null;
  return resolveSnapshotAlertStage({
    growId,
    growStage: input.growRow.stage ?? null,
    tents: input.tents,
    plants: input.plants,
    snapshotTentId: tentId,
  });
}
