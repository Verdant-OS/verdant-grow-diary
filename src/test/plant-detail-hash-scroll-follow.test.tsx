import { act, renderHook } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { MemoryRouter } from "@/lib/react-router-compat";
import { afterEach, describe, expect, it, vi } from "vitest";

import { usePlantDetailDisclosureNavigation } from "@/hooks/usePlantDetailDisclosureNavigation";

/**
 * #2019: a plant-page hash to the AI Doctor review scrolls once, then cards
 * above the anchor finish loading and push the section down. The hook must
 * keep the anchor in view while the document grows, and stop when the grower
 * scrolls or the short follow window ends.
 */
function wrapper(initialEntry: string) {
  return function RouterWrapper({ children }: PropsWithChildren) {
    return <MemoryRouter initialEntries={[initialEntry]}>{children}</MemoryRouter>;
  };
}

describe("plant detail hash scroll follow (#2019)", () => {
  const frames: Array<{ id: number; callback: FrameRequestCallback }> = [];

  afterEach(() => {
    frames.length = 0;
    document.body.replaceChildren();
    window.history.replaceState(null, "", "/");
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function installAnimationFrames() {
    let nextFrameId = 0;
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback: FrameRequestCallback) => {
        const id = ++nextFrameId;
        frames.push({ id, callback });
        return id;
      }),
    );
    vi.stubGlobal(
      "cancelAnimationFrame",
      vi.fn((frameId: number) => {
        const index = frames.findIndex(({ id }) => id === frameId);
        if (index >= 0) frames.splice(index, 1);
      }),
    );
  }

  function flushLatestFrame() {
    const frame = frames.shift();
    if (frame) act(() => frame.callback(0));
  }

  it("re-scrolls a hash target while the page grows, then stops on a user scroll", () => {
    installAnimationFrames();
    const observed: Element[] = [];
    const observers: Array<{
      callback: ResizeObserverCallback;
      disconnect: ReturnType<typeof vi.fn>;
    }> = [];
    class ColumnResizeObserver {
      callback: ResizeObserverCallback;
      disconnect = vi.fn();
      constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
        observers.push(this);
      }
      observe(element: Element) {
        observed.push(element);
      }
      unobserve() {}
    }
    vi.stubGlobal("ResizeObserver", ColumnResizeObserver);

    const target = document.createElement("section");
    target.id = "plant-ai-doctor-review";
    target.scrollIntoView = vi.fn();
    document.body.appendChild(target);

    const { unmount } = renderHook(
      () => usePlantDetailDisclosureNavigation({ plantId: "plant-1" }),
      { wrapper: wrapper("/plants/plant-1#plant-ai-doctor-review") },
    );

    flushLatestFrame();
    expect(target.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(observed).toContain(document.documentElement);
    expect(observers).toHaveLength(1);

    act(() => {
      observers[0]?.callback([], observers[0] as unknown as ResizeObserver);
    });
    expect(target.scrollIntoView).toHaveBeenCalledTimes(2);

    act(() => {
      window.dispatchEvent(new Event("wheel"));
    });
    act(() => {
      observers[0]?.callback([], observers[0] as unknown as ResizeObserver);
    });
    expect(target.scrollIntoView).toHaveBeenCalledTimes(2);
    expect(observers[0]?.disconnect).toHaveBeenCalled();
    unmount();
  });

  it("stops following layout growth when the grower types or the follow window ends", () => {
    installAnimationFrames();
    const observers: Array<{
      callback: ResizeObserverCallback;
      disconnect: ReturnType<typeof vi.fn>;
    }> = [];
    class ColumnResizeObserver {
      callback: ResizeObserverCallback;
      disconnect = vi.fn();
      constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
        observers.push(this);
      }
      observe() {}
      unobserve() {}
    }
    vi.stubGlobal("ResizeObserver", ColumnResizeObserver);
    const setTimeoutSpy = vi.spyOn(window, "setTimeout");

    const target = document.createElement("section");
    target.id = "plant-ai-doctor-review";
    target.scrollIntoView = vi.fn();
    document.body.appendChild(target);

    const { unmount } = renderHook(
      () => usePlantDetailDisclosureNavigation({ plantId: "plant-1" }),
      { wrapper: wrapper("/plants/plant-1#plant-ai-doctor-review") },
    );
    flushLatestFrame();
    expect(target.scrollIntoView).toHaveBeenCalledTimes(1);

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    });
    act(() => {
      observers[0]?.callback([], observers[0] as unknown as ResizeObserver);
    });
    expect(target.scrollIntoView).toHaveBeenCalledTimes(1);

    const followTimer = setTimeoutSpy.mock.calls.find(([, delay]) => delay === 3000);
    expect(followTimer?.[0]).toEqual(expect.any(Function));
    unmount();
    expect(observers[0]?.disconnect).toHaveBeenCalled();
  });
});
