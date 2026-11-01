import { act, renderHook } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { MemoryRouter } from "@/lib/react-router-compat";
import { afterEach, describe, expect, it, vi } from "vitest";

import { usePlantDetailDisclosureNavigation } from "@/hooks/usePlantDetailDisclosureNavigation";
import { PLANT_DETAIL_SECTION_ANCHORS } from "@/lib/plantDetailSectionAnchors";
import {
  PLANT_DETAIL_JUMP_SCROLL_MARGIN_PX,
  PLANT_DETAIL_STICKY_HEADER_PX,
  resolvePlantDetailJumpBlock,
} from "@/lib/plantDetailJumpScroll";

/**
 * Post-merge #2657 (mobile 393x852): JUMP TO buttons landed the Timeline title
 * under the ~64px sticky header. Every jump target must reserve the header plus
 * a gap and align its section top.
 */
function wrapper({ children }: PropsWithChildren) {
  return <MemoryRouter initialEntries={["/plants/plant-1"]}>{children}</MemoryRouter>;
}

const JUMP_KINDS = ["overview", "timeline", "alerts", "actions", "doctor"] as const;

describe("plant detail JUMP TO sticky-header offset", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
  });

  it("reserves more than the sticky header height", () => {
    expect(PLANT_DETAIL_JUMP_SCROLL_MARGIN_PX).toBeGreaterThan(PLANT_DETAIL_STICKY_HEADER_PX);
  });

  it("section jumps align start; item reveals stay centered; explicit block wins", () => {
    expect(resolvePlantDetailJumpBlock(false)).toBe("start");
    expect(resolvePlantDetailJumpBlock(true)).toBe("center");
    expect(resolvePlantDetailJumpBlock(true, "start")).toBe("start");
  });

  it.each(JUMP_KINDS)("offsets and top-aligns the %s jump target", (kind) => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => frames.push(cb));
    vi.stubGlobal("cancelAnimationFrame", () => {});
    const anchorId = PLANT_DETAIL_SECTION_ANCHORS[kind];
    const section = document.createElement("section");
    section.id = anchorId;
    section.scrollIntoView = vi.fn();
    document.body.append(section);

    const { result, unmount } = renderHook(
      () => usePlantDetailDisclosureNavigation({ plantId: "plant-1" }),
      { wrapper },
    );
    act(() => result.current.revealAndNavigate(anchorId));
    act(() => frames.splice(0).forEach((cb) => cb(0)));

    expect(section.style.scrollMarginTop).toBe(`${PLANT_DETAIL_JUMP_SCROLL_MARGIN_PX}px`);
    expect(section.scrollIntoView).toHaveBeenLastCalledWith(
      expect.objectContaining({ block: "start" }),
    );
    unmount();
  });
});
