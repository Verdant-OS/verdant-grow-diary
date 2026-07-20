import { act, renderHook } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { usePlantDetailDisclosureNavigation } from "@/hooks/usePlantDetailDisclosureNavigation";

function wrapper(initialEntry: string) {
  return function RouterWrapper({ children }: PropsWithChildren) {
    return <MemoryRouter initialEntries={[initialEntry]}>{children}</MemoryRouter>;
  };
}

describe("usePlantDetailDisclosureNavigation", () => {
  let frames: FrameRequestCallback[];
  let cancelAnimationFrame: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    frames = [];
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback: FrameRequestCallback) => {
        frames.push(callback);
        return frames.length;
      }),
    );
    cancelAnimationFrame = vi.fn();
    vi.stubGlobal("cancelAnimationFrame", cancelAnimationFrame);
  });

  afterEach(() => {
    document.body.replaceChildren();
    window.history.replaceState(null, "", "/");
    vi.unstubAllGlobals();
  });

  function flushLatestFrame() {
    const frame = frames.shift();
    if (frame) act(() => frame(0));
  }

  it("opens a direct-hash group before focusing and scrolling its target", () => {
    const target = document.createElement("section");
    target.id = "plant-ai-doctor-review";
    target.scrollIntoView = vi.fn();
    document.body.appendChild(target);

    const { result } = renderHook(
      () => usePlantDetailDisclosureNavigation({ plantId: "plant-1" }),
      { wrapper: wrapper("/plants/plant-1#plant-ai-doctor-review") },
    );

    expect(result.current.openGroups.ai).toBe(true);
    expect(document.activeElement).not.toBe(target);
    flushLatestFrame();
    expect(target.scrollIntoView).toHaveBeenCalled();
    expect(document.activeElement).toBe(target);
  });

  it("keeps always-visible anchors out of disclosure state", () => {
    const target = document.createElement("section");
    target.id = "plant-overview";
    target.scrollIntoView = vi.fn();
    document.body.appendChild(target);

    const { result } = renderHook(
      () => usePlantDetailDisclosureNavigation({ plantId: "plant-1" }),
      { wrapper: wrapper("/plants/plant-1#plant-overview") },
    );
    expect(result.current.openGroups).toEqual({
      history: false,
      harvest: false,
      ai: false,
    });
    flushLatestFrame();
    expect(document.activeElement).toBe(target);
  });

  it("the coordinator reveals a group before its deferred scroll", () => {
    const anchor = document.createElement("section");
    anchor.id = "plant-relative-timeline";
    const item = document.createElement("article");
    item.scrollIntoView = vi.fn();
    document.body.append(anchor, item);

    const { result } = renderHook(
      () => usePlantDetailDisclosureNavigation({ plantId: "plant-1" }),
      { wrapper: wrapper("/plants/plant-1") },
    );

    act(() => result.current.revealAndNavigate("plant-relative-timeline", item));
    expect(result.current.openGroups.history).toBe(true);
    expect(item.scrollIntoView).not.toHaveBeenCalled();
    flushLatestFrame();
    expect(item.scrollIntoView).toHaveBeenCalled();
    expect(document.activeElement).toBe(item);
  });

  it("reacts to a native same-page hash change after mount", () => {
    const target = document.createElement("section");
    target.id = "plant-recent-activity";
    target.scrollIntoView = vi.fn();
    document.body.appendChild(target);

    const { result } = renderHook(
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
    expect(target.scrollIntoView).toHaveBeenCalled();
    expect(document.activeElement).toBe(target);
  });

  it("resets groups on plant change and fails closed for an unknown target", () => {
    const { result, rerender } = renderHook(
      ({ plantId }) => usePlantDetailDisclosureNavigation({ plantId }),
      {
        initialProps: { plantId: "plant-1" },
        wrapper: wrapper("/plants/plant-1"),
      },
    );
    act(() => result.current.setGroupOpen("history", true));
    act(() => result.current.setGroupOpen("ai", true));
    expect(result.current.openGroups.history).toBe(true);
    expect(result.current.openGroups.ai).toBe(true);

    rerender({ plantId: "plant-2" });
    expect(result.current.openGroups).toEqual({
      history: false,
      harvest: false,
      ai: false,
    });

    act(() => result.current.revealAndNavigate("plant/unknown"));
    expect(result.current.openGroups).toEqual({
      history: false,
      harvest: false,
      ai: false,
    });
  });

  it("reopens only the direct-hash group after a plant identity change", () => {
    const { result, rerender } = renderHook(
      ({ plantId }) => usePlantDetailDisclosureNavigation({ plantId }),
      {
        initialProps: { plantId: "plant-a" },
        wrapper: wrapper("/plants/plant-a#plant-ai-doctor-review"),
      },
    );
    act(() => result.current.setGroupOpen("history", true));
    act(() => result.current.setGroupOpen("harvest", true));
    expect(result.current.openGroups).toEqual({
      history: true,
      harvest: true,
      ai: true,
    });

    rerender({ plantId: "plant-b" });
    expect(result.current.openGroups).toEqual({
      history: false,
      harvest: false,
      ai: true,
    });
  });

  it("cancels a pending animation frame on replacement and cleanup", () => {
    const target = document.createElement("section");
    target.id = "plant-relative-timeline";
    document.body.appendChild(target);

    const { result, unmount } = renderHook(
      () => usePlantDetailDisclosureNavigation({ plantId: "plant-1" }),
      { wrapper: wrapper("/plants/plant-1") },
    );
    act(() => result.current.revealAndNavigate("plant-relative-timeline"));
    act(() => result.current.revealAndNavigate("plant-ai-doctor-review"));
    expect(cancelAnimationFrame).toHaveBeenCalledWith(1);
    unmount();
    expect(cancelAnimationFrame).toHaveBeenCalledWith(2);
  });
});
