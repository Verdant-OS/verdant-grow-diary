import { describe, expect, it } from "vitest";
import type { AiCreditedFailureReason } from "@/lib/aiCreditedResponseAdapter";
import {
  buildAiDoctorLiveReviewScopeKey,
  canRetryAiDoctorLiveReviewFailure,
  getAiDoctorLiveReviewVisibility,
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
  credit_rpc: true,
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

describe("getAiDoctorLiveReviewVisibility", () => {
  const baseInput = {
    allowed: false,
    acceptedEligibilityAllowed: false,
    mode: "standard" as const,
    omittedImportedHistory: false,
    omittedRootZoneHistory: false,
    includedRootZoneHistory: false,
    rootZoneBlocksReview: false,
    evidenceCapturedAt: "2026-09-23T12:00:00.000Z",
    now: new Date("2026-09-23T12:00:00.000Z"),
  };

  it("keeps an accepted standard review visible when it was eligible at acceptance time", () => {
    expect(
      getAiDoctorLiveReviewVisibility({
        ...baseInput,
        acceptedEligibilityAllowed: true,
      }),
    ).toEqual({
      visible: true,
      retryBlockedReason: null,
      showsStaleEvidenceNote: false,
    });
  });

  it("shows the stale-evidence note and blocks retry for a standard review past the cutoff", () => {
    expect(
      getAiDoctorLiveReviewVisibility({
        ...baseInput,
        acceptedEligibilityAllowed: true,
        now: new Date("2026-09-30T12:00:00.001Z"),
      }),
    ).toEqual({
      visible: true,
      retryBlockedReason: "stale-evidence",
      showsStaleEvidenceNote: true,
    });
  });

  it("does not stale-block historical reviews", () => {
    expect(
      getAiDoctorLiveReviewVisibility({
        ...baseInput,
        mode: "historical_review",
        now: new Date("2026-09-30T12:00:00.001Z"),
      }),
    ).toEqual({
      visible: true,
      retryBlockedReason: null,
      showsStaleEvidenceNote: false,
    });
  });

  it("keeps the accepted review hidden when its standard sources were removed", () => {
    expect(getAiDoctorLiveReviewVisibility(baseInput)).toEqual({
      visible: false,
      retryBlockedReason: null,
      showsStaleEvidenceNote: false,
    });
  });

  const unknownTimestamps = [undefined, null, "", " \t ", "not-a-date"];

  it.each(unknownTimestamps)(
    "blocks standard retry for unknown timestamp %j without hiding an accepted review",
    (evidenceCapturedAt) => {
      const input = { ...baseInput, acceptedEligibilityAllowed: true, evidenceCapturedAt };
      const expected = {
        visible: true,
        retryBlockedReason: "unknown-evidence-freshness",
        showsStaleEvidenceNote: false,
      };
      expect(getAiDoctorLiveReviewVisibility(input)).toEqual(expected);
      expect(getAiDoctorLiveReviewVisibility(input)).toEqual(expected);
    },
  );

  it.each(unknownTimestamps)(
    "preserves historical retry for unknown timestamp %j",
    (evidenceCapturedAt) => {
      expect(
        getAiDoctorLiveReviewVisibility({
          ...baseInput,
          mode: "historical_review",
          evidenceCapturedAt,
        }),
      ).toEqual({ visible: true, retryBlockedReason: null, showsStaleEvidenceNote: false });
    },
  );

  it.each(unknownTimestamps)(
    "does not restore removed standard sources for unknown timestamp %j",
    (evidenceCapturedAt) => {
      expect(getAiDoctorLiveReviewVisibility({ ...baseInput, evidenceCapturedAt })).toEqual({
        visible: false,
        retryBlockedReason: "unknown-evidence-freshness",
        showsStaleEvidenceNote: false,
      });
    },
  );

  it.each([Number.NaN, new Date(Number.NaN)])(
    "blocks standard retry when the evaluation clock is invalid: %j",
    (now) => {
      expect(
        getAiDoctorLiveReviewVisibility({ ...baseInput, acceptedEligibilityAllowed: true, now }),
      ).toEqual({
        visible: true,
        retryBlockedReason: "unknown-evidence-freshness",
        showsStaleEvidenceNote: false,
      });
    },
  );

  it.each([-1, 0, 1])("preserves the seven-day cutoff at offset %s ms", (offsetMs) => {
    const now = Date.parse(baseInput.evidenceCapturedAt) + 7 * 24 * 60 * 60 * 1000 + offsetMs;
    for (const clock of [now, new Date(now)]) {
      expect(
        getAiDoctorLiveReviewVisibility({
          ...baseInput,
          acceptedEligibilityAllowed: true,
          now: clock,
        }),
      ).toEqual({
        visible: true,
        retryBlockedReason: offsetMs > 0 ? "stale-evidence" : null,
        showsStaleEvidenceNote: offsetMs > 0,
      });
    }
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
    expect(
      shouldReuseAiDoctorReviewIdempotencyKeyAfterResponse(
        { ok: false, reason: "credit_rpc" },
        "credit_rpc",
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
