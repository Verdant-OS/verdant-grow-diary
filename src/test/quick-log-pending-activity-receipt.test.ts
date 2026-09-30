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

describe("Quick Log pending activity receipt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    query.from.mockReturnValue({ select: query.select });
    query.select.mockReturnValue({ eq: query.eq });
    query.eq.mockReturnValue({ eq: query.eq, maybeSingle: query.maybeSingle });
  });

  it("confirms only a committed UUID receipt scoped to owner and idempotency key", async () => {
    const growEventId = "77777777-7777-4777-8777-000000000001";
    query.maybeSingle.mockResolvedValue({ data: { grow_event_id: growEventId }, error: null });

    expect(await readQuickLogPendingActivityReceipt("owner-a", "retry-key-a")).toEqual({
      status: "confirmed",
      growEventId,
    });
    expect(query.from).toHaveBeenCalledExactlyOnceWith("quicklog_idempotency");
    expect(query.select).toHaveBeenCalledExactlyOnceWith("grow_event_id");
    expect(query.eq.mock.calls).toEqual([
      ["user_id", "owner-a"],
      ["idempotency_key", "retry-key-a"],
    ]);
    expect(query.maybeSingle).toHaveBeenCalledTimes(1);
  });

  it("keeps an absent receipt distinct from proof that the write failed", async () => {
    query.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect(await readQuickLogPendingActivityReceipt("owner-a", "retry-key-a")).toEqual({
      status: "not_found",
    });
  });

  it.each([
    { data: null, error: { message: "read denied" } },
    { data: { grow_event_id: "invalid" }, error: null },
    { data: {}, error: null },
  ])("fails closed on an error or malformed receipt: %j", async (result) => {
    query.maybeSingle.mockResolvedValue(result);
    expect(await readQuickLogPendingActivityReceipt("owner-a", "retry-key-a")).toEqual({
      status: "unavailable",
    });
  });

  it("fails closed when the receipt query throws", async () => {
    query.maybeSingle.mockRejectedValue(new Error("read failed"));
    expect(await readQuickLogPendingActivityReceipt("owner-a", "retry-key-a")).toEqual({
      status: "unavailable",
    });
  });

  it.each([
    [null, "retry-key-a"],
    ["owner-a", undefined],
    ["", "retry-key-a"],
    ["owner-a", " "],
  ])("does not query without an owner and key: %s / %s", async (owner, key) => {
    expect(await readQuickLogPendingActivityReceipt(owner, key)).toEqual({ status: "unavailable" });
    expect(query.from).not.toHaveBeenCalled();
  });
});
