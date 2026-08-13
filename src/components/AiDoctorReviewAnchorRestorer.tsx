import DeepLinkAnchorRestorer from "@/components/DeepLinkAnchorRestorer";
import { PLANT_AI_DOCTOR_REVIEW_ANCHOR_ID } from "@/lib/plantDetailQuickActions";

/**
 * Re-applies the review deep link after asynchronous plant data mounts.
 * Navigation-only: no AI invocation, credit spend, persistence, or writes.
 * Bare test/preview mounts stay compatible when no Router is present.
 *
 * The mechanism is shared with other Plant Detail anchors — see
 * DeepLinkAnchorRestorer. This wrapper is kept as the named entry point for
 * the review anchor so call sites and their tests read unambiguously.
 */
export default function AiDoctorReviewAnchorRestorer() {
  return <DeepLinkAnchorRestorer anchorId={PLANT_AI_DOCTOR_REVIEW_ANCHOR_ID} />;
}
