import { describe, expect, it } from "vitest";
import { mayCorrectRejectedWatering } from "@/lib/quickLogWateringRejectionRules";

describe("mayCorrectRejectedWatering", () => {
  it("permits correction only for an explicit invalid-payload answer to a fresh claim", () => {
    expect(
      mayCorrectRejectedWatering({ reason: "rpc:invalid_typed_payload", priorClaim: false }),
    ).toBe(true);
    expect(
      mayCorrectRejectedWatering({ reason: "rpc:invalid_typed_payload", priorClaim: true }),
    ).toBe(false);
  });

  it.each(["rpc:error", "rpc:rejected", "rpc:no_event_id", null, undefined, ""])(
    "keeps %s unresolved even for a fresh claim",
    (reason) => {
      expect(mayCorrectRejectedWatering({ reason, priorClaim: false })).toBe(false);
    },
  );

  it("fails closed on an unknown prior-claim state and is deterministic", () => {
    const input = { reason: "rpc:invalid_typed_payload", priorClaim: null };
    expect(mayCorrectRejectedWatering(input)).toBe(false);
    expect(mayCorrectRejectedWatering(input)).toBe(mayCorrectRejectedWatering(input));
  });
});
