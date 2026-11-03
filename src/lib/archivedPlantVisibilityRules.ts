/**
 * Pure helpers for archived / merged plant visibility.
 *
 * Plants are never hard-deleted. A merged plant is a plant where
 * `is_archived = true` AND `last_note` contains the merge marker
 * `Merged into <uuid>` emitted by the `merge_duplicate_plant` RPC.
 *
 * These helpers are read-path / UI filtering only. They do NOT:
 *   - mutate plants
 *   - rewrite `last_note`
 *   - call Supabase
 *   - change merge RPC behavior
 *   - touch sensors / pi-ingest / alerts / Action Queue
 */

export interface ArchivedPlantLike {
  id?: string | null;
  isArchived?: boolean | null;
  is_archived?: boolean | null;
  lastNote?: string | null;
  last_note?: string | null;
  /** True when the plant's grow is archived. The plant row itself may still be active. */
  growArchived?: boolean | null;
  growId?: string | null;
}

const MERGE_MARKER_RE = /Merged into ([0-9a-f-]{36})/i;

function readArchived(p: ArchivedPlantLike): boolean {
  return Boolean(p.isArchived ?? p.is_archived ?? false);
}

function readLastNote(p: ArchivedPlantLike): string {
  return String(p.lastNote ?? p.last_note ?? "");
}

export function isArchivedPlant(p: ArchivedPlantLike | null | undefined): boolean {
  if (!p) return false;
  return readArchived(p);
}

/**
 * True when the plant has the RPC-emitted merge marker in its last_note,
 * regardless of archive state. In practice the RPC always archives + marks
 * together; checking the marker independently makes the helper resilient
 * to legacy data.
 */
export function isMergedPlant(p: ArchivedPlantLike | null | undefined): boolean {
  if (!p) return false;
  return MERGE_MARKER_RE.test(readLastNote(p));
}

export function isGrowArchivedPlant(p: ArchivedPlantLike | null | undefined): boolean {
  if (!p) return false;
  return p.growArchived === true;
}

export function isActivePlant(p: ArchivedPlantLike | null | undefined): boolean {
  if (!p) return false;
  if (isArchivedPlant(p)) return false;
  if (isMergedPlant(p)) return false;
  if (isGrowArchivedPlant(p)) return false;
  return true;
}

export function withGrowArchiveVisibility<T extends ArchivedPlantLike>(
  plants: readonly T[],
  archivedGrowIds: ReadonlySet<string>,
  options: { tentGrowArchived?: boolean } = {},
): T[] {
  return plants.map((plant) => {
    const growId = plant.growId;
    const growArchived =
      options.tentGrowArchived === true ||
      plant.growArchived === true ||
      (typeof growId === "string" && archivedGrowIds.has(growId));
    return growArchived ? { ...plant, growArchived: true } : plant;
  });
}

export function filterActivePlants<T extends ArchivedPlantLike>(plants: readonly T[]): T[] {
  return plants.filter(isActivePlant);
}

export interface VisibilityOpts {
  showArchived?: boolean;
}

export function filterVisiblePlants<T extends ArchivedPlantLike>(
  plants: readonly T[],
  opts: VisibilityOpts = {},
): T[] {
  if (opts.showArchived) return plants.slice();
  return filterActivePlants(plants);
}

export function getActivePlantCount(plants: readonly ArchivedPlantLike[]): number {
  return filterActivePlants(plants).length;
}

export function shouldShowArchivedToggle(plants: readonly ArchivedPlantLike[]): boolean {
  return plants.some((p) => !isActivePlant(p));
}

export type ArchivedPlantLabelKind = "active" | "archived" | "merged";

export interface ArchivedPlantLabel {
  kind: ArchivedPlantLabelKind;
  /** Short chip label, e.g. "Archived" / "Merged". */
  label: string;
  /** Verbose grower-facing label. */
  verbose: string;
}

export function getArchivedPlantLabel(p: ArchivedPlantLike | null | undefined): ArchivedPlantLabel {
  if (!p) return { kind: "active", label: "", verbose: "" };
  const merged = isMergedPlant(p);
  const archived = isArchivedPlant(p);
  if (merged) {
    return {
      kind: "merged",
      label: "Merged",
      verbose: "Merged into another plant",
    };
  }
  if (archived || isGrowArchivedPlant(p)) {
    return {
      kind: "archived",
      label: "Archived",
      verbose: isGrowArchivedPlant(p) ? "Plant in an archived grow" : "Archived plant",
    };
  }
  return { kind: "active", label: "", verbose: "" };
}

/**
 * Extract the merge target plant id from `last_note`. Returns null if no
 * marker is present or the captured value is not a uuid.
 */
export function getMergeTargetPlantId(p: ArchivedPlantLike | null | undefined): string | null {
  if (!p) return null;
  const note = readLastNote(p);
  const m = note.match(MERGE_MARKER_RE);
  return m?.[1] ?? null;
}
