import { describe, expect, it, vi } from "vitest";
import {
  matchesActiveTypedQuickLogEvent,
  matchesTypedQuickLogChild,
  type ExpectedTypedQuickLogEvent,
} from "@/lib/quickLogTypedReusedReceiptRules";
import { verifyActiveTypedQuickLogEvent } from "@/lib/quickLogTypedReusedReceiptService";

const expected: ExpectedTypedQuickLogEvent = {
  id: "77777777-7777-4777-8777-000000000001",
  eventType: "watering",
  growId: "grow-a",
  tentId: "tent-a",
  plantId: "plant-a",
  volumeMl: 750,
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
    expect(matchesTypedQuickLogChild(expected, { event_id: expected.id, volume_ml: 750 })).toBe(
      true,
    );
  });

  it.each([
    ["missing", null],
    ["wrong event", { event_id: "other", volume_ml: 750 }],
    ["wrong volume", { event_id: expected.id, volume_ml: 500 }],
  ])("rejects a %s Watering child", (_case, child) => {
    expect(matchesTypedQuickLogChild(expected, child)).toBe(false);
  });

  it("requires the original Feed line as well as its event and volume", () => {
    const feed = { ...expected, eventType: "feeding" as const, lineId: "veg-week-3" };
    expect(
      matchesTypedQuickLogChild(feed, {
        event_id: feed.id,
        volume_ml: 750,
        line_id: "veg-week-3",
      }),
    ).toBe(true);
    expect(
      matchesTypedQuickLogChild(feed, {
        event_id: feed.id,
        volume_ml: 750,
        line_id: "other-line",
      }),
    ).toBe(false);
    expect(
      matchesTypedQuickLogChild(
        { ...feed, lineId: undefined },
        {
          event_id: feed.id,
          volume_ml: 750,
        },
      ),
    ).toBe(false);
    expect(
      matchesTypedQuickLogChild(
        { ...feed, volumeMl: Number.NaN },
        {
          event_id: feed.id,
          volume_ml: Number.NaN,
          line_id: feed.lineId,
        },
      ),
    ).toBe(false);
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

  it("does not confirm an active parent without its matching typed child", async () => {
    const parent = vi.fn().mockResolvedValue({ data: active, error: null });
    const missingChild = vi.fn().mockResolvedValue({ data: null, error: null });
    expect(await verifyActiveTypedQuickLogEvent(expected, parent, missingChild)).toBe(false);
    expect(missingChild).toHaveBeenCalledWith("watering", expected.id);

    const wrongVolume = vi.fn().mockResolvedValue({
      data: { event_id: expected.id, volume_ml: 500 },
      error: null,
    });
    expect(await verifyActiveTypedQuickLogEvent(expected, parent, wrongVolume)).toBe(false);
    expect(
      await verifyActiveTypedQuickLogEvent(
        expected,
        parent,
        vi.fn().mockResolvedValue({ data: { event_id: expected.id, volume_ml: 750 }, error: {} }),
      ),
    ).toBe(false);
  });
});
