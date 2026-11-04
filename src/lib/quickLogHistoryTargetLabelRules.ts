/**
 * Target label for a Quick Log history row ("Plant: X · Tent: Y"), so the
 * Timeline's Recent Quick Logs lane says which plant or tent each entry is
 * about (grower report 2026-11-03, item 17).
 *
 * Pure. Names come only from the loaded directories; an id they do not
 * contain reads "name unavailable" rather than a guessed name. While the
 * directories have not loaded, no label is shown.
 */

export const QUICK_LOG_ROW_TARGET_COPY = {
  plant: "Plant",
  tent: "Tent",
  unavailable: "name unavailable",
} as const;

export interface QuickLogTargetNameDirectory {
  plantNamesById: ReadonlyMap<string, string> | null;
  tentNamesById: ReadonlyMap<string, string> | null;
  /** Plant -> tent assignment, used when the row itself has no tent id. */
  plantTentIdsById?: ReadonlyMap<string, string> | null;
}

function part(
  kind: "plant" | "tent",
  id: string,
  names: ReadonlyMap<string, string> | null,
): string | null {
  if (!names) return null;
  const name = names.get(id)?.trim();
  return `${QUICK_LOG_ROW_TARGET_COPY[kind]}: ${name || QUICK_LOG_ROW_TARGET_COPY.unavailable}`;
}

export function resolveQuickLogRowTargetLabel(
  row: { plantId: string | null; tentId: string | null },
  directory: QuickLogTargetNameDirectory | null | undefined,
): string | null {
  if (!directory) return null;
  const plantId = row.plantId?.trim() || null;
  const tentId = row.tentId?.trim() || (plantId ? directory.plantTentIdsById?.get(plantId) : null);
  const parts = [
    plantId ? part("plant", plantId, directory.plantNamesById) : null,
    tentId ? part("tent", tentId, directory.tentNamesById) : null,
  ].filter((p): p is string => p !== null);
  return parts.length > 0 ? parts.join(" · ") : null;
}
