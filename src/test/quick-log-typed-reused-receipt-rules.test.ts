import { describe, expect, it, vi } from "vitest";
import {
  matchesActiveTypedQuickLogEvent,
  matchesTypedQuickLogChild,
  type ExpectedTypedQuickLogEvent,
} from "@/lib/quickLogTypedReusedReceiptRules";
import {
  TYPED_REUSED_RECEIPT_READ_DEADLINE_MS,
  verifyActiveTypedQuickLogEvent,
} from "@/lib/quickLogTypedReusedReceiptService";

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

  it("reports a read error or exception as unavailable, never verified", async () => {
    expect(
      await verifyActiveTypedQuickLogEvent(
        expected,
        vi.fn().mockResolvedValue({ data: active, error: {} }),
      ),
    ).toEqual({ status: "unavailable" });
    expect(
      await verifyActiveTypedQuickLogEvent(
        expected,
        vi.fn().mockRejectedValue(new Error("offline")),
      ),
    ).toEqual({ status: "unavailable" });
  });

  it("does not confirm an active parent without its matching typed child", async () => {
    const parent = vi.fn().mockResolvedValue({ data: active, error: null });
    const missingChild = vi.fn().mockResolvedValue({ data: null, error: null });
    expect(await verifyActiveTypedQuickLogEvent(expected, parent, missingChild)).toEqual({
      status: "refused",
      reason: "idempotency_receipt_missing",
    });
    expect(missingChild).toHaveBeenCalledWith("watering", expected.id, expect.any(AbortSignal));

    const wrongVolume = vi.fn().mockResolvedValue({
      data: { event_id: expected.id, volume_ml: 500 },
      error: null,
    });
    expect(await verifyActiveTypedQuickLogEvent(expected, parent, wrongVolume)).toEqual({
      status: "refused",
      reason: "idempotency_key_conflict",
    });
    expect(
      await verifyActiveTypedQuickLogEvent(
        expected,
        parent,
        vi.fn().mockResolvedValue({ data: { event_id: expected.id, volume_ml: 750 }, error: {} }),
      ),
    ).toEqual({ status: "unavailable" });
  });

  it("verifies the same active event with its matching typed child", async () => {
    expect(
      await verifyActiveTypedQuickLogEvent(
        expected,
        vi.fn().mockResolvedValue({ data: active, error: null }),
        vi.fn().mockResolvedValue({ data: { event_id: expected.id, volume_ml: 750 }, error: null }),
      ),
    ).toEqual({ status: "verified" });
  });

  it.each([
    ["a missing event row", null, "idempotency_receipt_missing"],
    ["a retracted event", { ...active, is_deleted: true }, "idempotency_key_retracted"],
    ["an event moved to another plant", { ...active, plant_id: "plant-b" }, "receipt_target_moved"],
    ["an event moved to another tent", { ...active, tent_id: "tent-b" }, "receipt_target_moved"],
    ["an event moved to another grow", { ...active, grow_id: "grow-b" }, "receipt_target_moved"],
    ["a different event type", { ...active, event_type: "feeding" }, "idempotency_key_conflict"],
    ["a non-manual source", { ...active, source: "csv" }, "idempotency_key_conflict"],
    ["an unknown deletion state", { ...active, is_deleted: null }, "idempotency_key_conflict"],
    ["a malformed row", "not an event", "idempotency_key_conflict"],
  ])("routes %s to history review, never same-key Retry", async (_case, row, reason) => {
    const childReader = vi.fn();
    expect(
      await verifyActiveTypedQuickLogEvent(
        expected,
        vi.fn().mockResolvedValue({ data: row, error: null }),
        childReader,
      ),
    ).toMatchObject({ status: "refused", reason });
    expect(childReader).not.toHaveBeenCalled();
  });

  it("carries the verified destination of a moved receipt for history review", async () => {
    expect(
      await verifyActiveTypedQuickLogEvent(
        expected,
        vi.fn().mockResolvedValue({
          data: { ...active, grow_id: "grow-b", tent_id: null, plant_id: "plant-b" },
          error: null,
        }),
      ),
    ).toEqual({
      status: "refused",
      reason: "receipt_target_moved",
      reviewTarget: { growId: "grow-b", tentId: null, plantId: "plant-b" },
    });
  });

  it("gives up after the read deadline and aborts the outstanding read", async () => {
    vi.useFakeTimers();
    try {
      let signal: AbortSignal | undefined;
      const neverSettles = vi.fn((_id: string, s?: AbortSignal) => {
        signal = s;
        return new Promise<{ data: unknown; error: unknown }>(() => {});
      });
      const verdict = verifyActiveTypedQuickLogEvent(expected, neverSettles);
      await vi.advanceTimersByTimeAsync(TYPED_REUSED_RECEIPT_READ_DEADLINE_MS - 1);
      expect(signal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await expect(verdict).resolves.toEqual({ status: "unavailable" });
      expect(signal?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("applies one deadline across the event and child reads", async () => {
    vi.useFakeTimers();
    try {
      const verdict = verifyActiveTypedQuickLogEvent(
        expected,
        vi.fn().mockResolvedValue({ data: active, error: null }),
        vi.fn(() => new Promise<{ data: unknown; error: unknown }>(() => {})),
      );
      await vi.advanceTimersByTimeAsync(TYPED_REUSED_RECEIPT_READ_DEADLINE_MS);
      await expect(verdict).resolves.toEqual({ status: "unavailable" });
    } finally {
      vi.useRealTimers();
    }
  });
});
