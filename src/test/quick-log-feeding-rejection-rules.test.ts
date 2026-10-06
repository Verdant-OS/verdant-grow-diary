import { describe, expect, it } from "vitest";
import {
  FEEDING_REJECTED_HISTORY_REVIEW,
  feedingHistoryCheckMessage,
  feedingRejectionNeedsHistoryCheck,
  isFeedingRejectionHistoryReason,
  mayCorrectRejectedFeeding,
} from "@/lib/quickLogFeedingRejectionRules";
import { quickLogReasonToOperatorMessage } from "@/lib/quickLogSaveErrorMessage";
import type { WriteFeedingFailureReason } from "@/lib/writeFeedingTypedEvent";

describe("mayCorrectRejectedFeeding", () => {
  it("releases a fresh explicit invalid-payload response or pre-RPC validation failure", () => {
    expect(
      mayCorrectRejectedFeeding({ reason: "rpc:invalid_typed_payload", priorClaim: false }),
    ).toBe(true);
    expect(mayCorrectRejectedFeeding({ reason: "numeric:not_finite", priorClaim: false })).toBe(
      true,
    );
  });

  it.each([true, null, undefined])("keeps a prior or unknown claim for %s", (priorClaim) => {
    expect(mayCorrectRejectedFeeding({ reason: "rpc:invalid_typed_payload", priorClaim })).toBe(
      false,
    );
  });

  it.each(["rpc:error", "rpc:rejected", "rpc:no_event_id", "unexpected"])(
    "keeps ambiguous or unrecognized reason %s",
    (reason) => {
      expect(
        mayCorrectRejectedFeeding({
          reason: reason as WriteFeedingFailureReason,
          priorClaim: false,
        }),
      ).toBe(false);
    },
  );

  it("is deterministic for identical input", () => {
    const input = { reason: "rpc:invalid_typed_payload" as const, priorClaim: true };
    expect(mayCorrectRejectedFeeding(input)).toBe(mayCorrectRejectedFeeding(input));
  });
});

const VALIDATION_REJECTIONS = [
  "rpc:invalid_typed_payload",
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
] as const;

describe("feedingRejectionNeedsHistoryCheck", () => {
  it.each(VALIDATION_REJECTIONS)(
    "sends a prior claim rejected as %s to history review",
    (reason) => {
      expect(feedingRejectionNeedsHistoryCheck({ reason, priorClaim: true })).toBe(true);
      expect(isFeedingRejectionHistoryReason(reason)).toBe(true);
    },
  );

  it.each(VALIDATION_REJECTIONS)("leaves a fresh %s rejection correctable", (reason) => {
    expect(feedingRejectionNeedsHistoryCheck({ reason, priorClaim: false })).toBe(false);
    expect(mayCorrectRejectedFeeding({ reason, priorClaim: false })).toBe(true);
  });

  it.each([null, undefined])(
    "fails closed to history review for unknown claim %s",
    (priorClaim) => {
      expect(
        feedingRejectionNeedsHistoryCheck({ reason: "rpc:invalid_typed_payload", priorClaim }),
      ).toBe(true);
      expect(mayCorrectRejectedFeeding({ reason: "rpc:invalid_typed_payload", priorClaim })).toBe(
        false,
      );
    },
  );

  it.each([
    "rpc:error",
    "rpc:rejected",
    "rpc:no_event_id",
    "idempotency_key_conflict",
    "unexpected",
  ])("does not claim unrelated reason %s", (reason) => {
    for (const priorClaim of [true, false, null, undefined]) {
      expect(
        feedingRejectionNeedsHistoryCheck({
          reason: reason as WriteFeedingFailureReason,
          priorClaim,
        }),
      ).toBe(false);
    }
    expect(isFeedingRejectionHistoryReason(reason)).toBe(false);
  });

  it("never offers both correction and history review for one rejection", () => {
    for (const reason of VALIDATION_REJECTIONS)
      for (const priorClaim of [true, false, null, undefined])
        expect(
          mayCorrectRejectedFeeding({ reason, priorClaim }) !==
            feedingRejectionNeedsHistoryCheck({ reason, priorClaim }),
        ).toBe(true);
  });

  it.each([null, undefined, 42, {}, ""])("rejects non-reason value %s", (value) => {
    expect(isFeedingRejectionHistoryReason(value)).toBe(false);
  });
});

describe("feedingHistoryCheckMessage", () => {
  it("explains a restored validation rejection and points to Timeline and discard", () => {
    expect(feedingHistoryCheckMessage("rpc:invalid_typed_payload")).toBe(
      FEEDING_REJECTED_HISTORY_REVIEW,
    );
    expect(feedingHistoryCheckMessage("volume_ml:invalid")).toBe(FEEDING_REJECTED_HISTORY_REVIEW);
  });

  it("keeps the shared copy for replay refusals", () => {
    expect(feedingHistoryCheckMessage("idempotency_key_conflict")).toBe(
      quickLogReasonToOperatorMessage("idempotency_key_conflict"),
    );
  });
});
