/**
 * quickLogTimelineNavigationTarget — pure helper for the post-save
 * Quick Log diary destination.
 *
 * A successful Quick Log belongs to a verified grow. This helper therefore
 * fails closed when that grow context is absent instead of sending the
 * grower to an ambiguous global Timeline. Target context only narrows the
 * existing Timeline view; it never changes what was saved.
 */

import { timelinePath } from "@/lib/routes";
import { buildTimelineEntryAnchorId } from "@/lib/timelineEntryAnchorRules";

export type QuickLogTimelineScopeType = "plant" | "tent";

export interface QuickLogTimelineNavScope {
  /** Verified grow id from the resolved Quick Log target. */
  growId: string | null | undefined;
  /** Existing selected-target shape used by Quick Log callers. */
  targetType?: QuickLogTimelineScopeType | null;
  targetId?: string | null;
  /** Optional explicit plant context; useful when a caller already has it. */
  plantId?: string | null;
  /** Optional explicit tent context; preserved alongside a plant context. */
  tentId?: string | null;
  /** Saved diary/grow-event id returned by the server, if one was returned. */
  growEventId?: string | null;
}

export interface QuickLogTimelineNavTarget {
  /** Canonical grow-scoped Timeline path, with optional target context. */
  path: string;
  /** Real saved-event fragment without `#`; null when no event id exists. */
  hash: string | null;
  /** Convenience path, optionally followed by the real event fragment. */
  href: string;
}

function nonBlankString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveTargetContext(scope: QuickLogTimelineNavScope): {
  plantId: string | null;
  tentId: string | null;
} {
  let plantId = nonBlankString(scope.plantId);
  let tentId = nonBlankString(scope.tentId);
  const targetId = nonBlankString(scope.targetId);

  if (scope.targetType === "plant" && targetId) {
    plantId = targetId;
  } else if (scope.targetType === "tent" && targetId) {
    tentId = targetId;
  }

  return { plantId, tentId };
}

function appendTargetContext(
  basePath: string,
  context: { plantId: string | null; tentId: string | null },
): string {
  const params: string[] = [];
  if (context.plantId) params.push(`plantId=${encodeURIComponent(context.plantId)}`);
  if (context.tentId) params.push(`tentId=${encodeURIComponent(context.tentId)}`);
  if (params.length === 0) return basePath;
  return `${basePath}${basePath.includes("?") ? "&" : "?"}${params.join("&")}`;
}

/**
 * Build the only valid post-save diary destination.
 *
 * A blank/missing grow id is intentionally not recoverable here: callers
 * receive `null` and must disable or omit their navigation CTA. No fallback
 * global Timeline link and no synthetic section fragment are emitted.
 */
export function buildQuickLogTimelineNavTarget(
  scope: QuickLogTimelineNavScope | null | undefined,
): QuickLogTimelineNavTarget | null {
  const growId = nonBlankString(scope?.growId);
  if (!growId || !scope) return null;

  const path = appendTargetContext(timelinePath(growId), resolveTargetContext(scope));
  // Reuse the Timeline's guarded anchor builder. An opaque server value is
  // not a valid fragment unless it can map to an actual Timeline entry id.
  const hash = buildTimelineEntryAnchorId(scope.growEventId);

  return {
    path,
    hash,
    href: hash ? `${path}#${hash}` : path,
  };
}

export const QUICK_LOG_TIMELINE_CTA_LABEL = "View diary";
