import { describe, expect, it } from "vitest";
import {
  matchesActiveQuickLogActivityEvent,
  type ExpectedQuickLogActivityEvent,
} from "@/lib/quickLogReusedActivityReceiptRules";

const expected: ExpectedQuickLogActivityEvent = {
  id: "77777777-7777-4777-8777-000000000001",
  eventType: "training",
  growId: "grow-a",
  tentId: "tent-a",
  plantId: "plant-a",
  note: "Tied branch",
  occurredAt: null,
};

const event = {
  id: expected.id,
  event_type: "training",
  source: "manual",
  is_deleted: false,
  grow_id: expected.growId,
  tent_id: expected.tentId,
  plant_id: expected.plantId,
  note: expected.note,
  occurred_at: "2026-09-26T12:00:00.000Z",
};

describe("reused activity receipt with a server-assigned time", () => {
  it("accepts any occurred_at only when the rest of the event still matches", () => {
    expect(matchesActiveQuickLogActivityEvent(expected, event)).toBe(true);
    expect(
      matchesActiveQuickLogActivityEvent(expected, { ...event, occurred_at: "not-a-date" }),
    ).toBe(true);
    expect(matchesActiveQuickLogActivityEvent(expected, event)).toBe(
      matchesActiveQuickLogActivityEvent(expected, event),
    );
  });

  it.each([
    ["an array", [event]],
    ["another grow", { ...event, grow_id: "grow-b" }],
    ["a retracted row", { ...event, is_deleted: true }],
    ["another note", { ...event, note: "Different" }],
    ["another source", { ...event, source: "csv" }],
  ])("rejects %s even when the expected time is unset", (_case, value) => {
    expect(matchesActiveQuickLogActivityEvent(expected, value)).toBe(false);
  });
});
