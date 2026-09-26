import { describe, expect, it, vi } from "vitest";
import {
  matchesActiveTypedQuickLogEvent,
  type ExpectedTypedQuickLogEvent,
} from "@/lib/quickLogTypedReusedReceiptRules";
import { verifyActiveTypedQuickLogEvent } from "@/lib/quickLogTypedReusedReceipt";

const expected: ExpectedTypedQuickLogEvent = {
  id: "77777777-7777-4777-8777-000000000001",
  eventType: "watering",
  growId: "grow-a",
  tentId: "tent-a",
  plantId: "plant-a",
};
const active = {
  id: expected.id,
  event_type: "watering",
  source: "manual",
  is_deleted: false,
  grow_id: "grow-a",
  tent_id: "tent-a",
  plant_id: "plant-a",
};

describe("typed Quick Log reused receipt", () => {
  it("accepts the same active event and is deterministic", () => {
    expect(matchesActiveTypedQuickLogEvent(expected, active)).toBe(true);
    expect(matchesActiveTypedQuickLogEvent(expected, active)).toBe(true);
  });

  it.each([
    ["retracted", { ...active, is_deleted: true }],
    ["unmeasured deletion", { ...active, is_deleted: null }],
    ["wrong action", { ...active, event_type: "feeding" }],
    ["wrong grow", { ...active, grow_id: "grow-b" }],
    ["wrong tent", { ...active, tent_id: "tent-b" }],
    ["wrong plant", { ...active, plant_id: "plant-b" }],
    ["wrong source", { ...active, source: "demo" }],
    ["missing row", null],
    ["malformed row", "not an event"],
  ])("rejects %s", (_case, row) => {
    expect(matchesActiveTypedQuickLogEvent(expected, row)).toBe(false);
  });

  it("fails closed on a read error or exception", async () => {
    expect(
      await verifyActiveTypedQuickLogEvent(
        expected,
        vi.fn().mockResolvedValue({ data: active, error: {} }),
      ),
    ).toBe(false);
    expect(
      await verifyActiveTypedQuickLogEvent(
        expected,
        vi.fn().mockRejectedValue(new Error("offline")),
      ),
    ).toBe(false);
  });
});
