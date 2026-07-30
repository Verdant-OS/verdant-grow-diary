import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useIsMobile } from "./use-mobile";

const originalMatchMedia = window.matchMedia;
const originalInnerWidth = Object.getOwnPropertyDescriptor(window, "innerWidth");

function setWindowWidth(width: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
}

afterEach(() => {
  window.matchMedia = originalMatchMedia;
  if (originalInnerWidth) Object.defineProperty(window, "innerWidth", originalInnerWidth);
  vi.restoreAllMocks();
});

describe("useIsMobile", () => {
  it("falls back to resize events when matchMedia is unavailable", () => {
    const removeEventListener = vi.spyOn(window, "removeEventListener");
    setWindowWidth(767);
    window.matchMedia = undefined as unknown as typeof window.matchMedia;

    const { result, unmount } = renderHook(() => useIsMobile());

    expect(result.current).toBe(true);

    setWindowWidth(768);
    act(() => window.dispatchEvent(new Event("resize")));
    expect(result.current).toBe(false);

    unmount();
    expect(removeEventListener).toHaveBeenCalledWith("resize", expect.any(Function));
  });

  it("falls back to resize events when matchMedia rejects the query", () => {
    setWindowWidth(900);
    window.matchMedia = vi.fn(() => {
      throw new Error("matchMedia is unavailable");
    }) as unknown as typeof window.matchMedia;

    const { result } = renderHook(() => useIsMobile());

    expect(result.current).toBe(false);

    setWindowWidth(700);
    act(() => window.dispatchEvent(new Event("resize")));
    expect(result.current).toBe(true);
  });

  it("uses and cleans up modern MediaQueryList listeners", () => {
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    setWindowWidth(900);
    window.matchMedia = vi.fn(() => ({
      addEventListener,
      removeEventListener,
    })) as unknown as typeof window.matchMedia;

    const { result, unmount } = renderHook(() => useIsMobile());
    const listener = addEventListener.mock.calls[0]?.[1] as () => void;

    expect(result.current).toBe(false);
    expect(addEventListener).toHaveBeenCalledWith("change", expect.any(Function));

    setWindowWidth(700);
    act(listener);
    expect(result.current).toBe(true);

    unmount();
    expect(removeEventListener).toHaveBeenCalledWith("change", listener);
  });

  it("uses and cleans up legacy MediaQueryList listeners", () => {
    const addListener = vi.fn();
    const removeListener = vi.fn();
    window.matchMedia = vi.fn(() => ({
      addListener,
      removeListener,
    })) as unknown as typeof window.matchMedia;

    const { unmount } = renderHook(() => useIsMobile());
    const listener = addListener.mock.calls[0]?.[0] as () => void;

    expect(addListener).toHaveBeenCalledWith(expect.any(Function));

    unmount();
    expect(removeListener).toHaveBeenCalledWith(listener);
  });
});
