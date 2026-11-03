/**
 * Which grow a Plant or Tent detail page belongs to (grower report
 * 2026-11-03, item 18: same-name plants in two grows could not be told apart).
 *
 * Pure: no React, no Supabase. Never guesses a name: a grow id that the
 * loaded lists do not contain reads "unavailable", not the active grow.
 */

export const DETAIL_GROW_CONTEXT_COPY = {
  prefix: "Grow",
  none: "No grow assigned",
  unavailable: "Grow name unavailable",
  archived: "Archived",
} as const;

export interface GrowNameLike {
  id: string;
  name?: string | null;
}

export type DetailGrowContext =
  | { kind: "loading" }
  | { kind: "none" }
  | { kind: "unavailable" }
  | { kind: "named"; growId: string; name: string; archived: boolean };

export function resolveDetailGrowContext(input: {
  growId: string | null | undefined;
  grows: readonly GrowNameLike[] | null | undefined;
  archivedGrows?: readonly GrowNameLike[] | null;
  loading?: boolean;
}): DetailGrowContext {
  const growId = typeof input.growId === "string" ? input.growId.trim() : "";
  if (!growId) return { kind: "none" };
  const find = (list: readonly GrowNameLike[] | null | undefined) =>
    (list ?? []).find((g) => g?.id === growId);
  const active = find(input.grows);
  const archived = active ? undefined : find(input.archivedGrows);
  const match = active ?? archived;
  const name = typeof match?.name === "string" ? match.name.trim() : "";
  if (match && name) return { kind: "named", growId, name, archived: !active };
  if (!Array.isArray(input.grows) || input.loading) return { kind: "loading" };
  return { kind: "unavailable" };
}
