/**
 * useNowTick — shared minute-tick clock for freshness-sensitive presenters.
 *
 * Pins: returns the current time on mount, re-evaluates on the interval
 * (so an open tab crosses the 30-minute stale boundary without new data
 * or a refetch), and tears the timer down on unmount.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useNowTick } from "@/hooks/useNowTick";

afterEach(() => {
  vi.useRealTimers();
});

describe("useNowTick", () => {
  it("returns the current time on mount", () => {
    vi.useFakeTimers();
    const mounted = Date.now();
    const { result } = renderHook(() => useNowTick());
    expect(Math.abs(result.current - mounted)).toBeLessThan(1000);
  });

  it("advances with the clock every interval — fresh labels can expire", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useNowTick(60_000));
    const first = result.current;
    act(() => {
      vi.advanceTimersByTime(2 * 60_000);
    });
    expect(result.current - first).toBeGreaterThanOrEqual(2 * 60_000);
  });

  it("stops ticking after unmount (no timer leak)", () => {
    vi.useFakeTimers();
    const clearSpy = vi.spyOn(window, "clearInterval");
    const { unmount } = renderHook(() => useNowTick());
    unmount();
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });
});
