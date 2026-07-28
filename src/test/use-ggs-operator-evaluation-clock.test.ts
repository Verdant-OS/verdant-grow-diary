import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GGS_OPERATOR_EVALUATION_INTERVAL_MS,
  useGgsOperatorEvaluationClock,
} from "@/hooks/useGgsOperatorEvaluationClock";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useGgsOperatorEvaluationClock", () => {
  it("uses the injected clock every 30 seconds even when row data is unchanged", () => {
    vi.useFakeTimers();
    let nowMs = 1_000;
    const { result } = renderHook(() =>
      useGgsOperatorEvaluationClock({
        enabled: true,
        now: () => nowMs,
      }),
    );
    expect(result.current).toBe(1_000);

    nowMs = 31_000;
    act(() => {
      vi.advanceTimersByTime(GGS_OPERATOR_EVALUATION_INTERVAL_MS);
    });
    expect(result.current).toBe(31_000);
  });

  it("owns no interval while the query is disabled", () => {
    vi.useFakeTimers();
    const setIntervalSpy = vi.spyOn(window, "setInterval");
    const { result } = renderHook(() =>
      useGgsOperatorEvaluationClock({
        enabled: false,
        now: () => 7_000,
      }),
    );
    expect(result.current).toBe(7_000);
    expect(setIntervalSpy).not.toHaveBeenCalled();
  });

  it("cleans up the enabled interval on unmount", () => {
    vi.useFakeTimers();
    const clearIntervalSpy = vi.spyOn(window, "clearInterval");
    const { unmount } = renderHook(() =>
      useGgsOperatorEvaluationClock({
        enabled: true,
        now: () => 9_000,
      }),
    );
    unmount();
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
  });
});
