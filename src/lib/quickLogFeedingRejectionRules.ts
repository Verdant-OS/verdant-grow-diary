import type { WriteFeedingFailureReason } from "./writeFeedingTypedEvent";
import { quickLogReasonToOperatorMessage } from "./quickLogSaveErrorMessage";

const PRE_RPC_REJECTIONS = new Set<WriteFeedingFailureReason>([
  "idempotency_key:invalid",
  "grow_id:missing",
  "line_id:missing",
  "products:not_array",
  "products:empty",
  "products:too_many",
  "products:contains_secret",
  "volume_ml:invalid",
  "numeric:not_finite",
  "occurred_at:invalid",
]);

/** A validation rejection: the same payload and key are refused on every resend. */
export type FeedingRejectionHistoryReason =
  | "rpc:invalid_typed_payload"
  | "idempotency_key:invalid"
  | "grow_id:missing"
  | "line_id:missing"
  | "products:not_array"
  | "products:empty"
  | "products:too_many"
  | "products:contains_secret"
  | "volume_ml:invalid"
  | "numeric:not_finite"
  | "occurred_at:invalid";

export const FEEDING_REJECTED_HISTORY_REVIEW =
  "Verdant rejected this restored Feeding, and an earlier attempt may already be saved. Check Timeline, then discard this draft before logging a corrected Feeding.";

export function isFeedingRejectionHistoryReason(
  reason: unknown,
): reason is FeedingRejectionHistoryReason {
  return (
    reason === "rpc:invalid_typed_payload" ||
    (typeof reason === "string" && PRE_RPC_REJECTIONS.has(reason as WriteFeedingFailureReason))
  );
}

/** A later rejection cannot disprove a commit from an earlier ambiguous attempt. */
export function mayCorrectRejectedFeeding(input: {
  reason: WriteFeedingFailureReason;
  priorClaim: boolean | null | undefined;
}): boolean {
  return input.priorClaim === false && isFeedingRejectionHistoryReason(input.reason);
}

/**
 * A validation rejection after a prior (or unknown) claim: same-key Retry is
 * refused again every time, so the draft needs Timeline review and discard.
 */
export function feedingRejectionNeedsHistoryCheck(input: {
  reason: WriteFeedingFailureReason;
  priorClaim: boolean | null | undefined;
}): boolean {
  return input.priorClaim !== false && isFeedingRejectionHistoryReason(input.reason);
}

/** Operator copy for a Feed draft locked for history review. */
export function feedingHistoryCheckMessage(reason: string | null | undefined): string {
  return isFeedingRejectionHistoryReason(reason)
    ? FEEDING_REJECTED_HISTORY_REVIEW
    : quickLogReasonToOperatorMessage(reason);
}
