import { isUuid } from "@/lib/isUuid";

const TENT_DETAIL_PATH = /^\/tents\/([^/?#]+)\/?$/;
const PLANT_DETAIL_PATH = /^\/plants\/([^/?#]+)\/?$/;

export type QuickLogDetailRouteIdentity = `plant:${string}` | `tent:${string}`;

export interface TentQuickLogTargetEvidence {
  tentId: string;
  soleActivePlantId: string | null;
}

function resolveDetailRouteId(pathname: string, pattern: RegExp): string | null {
  const match = pattern.exec(pathname);
  if (!match) return null;

  try {
    const id = decodeURIComponent(match[1]);
    return isUuid(id) ? id : null;
  } catch {
    return null;
  }
}

/**
 * Return the authenticated detail resource named by the pathname.
 *
 * Query-string refinements are intentionally absent: React Router exposes
 * them separately from `pathname`, and they must not invalidate a grower's
 * already-open Quick Log draft. A different detail UUID, however, means the
 * frozen target belongs to a different resource and is no longer safe.
 */
export function resolveQuickLogDetailRouteIdentity(
  pathname: unknown,
): QuickLogDetailRouteIdentity | null {
  if (typeof pathname !== "string") return null;

  const plantId = resolveDetailRouteId(pathname, PLANT_DETAIL_PATH);
  if (plantId) return `plant:${plantId}`;

  const tentId = resolveDetailRouteId(pathname, TENT_DETAIL_PATH);
  return tentId ? `tent:${tentId}` : null;
}

/** A frozen launch target is stale whenever its authenticated detail changes. */
export function didQuickLogDetailRouteChange(
  previous: QuickLogDetailRouteIdentity | null,
  next: QuickLogDetailRouteIdentity | null,
): boolean {
  return previous !== null && next !== null && previous !== next;
}

/**
 * Resolve the mobile Quick Log target from an authenticated route.
 *
 * Tent detail is the only route that currently guarantees enough context for
 * a tent-scoped V2 log. Invalid/demo ids fail closed so they can never flow
 * into UUID-backed writes; the existing unscoped Quick Log remains the
 * fallback everywhere else.
 */
export function resolveMobileQuickLogTarget(
  pathname: unknown,
  evidence: TentQuickLogTargetEvidence | null = null,
): string | null {
  if (typeof pathname !== "string") return null;
  const tentId = resolveDetailRouteId(pathname, TENT_DETAIL_PATH);
  if (!tentId) return null;

  // Tent Detail owns the active-plant query and publishes the same
  // sole-active-plant derivation used by its desktop FAB. Match the route
  // tent and validate both ids before becoming more specific. Missing,
  // loading, stale, multi-plant, or malformed evidence stays tent-scoped.
  const solePlantId = evidence?.tentId === tentId ? evidence.soleActivePlantId : null;
  return typeof solePlantId === "string" && isUuid(solePlantId)
    ? `plant:${solePlantId}`
    : `tent:${tentId}`;
}

/**
 * Resolve the plant id carried by a Plant Detail route for a one-shot legacy
 * Quick Log handoff. Only a real UUID is accepted; malformed or encoded-path
 * input fails closed before it can become a write target.
 */
export function resolvePlantQuickLogRouteTarget(pathname: unknown): string | null {
  if (typeof pathname !== "string") return null;
  return resolveDetailRouteId(pathname, PLANT_DETAIL_PATH);
}
