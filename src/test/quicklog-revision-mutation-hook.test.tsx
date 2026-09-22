import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  correct: vi.fn(),
  retract: vi.fn(),
}));

vi.mock("@/lib/quickLogRevisionService", () => ({
  correctQuickLogEntry: (...args: unknown[]) => mocks.correct(...args),
  retractQuickLogEntry: (...args: unknown[]) => mocks.retract(...args),
}));

import { useQuickLogRevisionMutation } from "@/hooks/useQuickLogRevisionMutation";

const handle = { growEventId: "event-a" };
const changes = { note: "Corrected note" };
const receipt = {
  ok: true as const,
  revisionId: "revision-a",
  revisionNo: 1,
  growEventId: "event-a",
  diaryEntryIds: ["diary-a"],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.correct.mockResolvedValue(receipt);
  mocks.retract.mockResolvedValue(receipt);
});

describe("useQuickLogRevisionMutation guards", () => {
  it("returns not_authenticated without calling revision RPCs when ownerId is null", async () => {
    const { result } = renderHook(() => useQuickLogRevisionMutation(null, handle));

    let outcome: Awaited<ReturnType<typeof result.current.submit>> | undefined;
    await act(async () => {
      outcome = await result.current.submit("correction", "typo", changes, "Corrected note");
    });

    expect(outcome).toEqual({ ok: false, reason: "not_authenticated" });
    expect(mocks.correct).not.toHaveBeenCalled();
    expect(mocks.retract).not.toHaveBeenCalled();
  });

  it("rejects a retraction submit while an uncertain correction is still pending", async () => {
    mocks.correct.mockResolvedValueOnce({ ok: false, reason: "rpc_error" });
    const { result } = renderHook(() => useQuickLogRevisionMutation("owner-a", handle));

    await act(async () => {
      await result.current.submit("correction", "typo", changes, "Corrected note");
    });
    expect(result.current.unconfirmed).toBe(true);
    expect(result.current.pendingKind).toBe("correction");

    let outcome: Awaited<ReturnType<typeof result.current.submit>> | undefined;
    await act(async () => {
      outcome = await result.current.submit("retraction", "accidental", {}, "Retract");
    });

    expect(outcome).toEqual({ ok: false, reason: "rpc_error" });
    expect(mocks.retract).not.toHaveBeenCalled();
    expect(mocks.correct).toHaveBeenCalledOnce();
  });

  it("rejects a correction submit while an uncertain retraction is still pending", async () => {
    mocks.retract.mockResolvedValueOnce({ ok: false, reason: "rpc_error" });
    const { result } = renderHook(() => useQuickLogRevisionMutation("owner-a", handle));

    await act(async () => {
      await result.current.submit("retraction", "accidental", {}, "Retract");
    });
    expect(result.current.unconfirmed).toBe(true);
    expect(result.current.pendingKind).toBe("retraction");

    let outcome: Awaited<ReturnType<typeof result.current.submit>> | undefined;
    await act(async () => {
      outcome = await result.current.submit("correction", "typo", changes, "Corrected note");
    });

    expect(outcome).toEqual({ ok: false, reason: "rpc_error" });
    expect(mocks.correct).not.toHaveBeenCalled();
    expect(mocks.retract).toHaveBeenCalledOnce();
  });

  it("returns null when submit runs after unmount", async () => {
    let finish!: () => void;
    mocks.correct.mockImplementationOnce(
      () =>
        new Promise<typeof receipt>((resolve) => {
          finish = () => resolve(receipt);
        }),
    );
    const { result, unmount } = renderHook(() => useQuickLogRevisionMutation("owner-a", handle));

    let outcomePromise!: Promise<Awaited<ReturnType<typeof result.current.submit>> | null>;
    act(() => {
      outcomePromise = result.current.submit("correction", "typo", changes, "Corrected note");
    });
    unmount();
    await act(async () => finish());

    await expect(outcomePromise).resolves.toBeNull();
  });
});
