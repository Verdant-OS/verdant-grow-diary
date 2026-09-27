import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: query.from },
}));

import { readQuickLogPendingActivityReceipt } from "@/lib/quickLogPendingActivityReceipt";
import type { PendingQuickLogActivityInput } from "@/lib/quickLogPendingActivityStore";

const input: PendingQuickLogActivityInput = {
  activityId: "training",
  growId: "grow-a",
  tentId: "tent-a",
  plantId: "plant-a",
  note: "Tied branch",
  occurredAt: null,
  extraDetails: null,
  idempotencyKey: "retry-key-a",
};
const activeEvent = {
  id: "77777777-7777-4777-8777-000000000001",
  event_type: "training",
  source: "manual",
  is_deleted: false,
  grow_id: "grow-a",
  tent_id: "tent-a",
  plant_id: "plant-a",
  note: "Tied branch",
};

describe("Quick Log pending activity receipt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    query.from.mockReturnValue({ select: query.select });
    query.select.mockReturnValue({ eq: query.eq });
    query.eq.mockReturnValue({ eq: query.eq, maybeSingle: query.maybeSingle });
  });

  it("confirms only a committed UUID receipt scoped to owner and idempotency key", async () => {
    const growEventId = "77777777-7777-4777-8777-000000000001";
    query.maybeSingle
      .mockResolvedValueOnce({ data: { grow_event_id: growEventId }, error: null })
      .mockResolvedValueOnce({ data: activeEvent, error: null });

    expect(await readQuickLogPendingActivityReceipt("owner-a", "retry-key-a", input)).toEqual({
      status: "confirmed",
      growEventId,
    });
    expect(query.from.mock.calls).toEqual([["quicklog_idempotency"], ["grow_events"]]);
    expect(query.select).toHaveBeenNthCalledWith(1, "grow_event_id");
    expect(query.select).toHaveBeenNthCalledWith(
      2,
      "id,event_type,source,is_deleted,grow_id,tent_id,plant_id,note,occurred_at",
    );
    expect(query.eq.mock.calls).toEqual([
      ["user_id", "owner-a"],
      ["idempotency_key", "retry-key-a"],
      ["id", growEventId],
    ]);
    expect(query.maybeSingle).toHaveBeenCalledTimes(2);
  });

  it("confirms a plant Note whose tent was resolved by the manual RPC", async () => {
    query.maybeSingle
      .mockResolvedValueOnce({ data: { grow_event_id: activeEvent.id }, error: null })
      .mockResolvedValueOnce({
        data: { ...activeEvent, event_type: "observation" },
        error: null,
      });
    expect(
      await readQuickLogPendingActivityReceipt("owner-a", "retry-key-a", {
        ...input,
        activityId: "note",
        tentId: null,
      }),
    ).toEqual({ status: "confirmed", growEventId: activeEvent.id });
  });

  it("does not ignore an event-route tent mismatch during pending recovery", async () => {
    query.maybeSingle
      .mockResolvedValueOnce({ data: { grow_event_id: activeEvent.id }, error: null })
      .mockResolvedValueOnce({ data: activeEvent, error: null });
    expect(
      await readQuickLogPendingActivityReceipt("owner-a", "retry-key-a", {
        ...input,
        tentId: null,
      }),
    ).toEqual({ status: "unavailable" });
  });

  it("does not call a retracted activity a confirmed moved-target save", async () => {
    query.maybeSingle
      .mockResolvedValueOnce({ data: { grow_event_id: activeEvent.id }, error: null })
      .mockResolvedValueOnce({ data: { ...activeEvent, is_deleted: true }, error: null });
    expect(await readQuickLogPendingActivityReceipt("owner-a", "retry-key-a", input)).toEqual({
      status: "unavailable",
    });
  });

  it("keeps an absent receipt distinct from proof that the write failed", async () => {
    query.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect(await readQuickLogPendingActivityReceipt("owner-a", "retry-key-a", input)).toEqual({
      status: "not_found",
    });
  });

  it.each([
    { data: null, error: { message: "read denied" } },
    { data: { grow_event_id: "invalid" }, error: null },
    { data: {}, error: null },
  ])("fails closed on an error or malformed receipt: %j", async (result) => {
    query.maybeSingle.mockResolvedValue(result);
    expect(await readQuickLogPendingActivityReceipt("owner-a", "retry-key-a", input)).toEqual({
      status: "unavailable",
    });
  });

  it("fails closed when the receipt query throws", async () => {
    query.maybeSingle.mockRejectedValue(new Error("read failed"));
    expect(await readQuickLogPendingActivityReceipt("owner-a", "retry-key-a", input)).toEqual({
      status: "unavailable",
    });
  });

  it.each([
    [null, "retry-key-a"],
    ["owner-a", undefined],
    ["", "retry-key-a"],
    ["owner-a", " "],
  ])("does not query without an owner and key: %s / %s", async (owner, key) => {
    expect(await readQuickLogPendingActivityReceipt(owner, key, input)).toEqual({
      status: "unavailable",
    });
    expect(query.from).not.toHaveBeenCalled();
  });
});
