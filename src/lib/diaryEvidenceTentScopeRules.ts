/**
 * diaryEvidenceTentScopeRules — pure tent attribution for diary-derived
 * environment evidence (#602).
 *
 * When a surface is scoped to one or more tents, diary rows with null or
 * foreign tent_id must not surface as that tent's evidence. Grow-scoped
 * views (empty tent list) still accept every grower-owned row.
 *
 * Pure. No I/O. No React. Deterministic.
 */

/**
 * True when a diary row may contribute evidence for the active tent scope.
 *
 * - Empty / missing tent scope → grow-scoped view; always allow.
 * - Non-empty tent scope → row.tent_id must be one of the scoped ids.
 *   Null tent_id fails closed (legacy unattributed rows stay out of
 *   tent-scoped cards; same policy as environment_check on PR #601).
 */
export function isDiaryRowInTentScope(
  rowTentId: string | null | undefined,
  tentIds: readonly string[] | null | undefined,
): boolean {
  if (!tentIds || tentIds.length === 0) return true;
  if (typeof rowTentId !== "string") return false;
  const id = rowTentId.trim();
  if (!id) return false;
  return tentIds.includes(id);
}
