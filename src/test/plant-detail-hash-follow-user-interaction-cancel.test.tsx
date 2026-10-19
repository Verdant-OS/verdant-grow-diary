import { act, render, screen } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { MemoryRouter } from "@/lib/react-router-compat";
import { afterEach, describe, expect, it, vi } from "vitest";

import { usePlantDetailDisclosureNavigation } from "@/hooks/usePlantDetailDisclosureNavigation";

/**
 * #2019: keep the brief automatic alignment while cards load, and stop it
 * immediately on any user interaction, including pointerdown on plain text.
 * An in-flight smooth scroll is halted with scrollTo({ behavior: "instant" }).
 */
const PLANT_ROUTE = "/plants/plant-1#plant-ai-doctor-review";
const AI_DOCTOR_ANCHOR_ID = "plant-ai-doctor-review";

const frames: Array<{ id: number; callback: FrameRequestCallback }> = [];
const originalScrollTo = window.scrollTo;
const hadPrototypeScrollIntoView = Object.prototype.hasOwnProperty.call(
  Element.prototype,
  "scrollIntoView",
);

function RouterWrapper({ children }: PropsWithChildren) {
  return <MemoryRouter initialEntries={[PLANT_ROUTE]}>{children}</MemoryRouter>;
}

function Harness() {
  usePlantDetailDisclosureNavigation({ plantId: "plant-1" });
  return (
    <>
      <p data-testid="plain">text</p>
      <section id={AI_DOCTOR_ANCHOR_ID} />
    </>
  );
}

type ObserverRecord = {
  callback: ResizeObserverCallback;
  disconnect: ReturnType<typeof vi.fn>;
};

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
  const observers: ObserverRecord[] = [];
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

function grow(observers: ObserverRecord[]) {
  act(() => {
    for (const observer of observers) {
      observer.callback([], observer as unknown as ResizeObserver);
    }
  });
}

function plainTextNode(): Text {
  const textNode = screen.getByTestId("plain").firstChild;
  if (!(textNode instanceof Text)) {
    throw new Error("plain text node missing");
  }
  return textNode;
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe("plant detail hash follow cancels on user interaction (#2019)", () => {
  afterEach(() => {
    frames.length = 0;
    window.scrollTo = originalScrollTo;
    document.body.replaceChildren();
    window.history.replaceState(null, "", "/");
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    if (!hadPrototypeScrollIntoView) {
      delete (Element.prototype as { scrollIntoView?: () => void }).scrollIntoView;
    }
  });

  function startAlignment() {
    vi.useFakeTimers();
    installAnimationFrames();
    const observers = installResizeObservers();
    if (!hadPrototypeScrollIntoView) {
      Object.defineProperty(Element.prototype, "scrollIntoView", {
        configurable: true,
        writable: true,
        value: () => {},
      });
    }
    const scrollIntoView = vi
      .spyOn(Element.prototype, "scrollIntoView")
      .mockImplementation(() => {});
    window.scrollTo = vi.fn();
    render(<Harness />, { wrapper: RouterWrapper });
    return { observers, scrollIntoView };
  }

  it("keeps correcting alignment while cards load, then stops after the follow window", () => {
    const { observers, scrollIntoView } = startAlignment();
    flushFrames();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);

    advance(100);
    grow(observers);
    expect(scrollIntoView).toHaveBeenCalledTimes(2);

    advance(400);
    grow(observers);
    expect(scrollIntoView).toHaveBeenCalledTimes(3);

    advance(1000);
    grow(observers);
    expect(scrollIntoView).toHaveBeenCalledTimes(4);

    advance(1501);
    grow(observers);
    expect(scrollIntoView).toHaveBeenCalledTimes(4);
  });

  it.each<[string, () => void]>([
    ["wheel", () => window.dispatchEvent(new Event("wheel"))],
    [
      "touchstart on plain text",
      () => screen.getByTestId("plain").dispatchEvent(new Event("touchstart", { bubbles: true })),
    ],
    ["keydown", () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }))],
    [
      "pointerdown on a plain text node",
      () => plainTextNode().dispatchEvent(new Event("pointerdown", { bubbles: true })),
    ],
  ])("stops hash-scroll alignment on %s so no further scroll happens", (_label, dispatch) => {
    const { observers, scrollIntoView } = startAlignment();
    flushFrames();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);

    advance(300);
    act(() => {
      dispatch();
    });

    expect
      .soft(window.scrollTo)
      .toHaveBeenCalledWith(expect.objectContaining({ top: window.scrollY, behavior: "instant" }));

    const callsAfterInteraction = scrollIntoView.mock.calls.length;
    grow(observers);
    flushFrames();
    expect(scrollIntoView).toHaveBeenCalledTimes(callsAfterInteraction);
  });

  it("does not run a pending scheduleNavigation frame after pointerdown on plain text", () => {
    const { scrollIntoView } = startAlignment();
    expect(frames).toHaveLength(1);

    advance(300);
    act(() => {
      plainTextNode().dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });

    flushFrames();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});
