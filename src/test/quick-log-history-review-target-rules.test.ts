import { describe, expect, it } from "vitest";
import {
  copyHistoryReviewTarget,
  historyReviewTargetAllowed,
  isPendingQuickLogHistoryReviewTarget,
  type PendingQuickLogHistoryReviewTarget,
} from "@/lib/quickLogHistoryReviewTargetRules";

const validTarget: PendingQuickLogHistoryReviewTarget = {
  growId: "grow-a",
  tentId: "tent-a",
  plantId: "plant-a",
};

describe("isPendingQuickLogHistoryReviewTarget", () => {
  it.each([
    ["all null ids", { growId: null, tentId: null, plantId: null }],
    ["mixed null and string ids", validTarget],
  ])("accepts %s", (_label, value) => {
    expect(isPendingQuickLogHistoryReviewTarget(value)).toBe(true);
  });

  it.each([
    ["non-object", null],
    ["array", []],
    ["string", "grow-a"],
    ["number growId", { growId: 1, tentId: null, plantId: null }],
    ["undefined tentId", { growId: null, tentId: undefined, plantId: null }],
    ["extra key", { ...validTarget, extra: "x" }],
    ["missing plantId", { growId: null, tentId: null }],
  ])("rejects %s", (_label, value) => {
    expect(isPendingQuickLogHistoryReviewTarget(value)).toBe(false);
  });
});

describe("historyReviewTargetAllowed", () => {
  it("allows an omitted review target for any refusal reason", () => {
    expect(historyReviewTargetAllowed("idempotency_key_unverified", undefined)).toBe(true);
    expect(historyReviewTargetAllowed("receipt_target_moved", undefined)).toBe(true);
  });

  it("allows a well-formed target only beside receipt_target_moved", () => {
    expect(historyReviewTargetAllowed("receipt_target_moved", validTarget)).toBe(true);
  });

  it.each([
    ["idempotency_key_unverified", validTarget],
    ["rpc:receipt_unverified", validTarget],
    ["receipt_target_moved", { growId: 42, tentId: null, plantId: null }],
    ["receipt_target_moved", { growId: null, tentId: null, plantId: null, bad: true }],
  ])("rejects reason=%s with a stored target", (reason, target) => {
    expect(historyReviewTargetAllowed(reason, target)).toBe(false);
  });
});

describe("copyHistoryReviewTarget", () => {
  it("returns a detached copy so caller mutation cannot reach storage", () => {
    const source = { growId: "grow-a", tentId: "tent-a", plantId: "plant-a" };
    const copy = copyHistoryReviewTarget(source);
    source.growId = "mutated";
    expect(copy).toEqual({ growId: "grow-a", tentId: "tent-a", plantId: "plant-a" });
  });
});
