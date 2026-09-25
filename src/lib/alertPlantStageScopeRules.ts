/**
 * alertPlantStageScopeRules — which plants' stages count toward one grow's
 * alert stage (QA 2026-09-24, BUG-006; Codex review on #1683).
 *
 * A plant belongs to the grow the canonical growAttributionRules resolve:
 * its own grow_id first, else its tent's grow. A legacy plant with
 * `grow_id = null` in one of the grow's tents therefore counts; a plant
 * whose own grow_id names another grow never does, whatever tent it sits in.
 *
 * `null` plants means the plant read has not settled, or has failed, and is
 * passed through so persistence can wait for it. `undefined` means the caller
 * supplied no plant signal at all.
 *
 * Pure: no I/O, no React, no Supabase.
 */
import { buildTentGrowIndex, filterPlantsByResolvedGrow } from "@/lib/growAttributionRules";

export interface AlertStagePlant {
  readonly grow_id?: string | null;
  readonly tent_id?: string | null;
  readonly stage?: string | null;
}

export function resolveGrowPlantStages(
  plants: ReadonlyArray<AlertStagePlant> | null | undefined,
  growId: string,
  growTents: ReadonlyArray<{ readonly id: string }> | null | undefined,
): ReadonlyArray<string | null> | null | undefined {
  if (plants === undefined || plants === null) return plants;
  // growTents are this grow's tents, so each one rolls up to growId.
  const tentGrowById = buildTentGrowIndex((growTents ?? []).map((t) => ({ id: t.id, growId })));
  const attributable = plants.map((plant) => ({
    growId: plant.grow_id ?? null,
    tentId: plant.tent_id ?? null,
    stage: plant.stage ?? null,
  }));
  return filterPlantsByResolvedGrow(attributable, growId, tentGrowById).map((p) => p.stage);
}

/** A plant row as the Dashboard's grow-scoped read returns it. */
export interface SelectedTentStagePlant {
  readonly growId?: string | null;
  readonly tentId?: string | null;
  readonly stage?: string | null;
  readonly isArchived?: boolean | null;
}

/**
 * Stages of the active plants in the selected tents that resolve to `growId`.
 * The grow-scoped plant read also returns plants by tent, so a plant whose own
 * grow_id names another grow can sit in one of this grow's tents; the
 * canonical attribution leaves it out (Codex review on #1683).
 */
export function resolveSelectedTentPlantStages(
  plants: ReadonlyArray<SelectedTentStagePlant>,
  growId: string,
  growTents: ReadonlyArray<{ readonly id: string }>,
  selectedTentIds: ReadonlyArray<string>,
): Array<string | null> {
  const selected = new Set(selectedTentIds);
  const inSelection = plants
    .filter((p) => p.isArchived !== true && typeof p.tentId === "string" && selected.has(p.tentId))
    .map((p) => ({ grow_id: p.growId ?? null, tent_id: p.tentId ?? null, stage: p.stage ?? null }));
  return [...(resolveGrowPlantStages(inSelection, growId, growTents) ?? [])];
}

export interface ReadForAlertWrite<T> {
  readonly data?: ReadonlyArray<T> | null;
  readonly isError?: boolean;
  readonly isPlaceholderData?: boolean;
  readonly isFetching?: boolean;
}

/**
 * True only for a read whose rows are current: it succeeded, shows no
 * placeholder data, and no refetch is in flight. A failed refresh keeps
 * cached rows, and a refetch may be replacing stale ones; either can decide
 * a stage that the next rows contradict, and a persisted alert is not
 * removed when they arrive (Codex review on #1683). Display may still use
 * cached rows.
 */
export function isCurrentReadForAlertWrite<T>(query: ReadForAlertWrite<T>): boolean {
  return (
    query.isError !== true &&
    query.isPlaceholderData !== true &&
    query.isFetching !== true &&
    Array.isArray(query.data)
  );
}

/**
 * The plants that may decide a persisted alert stage: only those of a
 * current read (see isCurrentReadForAlertWrite). `null` holds persistence.
 */
export function plantsForAlertPersistence<T>(query: ReadForAlertWrite<T>): ReadonlyArray<T> | null {
  return isCurrentReadForAlertWrite(query) ? (query.data ?? null) : null;
}
