/**
 * Pure helpers for the Dashboard "Latest Environment" card's multi-tent
 * selector.
 *
 * No I/O, no React, no Supabase.
 *
 * Selection contract:
 *  - "all"          → return every owned tent id (current default behavior).
 *  - "<tent-uuid>"  → return [that tent id] when it is in the owned set;
 *                     otherwise fall back to all owned tent ids so the card
 *                     never silently shows another tent's data under a
 *                     stale selection (e.g. tent archived since selection).
 */

export type TentSelection = "all" | string;

export interface SelectableTent {
  id: string;
  name: string;
}

/** Resolve the selection to the concrete tent ids the latest snapshot hook
 * should query. */
export function resolveSelectedTentIds(
  tents: readonly SelectableTent[],
  selection: TentSelection,
): string[] {
  const all = tents.map((t) => t.id);
  if (selection === "all") return all;
  return all.includes(selection) ? [selection] : all;
}

/** True when the current selection points at a tent that is no longer in
 * the owned set; UI should reset to "all". */
export function isSelectionOrphaned(
  tents: readonly SelectableTent[],
  selection: TentSelection,
): boolean {
  if (selection === "all") return false;
  return !tents.some((t) => t.id === selection);
}
