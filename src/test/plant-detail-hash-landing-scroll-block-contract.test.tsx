import { act, renderHook } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { MemoryRouter } from "@/lib/react-router-compat";
import { afterEach, describe, expect, it, vi } from "vitest";

import { usePlantDetailDisclosureNavigation } from "@/hooks/usePlantDetailDisclosureNavigation";

/**
 * #2019 follow-up contract: hash landings and their resize corrections use
 * `block: "start"`; coordinator `revealAndNavigate` keeps the default center
 * alignment so in-page section jumps behave differently from deep links.
 */
function wrapper(initialEntry: string) {
  return function RouterWrapper({ children }: PropsWithChildren) {
    return <MemoryRouter initialEntries={[initialEntry]}>{children}</MemoryRouter>;
  };
}

describe("plant detail hash landing scroll block contract (#2019 follow-up)", () => {
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

  it("aligns the hash target's top after a native hashchange, not center", () => {
    installAnimationFrames();

    const target = document.createElement("section");
    target.id = "plant-recent-activity";
    target.scrollIntoView = vi.fn();
    document.body.appendChild(target);

    const { result, unmount } = renderHook(
      () => usePlantDetailDisclosureNavigation({ plantId: "plant-1" }),
      { wrapper: wrapper("/plants/plant-1") },
    );

    expect(result.current.openGroups.history).toBe(false);

    act(() => {
      window.history.replaceState(null, "", "#plant-recent-activity");
      window.dispatchEvent(new Event("hashchange"));
    });
    expect(result.current.openGroups.history).toBe(true);

    flushLatestFrame();
    expect(target.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(target.scrollIntoView).toHaveBeenLastCalledWith(
      expect.objectContaining({ block: "start" }),
    );

    unmount();
  });

  it("keeps centered scroll for revealAndNavigate so in-page jumps differ from hash landings", () => {
    installAnimationFrames();

    const anchor = document.createElement("section");
    anchor.id = "plant-relative-timeline";
    const item = document.createElement("article");
    item.scrollIntoView = vi.fn();
    document.body.append(anchor, item);

    const { result, unmount } = renderHook(
      () => usePlantDetailDisclosureNavigation({ plantId: "plant-1" }),
      { wrapper: wrapper("/plants/plant-1") },
    );

    act(() => result.current.revealAndNavigate("plant-relative-timeline", item));
    flushLatestFrame();

    expect(item.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(item.scrollIntoView).toHaveBeenLastCalledWith(
      expect.objectContaining({ block: "center" }),
    );

    unmount();
  });
});
