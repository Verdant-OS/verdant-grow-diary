/**
 * Pure Timeline placement rules for public cultivar reference suggestions.
 *
 * A plant's `strain` remains free text. These helpers never link or write that
 * value; they only select one cautious, dismissible reference hint when the
 * free text is an exact confident match to a published cultivar.
 */
import { matchCultivarForStrain, type PlantCultivarHint } from "@/lib/plantCultivarHint";

export interface TimelineCultivarReferenceEntry {
  id?: unknown;
  plant_id?: unknown;
  entry_at?: unknown;
}

export interface TimelineCultivarReferencePlacement {
  entryId: string;
  plantId: string;
  strain: string;
  cultivar: PlantCultivarHint;
  entryAt: string;
}

/**
 * Build an owner-directory plant id → free-text strain lookup.
 *
 * A successful read with no usable strain values is an empty map. Invalid or
 * unavailable rows return null so callers can fail closed rather than infer
 * that an owner has no cultivar data.
 */
export function buildTimelinePlantStrainLookup(rows: unknown): ReadonlyMap<string, string> | null {
  if (!Array.isArray(rows)) return null;

  const lookup = new Map<string, string>();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const { id, strain } = row as { id?: unknown; strain?: unknown };
    if (typeof id !== "string" || id.trim() === "") continue;
    if (typeof strain !== "string" || strain.trim() === "") continue;
    const plantId = id.trim();
    if (!lookup.has(plantId)) lookup.set(plantId, strain.trim());
  }
  return lookup;
}

function compareText(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/**
 * Select at most one hint placement per plant from the caller's VISIBLE rows.
 *
 * The newest valid timestamp wins. Equal timestamps resolve to the
 * lexicographically smallest entry id, so pagination/filter ordering cannot
 * move the hint between cards. Invalid ids/timestamps, unavailable strain
 * lookup, blank strain text, and non-exact/unpublished matches are skipped.
 */
export function selectTimelineCultivarReferencePlacements(
  visibleEntries: readonly TimelineCultivarReferenceEntry[] | null | undefined,
  plantStrainsById: ReadonlyMap<string, string> | null | undefined,
): ReadonlyMap<string, TimelineCultivarReferencePlacement> {
  if (!Array.isArray(visibleEntries) || visibleEntries.length === 0 || !plantStrainsById) {
    return new Map();
  }

  const newestByPlant = new Map<
    string,
    TimelineCultivarReferencePlacement & { timestamp: number }
  >();

  for (const entry of visibleEntries) {
    if (!entry || typeof entry !== "object") continue;
    if (typeof entry.id !== "string" || entry.id.trim() === "") continue;
    if (typeof entry.plant_id !== "string" || entry.plant_id.trim() === "") continue;
    if (typeof entry.entry_at !== "string" || entry.entry_at.trim() === "") continue;

    const entryId = entry.id.trim();
    const plantId = entry.plant_id.trim();
    const entryAt = entry.entry_at.trim();
    const timestamp = Date.parse(entryAt);
    if (!Number.isFinite(timestamp)) continue;

    const rawStrain = plantStrainsById.get(plantId);
    if (typeof rawStrain !== "string" || rawStrain.trim() === "") continue;
    const strain = rawStrain.trim();
    const cultivar = matchCultivarForStrain(strain);
    if (!cultivar) continue;

    const candidate = { entryId, plantId, strain, cultivar, entryAt, timestamp };
    const current = newestByPlant.get(plantId);
    if (
      !current ||
      timestamp > current.timestamp ||
      (timestamp === current.timestamp && compareText(entryId, current.entryId) < 0)
    ) {
      newestByPlant.set(plantId, candidate);
    }
  }

  const ordered = [...newestByPlant.values()].sort(
    (a, b) =>
      b.timestamp - a.timestamp ||
      compareText(a.plantId, b.plantId) ||
      compareText(a.entryId, b.entryId),
  );

  return new Map(
    ordered.map(({ timestamp: _timestamp, ...placement }) => [placement.entryId, placement]),
  );
}
