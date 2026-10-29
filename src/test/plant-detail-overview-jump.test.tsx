import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";
import PlantDetailSectionNav from "@/components/PlantDetailSectionNav";
import { usePlantDetailDisclosureNavigation } from "@/hooks/usePlantDetailDisclosureNavigation";

// VER-301: centering the whole, tall Overview region hides its beginning.
// Exercise the real nav + coordinator. jsdom can check scroll options/focus;
// the companion browser fixture measures the actual viewport landing.
function JumpHarness({ coordinated = true }: { coordinated?: boolean }) {
  const { openGroups, revealAndNavigate } = usePlantDetailDisclosureNavigation({
    plantId: "overview-jump-fixture",
  });
  return (
    <>
      <PlantDetailSectionNav
        hasAssignedTent
        onRevealAndNavigate={coordinated ? revealAndNavigate : undefined}
      />
      <section id="plant-overview" style={{ minHeight: 4800 }}>
        Overview
      </section>
      {openGroups.history && <section id="plant-relative-timeline">Timeline</section>}
      <section id="plant-alerts">Alerts</section>
      <section id="plant-actions">Actions</section>
      {openGroups.ai && <section id="plant-doctor">Doctor</section>}
      <section id="plant-ai-doctor-review">Doctor review</section>
    </>
  );
}

describe("Overview section jump (VER-301)", () => {
  const originalScroll = Object.getOwnPropertyDescriptor(Element.prototype, "scrollIntoView");
  let frames: Map<number, FrameRequestCallback>;
  let nextFrame: number;
  let scroll: ReturnType<typeof vi.fn>;
  let resize: ResizeObserverCallback | undefined;

  beforeEach(() => {
    frames = new Map();
    nextFrame = 0;
    scroll = vi.fn();
    resize = undefined;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.set(++nextFrame, callback);
      return nextFrame;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: ResizeObserverCallback) {
          resize = callback;
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: scroll,
    });
  });

  afterEach(() => {
    cleanup();
    if (originalScroll) Object.defineProperty(Element.prototype, "scrollIntoView", originalScroll);
    else delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function flushFrames() {
    act(() => {
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((callback) => callback(0));
    });
  }

  function mount(coordinated = true, hash = "") {
    render(
      <MemoryRouter initialEntries={[`/plants/overview-jump-fixture${hash}`]}>
        <JumpHarness coordinated={coordinated} />
      </MemoryRouter>,
    );
    flushFrames();
  }

  it.each([true, false])(
    "aligns Overview's start and focuses it (coordinator: %s)",
    (coordinated) => {
      mount(coordinated);
      for (let attempt = 0; attempt < 2; attempt++) {
        fireEvent.click(screen.getByRole("button", { name: "Jump to Overview section" }));
        flushFrames();
        expect(scroll).toHaveBeenLastCalledWith({ behavior: "smooth", block: "start" });
        expect(scroll.mock.instances.at(-1)).toBe(document.getElementById("plant-overview"));
        expect(document.activeElement).toBe(document.getElementById("plant-overview"));
      }
    },
  );

  it.each([
    ["Timeline", "plant-relative-timeline"],
    ["Alerts", "plant-alerts"],
    ["Actions", "plant-actions"],
    ["Doctor", "plant-doctor"],
  ])("preserves %s's centered landing and disclosure reveal", (label, id) => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: `Jump to ${label} section` }));
    flushFrames();
    expect(scroll).toHaveBeenLastCalledWith({ behavior: "smooth", block: "center" });
    expect(scroll.mock.instances.at(-1)).toBe(document.getElementById(id));
    expect(document.activeElement).toBe(document.getElementById(id));
  });

  it("stops an earlier hash follow before Overview takes focus, including later layout growth", () => {
    mount(true, "#plant-ai-doctor-review");
    expect(scroll.mock.instances.at(-1)).toBe(document.getElementById("plant-ai-doctor-review"));
    fireEvent.click(screen.getByRole("button", { name: "Jump to Overview section" }));
    flushFrames();
    const calls = scroll.mock.calls.length;
    act(() => resize?.([], {} as ResizeObserver));
    flushFrames();
    expect(scroll).toHaveBeenCalledTimes(calls);
    expect(scroll).toHaveBeenLastCalledWith({ behavior: "smooth", block: "start" });
    expect(document.activeElement).toBe(document.getElementById("plant-overview"));
  });
});
