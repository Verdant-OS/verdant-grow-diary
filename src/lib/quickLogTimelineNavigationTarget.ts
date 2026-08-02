/**
 * quickLogTimelineNavigationTarget — pure helper that maps a confirmed
 * Quick Log save into the canonical grow-scoped Timeline destination.
 *
 * Hard constraints:
 *  - Pure. No React, router, DOM, network, or persistence access.
 *  - A confirmed grow id is mandatory. Missing identity fails closed.
 *  - The global Timeline owns grow-scoped reads and async entry anchors.
 *  - Plant/tent query filters are additive context, never authorization.
 *  - No event id means no invented hash target.
 */

import { timelinePath } from "@/lib/routes";
import { buildTimelineEntryAnchorId } from "@/lib/timelineEntryAnchorRules";

export type QuickLogTimelineScopeType = "plant" | "tent";

export interface QuickLogTimelineNavScope {
  /** Server-verified grow that owns the saved record. */
  growId: string | null | undefined;
  targetType: QuickLogTimelineScopeType | null | undefined;
  targetId: string | null | undefined;
  /** Plant saves may preserve their verified tent as additive context. */
  tentId?: string | null;
  /** Saved grow_events id returned by the writer, when available. */
  growEventId?: string | null;
}

export interface QuickLogTimelineNavTarget {
  /** Canonical `/timeline?growId=...` path plus optional filters. */
  path: string;
  /** Fragment without `#`; blank when no real event id exists. */
  hash: string;
  /** Convenience path plus optional fragment. */
  href: string;
}

function normalizedId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function buildQuickLogTimelineNavTarget(
  scope: QuickLogTimelineNavScope,
): QuickLogTimelineNavTarget | null {
  const growId = normalizedId(scope?.growId);
  if (!growId) return null;

  const targetId = normalizedId(scope?.targetId);
  const tentId = normalizedId(scope?.tentId);
  const filters = new URLSearchParams();

  if (scope?.targetType === "plant" && targetId) {
    filters.set("plantId", targetId);
    if (tentId) filters.set("tentId", tentId);
  } else if (scope?.targetType === "tent" && targetId) {
    filters.set("tentId", targetId);
  } else if (tentId) {
    filters.set("tentId", tentId);
  }

  const filterQuery = filters.toString();
  const path = filterQuery ? `${timelinePath(growId)}&${filterQuery}` : timelinePath(growId);
  const hash = buildTimelineEntryAnchorId(scope?.growEventId) ?? "";
  return {
    path,
    hash,
    href: hash ? `${path}#${hash}` : path,
  };
}

export const QUICK_LOG_TIMELINE_CTA_LABEL = "View diary" as const;
