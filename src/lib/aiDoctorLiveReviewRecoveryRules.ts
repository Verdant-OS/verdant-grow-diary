import type { AiCreditedFailureReason } from "@/lib/aiCreditedResponseAdapter";

/** Stable identity for frozen review/recovery state across route-scope changes. */
export function buildAiDoctorLiveReviewScopeKey(
  plantId: string,
  tentId: string | null | undefined,
  growId: string | null | undefined,
): string {
  return `${growId || "no-grow"}:${tentId || "no-tent"}:${plantId}`;
}

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

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const EXPLICIT_TERMINAL_AI_DOCTOR_REASONS = [
  "config",
  "http",
  "timeout",
  "parse",
  "empty",
  "shape",
  "credit_denied",
  "upstream_credit_exhausted",
  "result_recording_failed",
] as const satisfies readonly AiCreditedFailureReason[];

/**
 * Retain a request UUID only when repeating the same logical request cannot
 * safely be distinguished from replaying a response the server may already
 * have produced. Confirmed terminal server failures retire the UUID; a manual
 * retry (when offered) must mint a fresh one.
 */
export function shouldReuseAiDoctorReviewIdempotencyKeyAfterResponse(
  response: unknown,
  reason: AiCreditedFailureReason,
): boolean {
  if (reason === "result_pending") return true;

  if (isPlainRecord(response) && response.ok === false) {
    const rawReason = response.reason;
    if (rawReason === "result_pending") return true;

    // Only reasons understood by this deployed client can prove a terminal
    // server outcome. A missing/newer reason is transport-contract ambiguous:
    // preserve the key so retry cannot accidentally create another spend.
    // `invalid` also stays ambiguous across rollout: the previous Edge returns
    // it for a resultless same-key replay after a successful response was lost.
    return !(
      typeof rawReason === "string" &&
      (EXPLICIT_TERMINAL_AI_DOCTOR_REASONS as readonly string[]).includes(rawReason)
    );
  }

  // The invoke resolved without a transport error, but the purported success
  // could not be safely consumed. Replay the same key so a cached server result
  // can be recovered without another model call or credit.
  return reason === "empty" || reason === "shape" || reason === "invalid";
}
