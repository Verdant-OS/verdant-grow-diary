import { describe, expect, it, vi } from "vitest";
import {
  hasMatchingQuickLogNoteTarget,
  matchesActiveQuickLogActivityEvent,
  matchesActiveQuickLogNoteEvent,
  resolveManualNoteReceiptTentId,
  type ExpectedQuickLogActivityEvent,
} from "@/lib/quickLogReusedActivityReceiptRules";
import { verifyReusedQuickLogActivityEvent } from "@/lib/quickLogReusedActivityReceipt";

const expected: ExpectedQuickLogActivityEvent = {
  id: "77777777-7777-4777-8777-000000000001",
  eventType: "training",
  growId: "grow-a",
  tentId: "tent-a",
  plantId: "plant-a",
  note: "Tied branch",
  occurredAt: "2026-09-26T12:00:00.000Z",
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
  occurred_at: expected.occurredAt,
};

describe("reused Quick Log activity receipt", () => {
  it("omits only the plant-targeted manual Note tent claim", () => {
    const plantTarget = { plantId: "plant-a", tentId: null };
    expect(resolveManualNoteReceiptTentId(plantTarget)).toBeUndefined();
    expect(resolveManualNoteReceiptTentId(plantTarget)).toBeUndefined();
    expect(
      resolveManualNoteReceiptTentId({ plantId: "plant-a", tentId: "stale-tent" }),
    ).toBeUndefined();
    expect(resolveManualNoteReceiptTentId({ plantId: null, tentId: "tent-a" })).toBe("tent-a");
    expect(resolveManualNoteReceiptTentId({ plantId: null, tentId: null })).toBeNull();
    expect(resolveManualNoteReceiptTentId(null)).toBeNull();
    expect(resolveManualNoteReceiptTentId(undefined)).toBeNull();
  });

  it("accepts the exact active original deterministically", () => {
    expect(matchesActiveQuickLogActivityEvent(expected, event)).toBe(true);
    expect(matchesActiveQuickLogActivityEvent(expected, event)).toBe(true);
    expect(matchesActiveQuickLogActivityEvent({ ...expected, tentId: undefined }, event)).toBe(
      true,
    );
  });

  it.each([
    ["missing", null],
    ["retracted", { ...event, is_deleted: true }],
    ["unknown visibility", { ...event, is_deleted: undefined }],
    ["other event", { ...event, id: "other" }],
    ["other type", { ...event, event_type: "observation" }],
    ["other source", { ...event, source: "csv" }],
    ["other grow", { ...event, grow_id: "grow-b" }],
    ["other tent", { ...event, tent_id: "tent-b" }],
    ["other plant", { ...event, plant_id: "plant-b" }],
    ["other note", { ...event, note: "Different" }],
    ["other time", { ...event, occurred_at: "2026-09-26T12:01:00.000Z" }],
    ["invalid time", { ...event, occurred_at: "not-a-date" }],
  ])("rejects %s", (_case, value) => {
    expect(matchesActiveQuickLogActivityEvent(expected, value)).toBe(false);
  });

  it("fails closed on an unreadable event", async () => {
    expect(
      await verifyReusedQuickLogActivityEvent(
        expected,
        vi.fn().mockResolvedValue({ data: event, error: { message: "offline" } }),
      ),
    ).toBe(false);
    expect(
      await verifyReusedQuickLogActivityEvent(
        expected,
        vi.fn().mockRejectedValue(new Error("offline")),
      ),
    ).toBe(false);
  });
});

describe("reused Quick Log Note receipt", () => {
  const note = { ...event, event_type: "observation" };

  it("accepts the active original plant or tent target", () => {
    expect(
      matchesActiveQuickLogNoteEvent(
        { p_target_type: "plant", p_target_id: "plant-a" },
        expected.id,
        note,
      ),
    ).toBe(true);
    expect(
      matchesActiveQuickLogNoteEvent(
        { p_target_type: "tent", p_target_id: "tent-a" },
        expected.id,
        { ...note, plant_id: null },
      ),
    ).toBe(true);
  });

  it("rejects retracted, missing, and wrong-target originals", () => {
    const payload = { p_target_type: "plant" as const, p_target_id: "plant-a" };
    expect(matchesActiveQuickLogNoteEvent(payload, expected.id, null)).toBe(false);
    expect(hasMatchingQuickLogNoteTarget(payload, expected.id, { ...note, is_deleted: true })).toBe(
      true,
    );
    expect(
      matchesActiveQuickLogNoteEvent(payload, expected.id, { ...note, is_deleted: true }),
    ).toBe(false);
    expect(matchesActiveQuickLogNoteEvent(payload, expected.id, { ...note, source: "csv" })).toBe(
      false,
    );
    expect(
      matchesActiveQuickLogNoteEvent(
        { p_target_type: "tent", p_target_id: "tent-a" },
        expected.id,
        note,
      ),
    ).toBe(false);
  });
});
