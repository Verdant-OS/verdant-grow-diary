/**
 * Pure selection rules for authenticated grower tent surfaces.
 *
 * Persisted Supabase tent ids are UUIDs. Rejecting placeholder ids such as
 * `t1` prevents an old demo selection from becoming a real sensor query.
 */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface GrowTentSelectionCandidate {
  id?: unknown;
}

export interface ResolveGrowTentSelectionInput {
  currentTentId?: unknown;
  tents?: readonly (GrowTentSelectionCandidate | null | undefined)[] | null;
}

/** Normalize a persisted tent UUID, or fail closed for placeholders/garbage. */
export function normalizePersistedGrowTentId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return UUID_PATTERN.test(normalized) ? normalized : null;
}

/**
 * Preserve a valid current selection; otherwise choose the lowest valid UUID.
 * Sorting makes the result stable even if an async query returns rows in a
 * different order. No valid persisted tent means no selection.
 */
export function resolveGrowTentSelection(
  input: ResolveGrowTentSelectionInput,
): string | null {
  const availableIds = Array.from(
    new Set(
      (input.tents ?? [])
        .map((tent) => normalizePersistedGrowTentId(tent?.id))
        .filter((id): id is string => id !== null),
    ),
  ).sort();

  if (availableIds.length === 0) return null;

  const currentTentId = normalizePersistedGrowTentId(input.currentTentId);
  if (currentTentId && availableIds.includes(currentTentId)) {
    return currentTentId;
  }

  return availableIds[0];
}
