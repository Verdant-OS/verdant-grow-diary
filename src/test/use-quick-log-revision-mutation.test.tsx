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
  revisionId: "rev-1",
  revisionNo: 1,
  growEventId: "event-a",
  diaryEntryIds: ["diary-a"],
};

describe("useQuickLogRevisionMutation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    service.correct.mockResolvedValue(receipt);
    service.retract.mockResolvedValue(receipt);
  });

  it("returns not_authenticated when ownerId is missing", async () => {
    const { result } = renderHook(() => useQuickLogRevisionMutation(null, handle));
    await expect(
      result.current.submit("correction", "typo", { note: "Fixed" }, ""),
    ).resolves.toEqual({ ok: false, reason: "not_authenticated" });
    expect(service.correct).not.toHaveBeenCalled();
  });

  it("reuses the frozen idempotency key after an uncertain rpc_error", async () => {
    service.correct
      .mockResolvedValueOnce({ ok: false, reason: "rpc_error" })
      .mockResolvedValueOnce(receipt);
    const { result } = renderHook(() => useQuickLogRevisionMutation("owner-a", handle));

    await act(async () => {
      await result.current.submit("correction", "typo", { note: "Fixed" }, "");
    });
    expect(result.current.unconfirmed).toBe(true);
    expect(result.current.pendingKind).toBe("correction");

    await act(async () => {
      await result.current.submit("correction", "typo", { note: "Changed" }, "retry");
    });
    expect(service.correct).toHaveBeenCalledTimes(2);
    const firstKey = service.correct.mock.calls[0][4];
    expect(service.correct.mock.calls[1][4]).toBe(firstKey);
    expect(service.correct.mock.calls[1][2]).toEqual({ note: "Fixed" });
    await waitFor(() => expect(result.current.unconfirmed).toBe(false));
  });

  it("blocks switching kind while an operation stays unconfirmed", async () => {
    service.correct.mockResolvedValueOnce({ ok: false, reason: "rpc_error" });
    const { result } = renderHook(() => useQuickLogRevisionMutation("owner-a", handle));

    await act(async () => {
      await result.current.submit("correction", "typo", { note: "Fixed" }, "");
    });
    await act(async () => {
      const blocked = await result.current.submit("retraction", "accidental", {}, "");
      expect(blocked).toEqual({ ok: false, reason: "rpc_error" });
    });
    expect(service.retract).not.toHaveBeenCalled();
    expect(result.current.pendingKind).toBe("correction");
  });

  it("clears unconfirmed state after an explicit pre-commit rejection", async () => {
    service.correct.mockResolvedValueOnce({ ok: false, reason: "invalid_changes" });
    const { result } = renderHook(() => useQuickLogRevisionMutation("owner-a", handle));

    await act(async () => {
      await result.current.submit("correction", "typo", { note: "Bad" }, "");
    });
    expect(result.current.unconfirmed).toBe(false);
    expect(result.current.pendingKind).toBeNull();

    await act(async () => {
      await result.current.submit("correction", "typo", { note: "Good" }, "");
    });
    expect(service.correct.mock.calls[1][4]).not.toBe(service.correct.mock.calls[0][4]);
  });

  it("ignores in-flight duplicate submits before React rerenders", async () => {
    let finish!: () => void;
    service.correct.mockImplementationOnce(
      () =>
        new Promise<typeof receipt>((resolve) => {
          finish = () => resolve(receipt);
        }),
    );
    const { result } = renderHook(() => useQuickLogRevisionMutation("owner-a", handle));

    let first!: Promise<unknown>;
    await act(async () => {
      first = result.current.submit("correction", "typo", { note: "Fixed" }, "");
      await result.current.submit("correction", "typo", { note: "Fixed" }, "");
    });
    expect(service.correct).toHaveBeenCalledOnce();
    await act(async () => finish());
    await first!;
  });
});
