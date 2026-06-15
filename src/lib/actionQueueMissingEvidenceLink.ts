/**
 * Pure helper that picks the safest existing review-timeline route for an
 * Action Queue item whose evidence is missing. Used by the Action Detail
 * missing-evidence panels to offer a calm, review-only navigation hint.
 *
 * Safety:
 * - Uses only routes that already exist in the app.
 * - Never invents a route. Returns null when no safe context is available.
 * - Does not expose raw IDs in visible copy.
 * - Does not fetch, mutate, approve, or trigger automation.
 */

import { timelinePath } from "@/lib/routes";

export interface MissingEvidenceContext {
  grow_id?: string | null;
  tent_id?: string | null;
  plant_id?: string | null;
}

export interface MissingEvidenceReviewLink {
  to: string;
  label: string;
  helper: string;
  testId: string;
}

export const ACTION_EVIDENCE_REVIEW_LINK_LABEL = "Review timeline";
export const ACTION_EVIDENCE_REVIEW_LINK_HELPER =
  "Open the related diary or sensor history before approving.";

const isNonEmptyId = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

/**
 * Returns a safe review-timeline link tied to the action's grow context,
 * or null when no safe context exists. The diary timeline is grow-scoped
 * and already surfaces diary entries + sensor snapshots for manual review,
 * so it is the safest existing destination when evidence is missing.
 */
export function buildMissingEvidenceReviewLink(
  ctx: MissingEvidenceContext,
): MissingEvidenceReviewLink | null {
  if (!isNonEmptyId(ctx?.grow_id)) return null;
  return {
    to: timelinePath(ctx.grow_id),
    label: ACTION_EVIDENCE_REVIEW_LINK_LABEL,
    helper: ACTION_EVIDENCE_REVIEW_LINK_HELPER,
    testId: "action-detail-evidence-review-link",
  };
}
