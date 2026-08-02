/**
 * quickLogTimelineNavigationTarget — pure helper that maps a confirmed
 * Quick Log save (verified grow + optional plant/tent filter + optional
 * saved event id) to a deterministic canonical Timeline destination for
 * the post-save "View diary" action.
 *
 * Hard constraints:
 *  - Pure. No React, no router imports, no DOM access, no I/O.
 *  - Always targets the global grow-scoped Timeline — never Plant Detail
 *    or Tent Detail. Only Timeline owns the async entry-anchor handoff.
 *  - Requires a verified growId. Missing/blank grow never produces an
 *    enabled destination (no bare `/timeline` after a confirmed save).
 *  - Never invents an entry id; omits the hash when no growEventId.
 *  - Same input always produces the same URL. IDs are URL-encoded.
 */

import { timelinePath } from "@/lib/routes";

export type QuickLogTimelineScopeType = "plant" | "tent";

export interface QuickLogTimelineNavScope {
  /** Verified grow the save was written against. Required for any CTA. */
  growId: string | null | undefined;
  /**
   * Optional plant filter. When omitted, derived from a plant target
   * (`targetType === "plant"` + `targetId`).
   */
  plantId?: string | null;
  /**
   * Optional tent filter. When omitted, derived from a tent target or
   * the companion `tentId` already known from the save.
   */
  tentId?: string | null;
  targetType?: QuickLogTimelineScopeType | null;
  targetId?: string | null;
  /** Saved grow_event id returned by the RPC, if any. */
  growEventId?: string | null;
}

export interface QuickLogTimelineNavTarget {
  /**
   * Route path including the grow-scoped query string, e.g.
   * `/timeline?growId=<id>&plantId=<id>`. Never Plant/Tent Detail.
   */
  path: string;
  /**
   * Fragment without the leading `#`. Empty when no event id is known
   * (no invented section anchor).
   */
  hash: string;
  /** Convenience `path` + optional `#` + `hash`. */
  href: string;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function resolvePlantId(scope: QuickLogTimelineNavScope): string | null {
  if (isNonEmptyString(scope.plantId)) return scope.plantId.trim();
  if (scope.targetType === "plant" && isNonEmptyString(scope.targetId)) {
    return scope.targetId.trim();
  }
  return null;
}

function resolveTentId(scope: QuickLogTimelineNavScope): string | null {
  if (isNonEmptyString(scope.tentId)) return scope.tentId.trim();
  if (scope.targetType === "tent" && isNonEmptyString(scope.targetId)) {
    return scope.targetId.trim();
  }
  return null;
}

/**
 * Build the canonical post-save Timeline destination.
 * Returns `null` when growId is missing/blank so callers disable the CTA
 * instead of emitting an unscoped or entity-detail fallback.
 */
export function buildQuickLogTimelineNavTarget(
  scope: QuickLogTimelineNavScope,
): QuickLogTimelineNavTarget | null {
  if (!isNonEmptyString(scope?.growId)) return null;

  const growId = scope.growId.trim();
  const plantId = resolvePlantId(scope);
  const tentId = resolveTentId(scope);

  // timelinePath encodes growId; append optional filters in fixed order
  // so identical inputs always produce the same URL.
  let path = timelinePath(growId);
  if (plantId) path += `&plantId=${encodeURIComponent(plantId)}`;
  if (tentId) path += `&tentId=${encodeURIComponent(tentId)}`;

  const hash = isNonEmptyString(scope.growEventId)
    ? `timeline-entry-${scope.growEventId.trim()}`
    : "";

  return {
    path,
    hash,
    href: hash ? `${path}#${hash}` : path,
  };
}

/** Primary post-save / toast CTA label (grower-facing). */
export const QUICK_LOG_TIMELINE_CTA_LABEL = "View diary";
