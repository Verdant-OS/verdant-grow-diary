import { act, renderHook } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { MemoryRouter } from "@/lib/react-router-compat";
import { afterEach, describe, expect, it, vi } from "vitest";

import { usePlantDetailDisclosureNavigation } from "@/hooks/usePlantDetailDisclosureNavigation";

/**
 * #2019 follow-up: after #2247 a plant-page hash to the AI Doctor review still
 * stopped with the section's top ~214 px above the screen. A `block: "center"`
 * alignment centers a section taller than the viewport, which puts its top
 * off screen. A hash landing, and every follow correction while cards above
 * it load, must align the section's top to the top of the screen. The
 * section's `scroll-mt-16` then leaves room for the sticky header.
 */
function wrapper(initialEntry: string) {
  return function RouterWrapper({ children }: PropsWithChildren) {
    return <MemoryRouter initialEntries={[initialEntry]}>{children}</MemoryRouter>;
  };
}

describe("plant detail hash landing aligns the section top (#2019 follow-up)", () => {
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

  function installResizeObservers() {
    const observers: Array<{ callback: ResizeObserverCallback }> = [];
    class LayoutResizeObserver {
      callback: ResizeObserverCallback;
      disconnect = vi.fn();
      constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
        observers.push(this);
      }
      observe() {}
      unobserve() {}
    }
    vi.stubGlobal("ResizeObserver", LayoutResizeObserver);
    return observers;
  }

  it("aligns the hash target's top on landing and on each layout correction", () => {
    installAnimationFrames();
    const observers = installResizeObservers();

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
    expect(target.scrollIntoView).toHaveBeenLastCalledWith(
      expect.objectContaining({ block: "start" }),
    );

    // Cards above the section finish loading and the document grows.
    act(() => {
      observers[0]?.callback([], observers[0] as unknown as ResizeObserver);
    });
    expect(target.scrollIntoView).toHaveBeenCalledTimes(2);
    expect(target.scrollIntoView).toHaveBeenLastCalledWith(
      expect.objectContaining({ block: "start" }),
    );

    for (const [options] of vi.mocked(target.scrollIntoView).mock.calls) {
      expect(options).not.toEqual(expect.objectContaining({ block: "center" }));
    }
    unmount();
  });
});
