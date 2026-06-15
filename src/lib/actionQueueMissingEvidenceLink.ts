/**
 * Pure helper that picks the safest existing review-timeline route for an
 * Action Queue item whose evidence is missing. Used by the Action Detail
 * missing-evidence panels to offer a calm, review-only navigation hint.
 *
 * Route preference (most specific first):
 *   1. Plant detail page — `plantDetailPath(plant_id)`. Plant detail renders
 *      PlantRelativeTimelineSection, ManualSnapshotTimelineSection,
 *      QuickLogGroupedTimelineSection and TimelineMemorySection scoped to
 *      the plant, so it is a safe, existing diary/sensor history surface.
 *   2. Tent detail page — `tentDetailPath(tent_id)`. Tent detail renders
 *      manual snapshot + grouped quick-log + timeline memory sections
 *      scoped to the tent, plus the tent sensor snapshot panel.
 *   3. Grow-scoped diary timeline — `timelinePath(grow_id)`. Existing
 *      fallback used before this refinement.
 *
 * Audit note: there is no plant-scoped or tent-scoped `/timeline` query
 * param today (Timeline.tsx only honors `?growId=`). The plant and tent
 * detail pages are the safest *existing* destinations for plant/tent
 * scoped review, so we route there instead of inventing new query params.
 *
 * Safety:
 * - Uses only routes that already exist in the app.
 * - Never invents a route. Returns null when no safe context is available.
 * - Does not expose raw IDs in visible copy (label/helper/scopeLabel).
 * - Does not fetch, mutate, approve, or trigger automation.
 */

import {
  plantDetailPath,
  tentDetailPath,
  timelinePath,
} from "@/lib/routes";

export interface MissingEvidenceContext {
  grow_id?: string | null;
  tent_id?: string | null;
  plant_id?: string | null;
}

export type MissingEvidenceReviewScope = "plant" | "tent" | "grow";

export interface MissingEvidenceReviewLink {
  to: string;
  label: string;
  helper: string;
  testId: string;
  scope: MissingEvidenceReviewScope;
  scopeLabel: string;
}

export const ACTION_EVIDENCE_REVIEW_LINK_LABEL = "Review timeline";
export const ACTION_EVIDENCE_REVIEW_LINK_ARIA_LABEL =
  "Review related diary timeline before approving";
export const ACTION_EVIDENCE_REVIEW_LINK_HELPER =
  "Open the related diary or sensor history before approving.";

export const ACTION_EVIDENCE_REVIEW_SCOPE_LABELS: Record<
  MissingEvidenceReviewScope,
  string
> = {
  plant: "Plant timeline",
  tent: "Tent timeline",
  grow: "Grow timeline",
};

const isNonEmptyId = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

/**
 * Returns the safest, most specific review-timeline link available for the
 * provided context, or null when no safe context exists.
 *
 * Preference order: plant → tent → grow. If a more specific id is missing
 * or invalid, we fall back to the next safe scope rather than producing a
 * broken link.
 */
export function buildMissingEvidenceReviewLink(
  ctx: MissingEvidenceContext,
): MissingEvidenceReviewLink | null {
  if (!ctx) return null;

  if (isNonEmptyId(ctx.plant_id)) {
    return {
      to: plantDetailPath(ctx.plant_id),
      label: ACTION_EVIDENCE_REVIEW_LINK_LABEL,
      helper: ACTION_EVIDENCE_REVIEW_LINK_HELPER,
      testId: "action-detail-evidence-review-link",
      scope: "plant",
      scopeLabel: ACTION_EVIDENCE_REVIEW_SCOPE_LABELS.plant,
    };
  }

  if (isNonEmptyId(ctx.tent_id)) {
    return {
      to: tentDetailPath(ctx.tent_id),
      label: ACTION_EVIDENCE_REVIEW_LINK_LABEL,
      helper: ACTION_EVIDENCE_REVIEW_LINK_HELPER,
      testId: "action-detail-evidence-review-link",
      scope: "tent",
      scopeLabel: ACTION_EVIDENCE_REVIEW_SCOPE_LABELS.tent,
    };
  }

  if (isNonEmptyId(ctx.grow_id)) {
    return {
      to: timelinePath(ctx.grow_id),
      label: ACTION_EVIDENCE_REVIEW_LINK_LABEL,
      helper: ACTION_EVIDENCE_REVIEW_LINK_HELPER,
      testId: "action-detail-evidence-review-link",
      scope: "grow",
      scopeLabel: ACTION_EVIDENCE_REVIEW_SCOPE_LABELS.grow,
    };
  }

  return null;
}
