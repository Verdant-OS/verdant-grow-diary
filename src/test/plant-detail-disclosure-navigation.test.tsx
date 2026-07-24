import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { MemoryRouter, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { usePlantDetailDisclosureNavigation } from "@/hooks/usePlantDetailDisclosureNavigation";

const disclosureRenderLog: Array<{
  plantId: string | undefined;
  openGroups: { history: boolean; harvest: boolean; ai: boolean };
}> = [];

function wrapper(initialEntry: string) {
  return function RouterWrapper({ children }: PropsWithChildren) {
    return <MemoryRouter initialEntries={[initialEntry]}>{children}</MemoryRouter>;
  };
}

function NavigableDisclosureHarness() {
  const { plantId } = useParams<{ plantId: string }>();
  const navigate = useNavigate();
  const { openGroups, setGroupOpen } = usePlantDetailDisclosureNavigation({ plantId });
  disclosureRenderLog.push({ plantId, openGroups: { ...openGroups } });

  return (
    <>
      <output data-testid="disclosure-open-groups">{JSON.stringify(openGroups)}</output>
      <button type="button" onClick={() => setGroupOpen("history", true)}>
        Open history
      </button>
      <button type="button" onClick={() => navigate("/plants/plant-b")}>
        Open plant B without hash
      </button>
      <button type="button" onClick={() => navigate("/plants/plant-b#plant-harvest-evidence")}>
        Open plant B harvest evidence
      </button>
      <section id="plant-ai-doctor-review">AI review</section>
      <section id="plant-harvest-evidence">Harvest evidence</section>
    </>
  );
}

function renderNavigableHarness(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/plants/:plantId" element={<NavigableDisclosureHarness />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("usePlantDetailDisclosureNavigation", () => {
  let frames: Array<{ id: number; callback: FrameRequestCallback }>;
  let nextFrameId: number;
  let cancelAnimationFrame: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    disclosureRenderLog.length = 0;
    frames = [];
    nextFrameId = 0;
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback: FrameRequestCallback) => {
        const id = ++nextFrameId;
        frames.push({ id, callback });
        return id;
      }),
    );
    cancelAnimationFrame = vi.fn((frameId: number) => {
      frames = frames.filter(({ id }) => id !== frameId);
    });
    vi.stubGlobal("cancelAnimationFrame", cancelAnimationFrame);
  });

  afterEach(() => {
    document.body.replaceChildren();
    window.history.replaceState(null, "", "/");
    vi.unstubAllGlobals();
  });

  function flushLatestFrame() {
    const frame = frames.shift();
    if (frame) act(() => frame.callback(0));
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

  it("closes every group when route, hash, and plant identity change together to no hash", () => {
    renderNavigableHarness("/plants/plant-a#plant-ai-doctor-review");
    flushLatestFrame();
    fireEvent.click(screen.getByRole("button", { name: "Open history" }));
    expect(screen.getByTestId("disclosure-open-groups")).toHaveTextContent(
      JSON.stringify({ history: true, harvest: false, ai: true }),
    );

    const navigateButton = screen.getByRole("button", { name: "Open plant B without hash" });
    navigateButton.focus();
    fireEvent.click(navigateButton);

    expect(screen.getByTestId("disclosure-open-groups")).toHaveTextContent(
      JSON.stringify({ history: false, harvest: false, ai: false }),
    );
    flushLatestFrame();
    expect(document.activeElement).toBe(navigateButton);
  });

  it("never renders cached plant A disclosure state while plant B has no hash", () => {
    renderNavigableHarness("/plants/plant-a#plant-ai-doctor-review");
    fireEvent.click(screen.getByRole("button", { name: "Open history" }));
    disclosureRenderLog.length = 0;

    fireEvent.click(screen.getByRole("button", { name: "Open plant B without hash" }));

    const firstPlantBRender = disclosureRenderLog.find(({ plantId }) => plantId === "plant-b");
    expect(firstPlantBRender?.openGroups).toEqual({
      history: false,
      harvest: false,
      ai: false,
    });
  });

  it("opens only the current hash group when route, hash, and plant identity change together", () => {
    renderNavigableHarness("/plants/plant-a#plant-ai-doctor-review");
    flushLatestFrame();
    fireEvent.click(screen.getByRole("button", { name: "Open history" }));
    expect(screen.getByTestId("disclosure-open-groups")).toHaveTextContent(
      JSON.stringify({ history: true, harvest: false, ai: true }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Open plant B harvest evidence" }));

    expect(screen.getByTestId("disclosure-open-groups")).toHaveTextContent(
      JSON.stringify({ history: false, harvest: true, ai: false }),
    );
    flushLatestFrame();
    expect(document.activeElement).toBe(document.getElementById("plant-harvest-evidence"));
  });

  it("renders only plant B's hash-derived group on the first cached transition paint", () => {
    renderNavigableHarness("/plants/plant-a#plant-ai-doctor-review");
    fireEvent.click(screen.getByRole("button", { name: "Open history" }));
    disclosureRenderLog.length = 0;

    fireEvent.click(screen.getByRole("button", { name: "Open plant B harvest evidence" }));

    const firstPlantBRender = disclosureRenderLog.find(({ plantId }) => plantId === "plant-b");
    expect(firstPlantBRender?.openGroups).toEqual({
      history: false,
      harvest: true,
      ai: false,
    });
  });

  it("cancels plant A's pending focus frame before the first plant B render settles", () => {
    renderNavigableHarness("/plants/plant-a#plant-ai-doctor-review");
    expect(frames.map(({ id }) => id)).toEqual([1]);

    fireEvent.click(screen.getByRole("button", { name: "Open plant B without hash" }));

    expect(cancelAnimationFrame).toHaveBeenCalledWith(1);
    expect(frames).toHaveLength(0);
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
