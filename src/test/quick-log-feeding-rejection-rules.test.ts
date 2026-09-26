import { describe, expect, it } from "vitest";
import { mayCorrectRejectedFeeding } from "@/lib/quickLogFeedingRejectionRules";
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
