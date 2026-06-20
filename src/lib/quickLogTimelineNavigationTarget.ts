/**
 * quickLogTimelineNavigationTarget — pure helper that maps a resolved
 * QuickLog v2 save scope (plant or tent) plus an optional saved event
 * id to a deterministic in-app navigation target for the "View in
 * Timeline" confirmation action.
 *
 * Hard constraints:
 *  - Pure. No React, no router imports, no DOM access, no I/O.
 *  - Never invents an entry id; falls back to the timeline SECTION
 *    anchor when no `growEventId` is supplied.
 *  - Never duplicates timeline business logic — only emits a
 *    {path, hash, href} record. The caller (sheet/toast) routes.
 *  - Stable anchor format: `timeline-entry-<id>` when an id exists,
 *    otherwise `timeline` for the section.
 */

export type QuickLogTimelineScopeType = "plant" | "tent";

export interface QuickLogTimelineNavScope {
  targetType: QuickLogTimelineScopeType | null | undefined;
  targetId: string | null | undefined;
  /** Saved diary/grow_event id returned by quicklog_save_manual, if any. */
  growEventId?: string | null;
}

export interface QuickLogTimelineNavTarget {
  /** Route path, e.g. `/plants/<id>`, `/tents/<id>`, or `/timeline`. */
  path: string;
  /** Fragment without the leading `#`. */
  hash: string;
  /** Convenience `path + "#" + hash`. */
  href: string;
}

const TIMELINE_SECTION_ANCHOR = "timeline";

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

export function buildQuickLogTimelineNavTarget(
  scope: QuickLogTimelineNavScope,
): QuickLogTimelineNavTarget {
  const hash = isNonEmptyString(scope?.growEventId)
    ? `timeline-entry-${scope.growEventId!.trim()}`
    : TIMELINE_SECTION_ANCHOR;

  let path = "/timeline";
  if (scope?.targetType === "plant" && isNonEmptyString(scope.targetId)) {
    path = `/plants/${scope.targetId.trim()}`;
  } else if (scope?.targetType === "tent" && isNonEmptyString(scope.targetId)) {
    path = `/tents/${scope.targetId.trim()}`;
  }

  return { path, hash, href: `${path}#${hash}` };
}

export const QUICK_LOG_TIMELINE_CTA_LABEL = "View in Timeline";
