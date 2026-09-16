import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const service = vi.hoisted(() => ({
  correct: vi.fn(),
  retract: vi.fn(),
}));

vi.mock("@/lib/quickLogRevisionService", () => ({
  correctQuickLogEntry: service.correct,
  retractQuickLogEntry: service.retract,
}));

import { useQuickLogRevisionMutation } from "@/hooks/useQuickLogRevisionMutation";

const handle = { growEventId: "event-a" };
const receipt = {
  ok: true as const,
  revisionId: "revision-a",
  revisionNo: 1,
  growEventId: "event-a",
  diaryEntryIds: ["diary-a"],
};

beforeEach(() => {
  vi.clearAllMocks();
  service.correct.mockResolvedValue(receipt);
  service.retract.mockResolvedValue(receipt);
});

describe("useQuickLogRevisionMutation", () => {
  it("rejects submit when the owner is not authenticated", async () => {
    const { result } = renderHook(() => useQuickLogRevisionMutation(null, handle));

    let response: Awaited<ReturnType<typeof result.current.submit>> = null;
    await act(async () => {
      response = await result.current.submit("correction", "typo", { note: "Fixed" }, "");
    });

    expect(response).toEqual({ ok: false, reason: "not_authenticated" });
    expect(service.correct).not.toHaveBeenCalled();
  });

  it("blocks a different revision kind while an uncertain operation is pending", async () => {
    service.correct.mockResolvedValueOnce({ ok: false, reason: "rpc_error" });
    const { result } = renderHook(() => useQuickLogRevisionMutation("owner-a", handle));

    await act(async () => {
      await result.current.submit("correction", "typo", { note: "Fixed" }, "");
    });
    await waitFor(() => expect(result.current.unconfirmed).toBe(true));

    let response: Awaited<ReturnType<typeof result.current.submit>> = null;
    await act(async () => {
      response = await result.current.submit("retraction", "accidental", {}, "");
    });

    expect(response).toEqual({ ok: false, reason: "rpc_error" });
    expect(service.retract).not.toHaveBeenCalled();
    expect(result.current.pendingKind).toBe("correction");
  });

  it("clears pending state after a definitive idempotency conflict", async () => {
    service.correct.mockResolvedValueOnce({ ok: false, reason: "idempotency_conflict" });
    const { result } = renderHook(() => useQuickLogRevisionMutation("owner-a", handle));

    let response: Awaited<ReturnType<typeof result.current.submit>> = null;
    await act(async () => {
      response = await result.current.submit("correction", "typo", { note: "Fixed" }, "");
    });

    expect(response).toEqual({ ok: false, reason: "idempotency_conflict" });
    expect(result.current.unconfirmed).toBe(false);
    expect(result.current.pendingKind).toBeNull();
  });

  it("replays the same idempotency key after an uncertain correction", async () => {
    service.correct
      .mockResolvedValueOnce({ ok: false, reason: "rpc_error" })
      .mockResolvedValueOnce(receipt);
    const { result } = renderHook(() => useQuickLogRevisionMutation("owner-a", handle));

    await act(async () => {
      await result.current.submit("correction", "typo", { note: "Fixed" }, "because");
    });
    const firstKey = service.correct.mock.calls[0]?.[4];

    await act(async () => {
      await result.current.submit("correction", "typo", { note: "Changed" }, "ignored");
    });

    expect(service.correct.mock.calls[1]?.[4]).toBe(firstKey);
    expect(service.correct.mock.calls[1]?.[2]).toEqual({ note: "Fixed" });
    await waitFor(() => expect(result.current.unconfirmed).toBe(false));
  });
});
