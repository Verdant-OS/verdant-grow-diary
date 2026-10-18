import { act, renderHook } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { MemoryRouter } from "@/lib/react-router-compat";
import { afterEach, describe, expect, it, vi } from "vitest";

import { usePlantDetailDisclosureNavigation } from "@/hooks/usePlantDetailDisclosureNavigation";

/**
 * #2076 follow-up: the hash-landing scroll follow (#2019) must not undo a
 * grower's own navigation. Section-nav and quick-action buttons call
 * `revealAndNavigate` without changing the hash, so the follow has to stop
 * on pointer interaction and before any new programmatic section navigation.
 */
function wrapper(initialEntry: string) {
  return function RouterWrapper({ children }: PropsWithChildren) {
    return <MemoryRouter initialEntries={[initialEntry]}>{children}</MemoryRouter>;
  };
}

describe("plant detail hash follow cancels on grower navigation (#2076)", () => {
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

  function flushFrames() {
    while (frames.length > 0) {
      const frame = frames.shift();
      if (frame) act(() => frame.callback(0));
    }
  }

  function installResizeObservers() {
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
    return observers;
  }

  function mountTargets() {
    const hashTarget = document.createElement("section");
    hashTarget.id = "plant-ai-doctor-review";
    hashTarget.scrollIntoView = vi.fn();
    document.body.appendChild(hashTarget);
    const chosen = document.createElement("section");
    chosen.id = "plant-relative-timeline";
    chosen.scrollIntoView = vi.fn();
    document.body.appendChild(chosen);
    return { hashTarget, chosen };
  }

  function growPage(observers: ReturnType<typeof installResizeObservers>) {
    act(() => {
      for (const observer of observers) {
        observer.callback([], observer as unknown as ResizeObserver);
      }
    });
  }

  it("stops following the landing hash when the grower presses a pointer", () => {
    installAnimationFrames();
    const observers = installResizeObservers();
    const { hashTarget } = mountTargets();

    const { unmount } = renderHook(
      () => usePlantDetailDisclosureNavigation({ plantId: "plant-1" }),
      { wrapper: wrapper("/plants/plant-1#plant-ai-doctor-review") },
    );
    flushFrames();
    expect(hashTarget.scrollIntoView).toHaveBeenCalledTimes(1);

    act(() => {
      window.dispatchEvent(new Event("pointerdown"));
    });
    growPage(observers);

    expect(hashTarget.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(observers[0]?.disconnect).toHaveBeenCalled();
    unmount();
  });

  it("stops following the landing hash before a programmatic section navigation", () => {
    installAnimationFrames();
    const observers = installResizeObservers();
    const { hashTarget, chosen } = mountTargets();

    const { result, unmount } = renderHook(
      () => usePlantDetailDisclosureNavigation({ plantId: "plant-1" }),
      { wrapper: wrapper("/plants/plant-1#plant-ai-doctor-review") },
    );
    flushFrames();
    expect(hashTarget.scrollIntoView).toHaveBeenCalledTimes(1);

    act(() => result.current.revealAndNavigate("plant-relative-timeline"));
    flushFrames();
    expect(chosen.scrollIntoView).toHaveBeenCalledTimes(1);

    // Opening the chosen disclosure grows the page; the old hash must not win.
    growPage(observers);
    expect(hashTarget.scrollIntoView).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("keeps following the landing hash while the grower has not interacted", () => {
    installAnimationFrames();
    const observers = installResizeObservers();
    const { hashTarget } = mountTargets();

    const { unmount } = renderHook(
      () => usePlantDetailDisclosureNavigation({ plantId: "plant-1" }),
      { wrapper: wrapper("/plants/plant-1#plant-ai-doctor-review") },
    );
    flushFrames();
    growPage(observers);

    expect(hashTarget.scrollIntoView).toHaveBeenCalledTimes(2);
    unmount();
  });
});
