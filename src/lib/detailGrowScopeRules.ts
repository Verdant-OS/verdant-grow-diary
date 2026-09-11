/**
 * Shared grow-scope identity for plant/tent detail.
 *
 * URL/query `growId` is a scope claim. When it is present and does not match
 * the resolved entity's grow, the detail page must fail closed as not-found.
 * Missing or blank query growId is not a mismatch (existing contract).
 *
 * Pure helpers. No JSX, no network, no side effects.
 */

export type GrowScopedEntity = {
  growId?: unknown;
  grow_id?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function trimScopeId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function readEntityGrowId(entity?: unknown): string | null {
  if (!isRecord(entity)) return null;
  return trimScopeId(entity.growId ?? entity.grow_id);
}

/**
 * True when query growId is present and does not match the entity's grow.
 */
export function isQueryGrowScopeMismatch(entity: unknown, contextGrowId?: string | null): boolean {
  const requested = trimScopeId(contextGrowId);
  if (!requested) return false;
  return readEntityGrowId(entity) !== requested;
}
