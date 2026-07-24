/**
 * Pure selection rules for authenticated grower tent surfaces.
 *
 * Persisted Supabase tent ids are UUIDs. Rejecting placeholder ids such as
 * `t1` prevents an old demo selection from becoming a real sensor query.
 */

import { isUuid } from "@/lib/isUuid";

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
  return isUuid(normalized) ? normalized : null;
}

/**
 * Preserve a valid current selection; otherwise choose the first valid UUID
 * in repository order. The repository's explicit ordering is product intent;
 * re-sorting UUIDs here would silently replace it with identifier order.
 * No valid persisted tent means no selection.
 */
export function resolveGrowTentSelection(input: ResolveGrowTentSelectionInput): string | null {
  const availableIds: string[] = [];
  const seen = new Set<string>();
  for (const tent of input.tents ?? []) {
    const id = normalizePersistedGrowTentId(tent?.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    availableIds.push(id);
  }

  if (availableIds.length === 0) return null;

  const currentTentId = normalizePersistedGrowTentId(input.currentTentId);
  if (currentTentId && availableIds.includes(currentTentId)) {
    return currentTentId;
  }

  return availableIds[0];
}
