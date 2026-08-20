import { isUuid } from "@/lib/isUuid";

const TENT_DETAIL_PATH = /^\/tents\/([^/?#]+)\/?$/;
const PLANT_DETAIL_PATH = /^\/plants\/([^/?#]+)\/?$/;

export interface TentQuickLogTargetEvidence {
  tentId: string;
  soleActivePlantId: string | null;
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
  const match = TENT_DETAIL_PATH.exec(pathname);
  if (!match) return null;

  try {
    const tentId = decodeURIComponent(match[1]);
    if (!isUuid(tentId)) return null;

    // Tent Detail owns the active-plant query and publishes the same
    // sole-active-plant derivation used by its desktop FAB. Match the route
    // tent and validate both ids before becoming more specific. Missing,
    // loading, stale, multi-plant, or malformed evidence stays tent-scoped.
    const solePlantId = evidence?.tentId === tentId ? evidence.soleActivePlantId : null;
    return typeof solePlantId === "string" && isUuid(solePlantId)
      ? `plant:${solePlantId}`
      : `tent:${tentId}`;
  } catch {
    return null;
  }
}

/**
 * Resolve the plant id carried by a Plant Detail route for a one-shot legacy
 * Quick Log handoff. Only a real UUID is accepted; malformed or encoded-path
 * input fails closed before it can become a write target.
 */
export function resolvePlantQuickLogRouteTarget(pathname: unknown): string | null {
  if (typeof pathname !== "string") return null;
  const match = PLANT_DETAIL_PATH.exec(pathname);
  if (!match) return null;

  try {
    const plantId = decodeURIComponent(match[1]);
    return isUuid(plantId) ? plantId : null;
  } catch {
    return null;
  }
}
