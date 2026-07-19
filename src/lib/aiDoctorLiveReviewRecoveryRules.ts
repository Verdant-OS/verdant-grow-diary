import type { AiCreditedFailureReason } from "@/lib/aiCreditedResponseAdapter";

/**
 * Decide whether the live-review surface may offer the grower a manual retry.
 *
 * A credit denial cannot recover by repeating the same request. Its recovery
 * path is the allowance reset or the plan guidance rendered by
 * `AiCreditLimitNotice`. Existing non-quota failures keep their manual retry;
 * those requests may succeed after a transient service or response failure.
 */
export function canRetryAiDoctorLiveReviewFailure(
  reason: AiCreditedFailureReason | null | undefined,
): boolean {
  if (reason == null || reason === "credit_denied") return false;

  return true;
}
