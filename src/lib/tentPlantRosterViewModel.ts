/**
 * Tent Plant Roster — pure view-model.
 *
 * Read-only foundation for Multi-Plant Tent Monitoring v0.
 *
 * Responsibilities:
 * - Group plants by a selected tent.
 * - Project a stable, presenter-ready row per plant (name, strain, stage,
 *   latest diary/log date if available, latest photo indicator if available,
 *   Harvest Watch public state if already safely available, Plant Detail
 *   link path).
 * - Surface explicit copy for shared tent environment and tent-level sensor
 *   context labels.
 * - Never invent data. Missing fields stay null/false. Unknown tent/plant
 *   relationship resolves to an explicit "unknown" state — never silently
 *   treated as "empty".
 *
 * Safety:
 * - No Supabase writes, AI/model calls, alerts, Action Queue writes, or
 *   device control imports. Pure, deterministic, null-safe.
 */

import { plantDetailPath } from "@/lib/routes";

export type TentPlantRosterStage =
  | "seedling"
  | "veg"
  | "flower"
  | "flush"
  | "harvest"
  | "cure"
  | null;

export interface TentPlantRosterPlantInput {
  id: string;
  name?: string | null;
  strain?: string | null;
  stage?: TentPlantRosterStage;
  tentId?: string | null;
  isArchived?: boolean | null;
  /** ISO timestamp of latest diary/log entry, if safely available. */
  latestLogAt?: string | null;
  /** True only if a recent photo is known to exist. */
  hasRecentPhoto?: boolean | null;
  /**
   * Already-computed Harvest Watch public state label, when safely available
   * from elsewhere. Do NOT recompute Harvest Watch here.
   */
  harvestWatchPublicState?: string | null;
}

export interface TentPlantRosterInput {
  tentId: string | null | undefined;
  plants: ReadonlyArray<TentPlantRosterPlantInput> | null | undefined;
  /**
   * Indicates whether the plant-to-tent relationship is known/loaded.
   * Pass false to render the "relationship unavailable" state.
   * Defaults to true.
   */
  relationshipKnown?: boolean;
  /**
   * Optional tent-level sensor context label, when already labeled upstream
   * (e.g. "Live", "Manual", "Stale"). Roster will display it as tent-level.
   */
  tentSensorContextLabel?: string | null;
  /** When true, archived plants are included; defaults to false. */
  includeArchived?: boolean;
}

export interface TentPlantRosterRow {
  id: string;
  name: string;
  strain: string | null;
  stage: TentPlantRosterStage;
  latestLogAt: string | null;
  hasRecentPhoto: boolean;
  harvestWatchPublicState: string | null;
  /** Always provided — falls back to canonical Harvest Watch handoff copy. */
  harvestWatchFallbackCopy: string;
  plantDetailHref: string;
}

export type TentPlantRosterState =
  | "loaded"
  | "empty"
  | "unknown-relationship";

export interface TentPlantRosterViewModel {
  state: TentPlantRosterState;
  tentId: string | null;
  rows: ReadonlyArray<TentPlantRosterRow>;
  sharedEnvironmentCopy: string;
  tentSensorContextLabel: string | null;
  /** Always present so presenters can label any tent-level sensor context. */
  tentSensorContextNote: string;
  emptyCopy: string | null;
  unknownRelationshipCopy: string | null;
}

export const TENT_PLANT_ROSTER_SHARED_ENVIRONMENT_COPY =
  "Tent environment is shared. Plant response is tracked per plant.";

export const TENT_PLANT_ROSTER_TENT_SENSOR_CONTEXT_NOTE =
  "Tent-level sensor context";

export const TENT_PLANT_ROSTER_EMPTY_COPY =
  "No plants assigned to this tent yet.";

export const TENT_PLANT_ROSTER_UNKNOWN_RELATIONSHIP_COPY =
  "Plant-to-tent relationship is unavailable.";

export const TENT_PLANT_ROSTER_HARVEST_WATCH_FALLBACK_COPY =
  "Harvest Watch available on Plant Detail";

function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function normalizeStage(value: unknown): TentPlantRosterStage {
  if (typeof value !== "string") return null;
  switch (value) {
    case "seedling":
    case "veg":
    case "flower":
    case "flush":
    case "harvest":
    case "cure":
      return value;
    default:
      return null;
  }
}

function compareRows(a: TentPlantRosterRow, b: TentPlantRosterRow): number {
  const an = a.name.toLocaleLowerCase();
  const bn = b.name.toLocaleLowerCase();
  if (an < bn) return -1;
  if (an > bn) return 1;
  // deterministic tiebreaker
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

export function buildTentPlantRosterViewModel(
  input: TentPlantRosterInput,
): TentPlantRosterViewModel {
  const tentId = normalizeString(input.tentId);
  const relationshipKnown = input.relationshipKnown !== false;
  const includeArchived = input.includeArchived === true;

  if (!relationshipKnown) {
    return {
      state: "unknown-relationship",
      tentId,
      rows: [],
      sharedEnvironmentCopy: TENT_PLANT_ROSTER_SHARED_ENVIRONMENT_COPY,
      tentSensorContextLabel: null,
      tentSensorContextNote: TENT_PLANT_ROSTER_TENT_SENSOR_CONTEXT_NOTE,
      emptyCopy: null,
      unknownRelationshipCopy: TENT_PLANT_ROSTER_UNKNOWN_RELATIONSHIP_COPY,
    };
  }

  const plants = Array.isArray(input.plants) ? input.plants : [];

  const rows: TentPlantRosterRow[] = [];
  for (const raw of plants) {
    if (!raw || typeof raw !== "object") continue;
    const id = normalizeString(raw.id);
    if (!id) continue;
    const plantTentId = normalizeString(raw.tentId);
    if (!tentId || plantTentId !== tentId) continue;
    if (!includeArchived && raw.isArchived === true) continue;

    rows.push({
      id,
      name: normalizeString(raw.name) ?? "Unnamed plant",
      strain: normalizeString(raw.strain),
      stage: normalizeStage(raw.stage),
      latestLogAt: normalizeString(raw.latestLogAt),
      hasRecentPhoto: raw.hasRecentPhoto === true,
      harvestWatchPublicState: normalizeString(raw.harvestWatchPublicState),
      harvestWatchFallbackCopy: TENT_PLANT_ROSTER_HARVEST_WATCH_FALLBACK_COPY,
      plantDetailHref: plantDetailPath(id),
    });
  }

  rows.sort(compareRows);

  const sensorLabel = normalizeString(input.tentSensorContextLabel);

  if (rows.length === 0) {
    return {
      state: "empty",
      tentId,
      rows: [],
      sharedEnvironmentCopy: TENT_PLANT_ROSTER_SHARED_ENVIRONMENT_COPY,
      tentSensorContextLabel: sensorLabel,
      tentSensorContextNote: TENT_PLANT_ROSTER_TENT_SENSOR_CONTEXT_NOTE,
      emptyCopy: TENT_PLANT_ROSTER_EMPTY_COPY,
      unknownRelationshipCopy: null,
    };
  }

  return {
    state: "loaded",
    tentId,
    rows,
    sharedEnvironmentCopy: TENT_PLANT_ROSTER_SHARED_ENVIRONMENT_COPY,
    tentSensorContextLabel: sensorLabel,
    tentSensorContextNote: TENT_PLANT_ROSTER_TENT_SENSOR_CONTEXT_NOTE,
    emptyCopy: null,
    unknownRelationshipCopy: null,
  };
}
