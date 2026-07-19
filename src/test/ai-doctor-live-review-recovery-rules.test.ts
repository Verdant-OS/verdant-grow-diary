import { describe, expect, it } from "vitest";
import type { AiCreditedFailureReason } from "@/lib/aiCreditedResponseAdapter";
import { canRetryAiDoctorLiveReviewFailure } from "@/lib/aiDoctorLiveReviewRecoveryRules";

const EXPECTED_RETRYABILITY = {
  config: true,
  http: true,
  timeout: true,
  parse: true,
  empty: true,
  invalid: true,
  shape: true,
  credit_denied: false,
  upstream_credit_exhausted: true,
} as const satisfies Record<AiCreditedFailureReason, boolean>;

const RETRYABILITY_CASES = Object.entries(EXPECTED_RETRYABILITY) as Array<
  [AiCreditedFailureReason, boolean]
>;

describe("canRetryAiDoctorLiveReviewFailure", () => {
  it("does not retry an absent failure", () => {
    expect(canRetryAiDoctorLiveReviewFailure(null)).toBe(false);
    expect(canRetryAiDoctorLiveReviewFailure(undefined)).toBe(false);
  });

  it.each(RETRYABILITY_CASES)("returns %s retryability as %s", (reason, expected) => {
    expect(canRetryAiDoctorLiveReviewFailure(reason)).toBe(expected);
    expect(canRetryAiDoctorLiveReviewFailure(reason)).toBe(expected);
  });
});
