/**
 * growAttributionRules — the single source of truth for "which grow does this
 * plant belong to?" (BUG-A, 2026-07-22).
 *
 * The schema stores BOTH plants.grow_id and tents.grow_id, and both are
 * legitimately nullable (grow deletion SET NULLs; tents/plants created
 * outside a grow context). Historically every reader resolved attribution
 * its own way — most looked ONLY at plants.grow_id, so a plant whose tent
 * belongs to a grow but whose own grow_id is null (the orphaned-tent case)
 * vanished from every grow-scoped surface while still counting in globals.
 *
 * Resolution order (deterministic):
 *   1. plant.grow_id  — the plant's own attribution always wins;
 *   2. tent.grow_id   — roll up through the plant's tent;
 *   3. null           — genuinely unassigned (must stay VISIBLE as
 *                       "Unassigned", never silently hidden).
 *
 * Pure: no I/O, no React, no Supabase.
 */

export interface AttributablePlant {
  readonly growId?: string | null;
  readonly tentId?: string | null;
}

export interface TentGrowSource {
  readonly id: string;
  readonly growId?: string | null;
}

/** tent id → tent's grow id (null preserved) for O(1) rollup lookups. */
export function buildTentGrowIndex(
  tents: ReadonlyArray<TentGrowSource> | null | undefined,
): ReadonlyMap<string, string | null> {
  const index = new Map<string, string | null>();
  for (const t of tents ?? []) {
    if (t && typeof t.id === "string" && t.id.length > 0) {
      index.set(t.id, t.growId ?? null);
    }
  }
  return index;
}

function cleanId(v: string | null | undefined): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v : null;
}

/**
 * Resolve a plant's grow id: own grow_id first, else the tent's, else null.
 * A missing tent index (or a tent the index doesn't know) never throws —
 * it just can't contribute a rollup.
 */
export function resolvePlantGrowId(
  plant: AttributablePlant | null | undefined,
  tentGrowById?: ReadonlyMap<string, string | null>,
): string | null {
  if (!plant) return null;
  const own = cleanId(plant.growId);
  if (own) return own;
  const tentId = cleanId(plant.tentId);
  if (tentId && tentGrowById) return cleanId(tentGrowById.get(tentId) ?? null);
  return null;
}

/** True when the plant resolves to no grow at all (the Unassigned bucket). */
export function isGrowUnassigned(
  plant: AttributablePlant | null | undefined,
  tentGrowById?: ReadonlyMap<string, string | null>,
): boolean {
  return resolvePlantGrowId(plant, tentGrowById) === null;
}

/** Plants that resolve (directly or via tent) to the given grow. */
export function filterPlantsByResolvedGrow<T extends AttributablePlant>(
  plants: ReadonlyArray<T> | null | undefined,
  growId: string,
  tentGrowById?: ReadonlyMap<string, string | null>,
): T[] {
  return (plants ?? []).filter((p) => resolvePlantGrowId(p, tentGrowById) === growId);
}

/**
 * PostgREST `.or(...)` filter resolving a grow's plants server-side:
 * the plant's own grow_id OR membership in one of the grow's tents.
 * Callers fetch the grow's tent ids first (tents.eq(grow_id)).
 * With no tent ids this degrades to the legacy own-grow_id filter.
 */
export function buildGrowScopedPlantsOrFilter(
  growId: string,
  tentIds: ReadonlyArray<string> | null | undefined,
): string {
  const clean = (tentIds ?? []).filter((t) => typeof t === "string" && t.length > 0);
  if (clean.length === 0) return `grow_id.eq.${growId}`;
  return `grow_id.eq.${growId},tent_id.in.(${clean.join(",")})`;
}
