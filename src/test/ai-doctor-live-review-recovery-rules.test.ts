import { describe, expect, it } from "vitest";
import type { AiCreditedFailureReason } from "@/lib/aiCreditedResponseAdapter";
import {
  buildAiDoctorLiveReviewScopeKey,
  canRetryAiDoctorLiveReviewFailure,
  shouldReuseAiDoctorReviewIdempotencyKeyAfterResponse,
} from "@/lib/aiDoctorLiveReviewRecoveryRules";

describe("buildAiDoctorLiveReviewScopeKey", () => {
  it("changes when grow, tent, or plant scope changes", () => {
    const baseline = buildAiDoctorLiveReviewScopeKey("plant-1", "tent-1", "grow-1");

    expect(baseline).toBe("grow-1:tent-1:plant-1");
    expect(buildAiDoctorLiveReviewScopeKey("plant-1", "tent-1", "grow-2")).not.toBe(baseline);
    expect(buildAiDoctorLiveReviewScopeKey("plant-1", "tent-2", "grow-1")).not.toBe(baseline);
    expect(buildAiDoctorLiveReviewScopeKey("plant-2", "tent-1", "grow-1")).not.toBe(baseline);
  });

  it("uses explicit sentinels for absent grow and tent scope", () => {
    expect(buildAiDoctorLiveReviewScopeKey("plant-1", null, null)).toBe("no-grow:no-tent:plant-1");
  });
});

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
  result_pending: true,
  result_recording_failed: true,
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

describe("shouldReuseAiDoctorReviewIdempotencyKeyAfterResponse", () => {
  it("retains the key for a pending result and malformed/client-invalid successes", () => {
    expect(
      shouldReuseAiDoctorReviewIdempotencyKeyAfterResponse(
        { ok: false, reason: "result_pending" },
        "result_pending",
      ),
    ).toBe(true);
    expect(shouldReuseAiDoctorReviewIdempotencyKeyAfterResponse(null, "empty")).toBe(true);
    expect(shouldReuseAiDoctorReviewIdempotencyKeyAfterResponse("bad", "shape")).toBe(true);
    expect(
      shouldReuseAiDoctorReviewIdempotencyKeyAfterResponse(
        { ok: true, result: { unsafe: true } },
        "invalid",
      ),
    ).toBe(true);
  });

  it.each([
    "config",
    "http",
    "timeout",
    "parse",
    "empty",
    "shape",
    "credit_denied",
    "upstream_credit_exhausted",
    "result_recording_failed",
  ] as const)("retires the key for the explicit terminal server reason %s", (reason) => {
    expect(
      shouldReuseAiDoctorReviewIdempotencyKeyAfterResponse({ ok: false, reason }, reason),
    ).toBe(false);
  });

  it("retains an explicit invalid response across old-Edge/new-client rollout", () => {
    expect(
      shouldReuseAiDoctorReviewIdempotencyKeyAfterResponse(
        { ok: false, reason: "invalid" },
        "invalid",
      ),
    ).toBe(true);
  });

  it("retains the key when an explicit failure reason is missing or unknown to this client", () => {
    expect(shouldReuseAiDoctorReviewIdempotencyKeyAfterResponse({ ok: false }, "invalid")).toBe(
      true,
    );
    expect(
      shouldReuseAiDoctorReviewIdempotencyKeyAfterResponse(
        { ok: false, reason: "newer_server_reason" },
        "invalid",
      ),
    ).toBe(true);
  });
});
