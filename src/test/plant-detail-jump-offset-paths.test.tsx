import { act, fireEvent, render, renderHook } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { PropsWithChildren } from "react";
import { MemoryRouter } from "@/lib/react-router-compat";
import { afterEach, describe, expect, it, vi } from "vitest";

import PlantDetailSectionNav from "@/components/PlantDetailSectionNav";
import { usePlantDetailDisclosureNavigation } from "@/hooks/usePlantDetailDisclosureNavigation";
import {
  APP_SHELL_HEADER_BORDER_PX,
  APP_SHELL_HEADER_ROW_PX,
  APP_SHELL_STICKY_HEADER_PX,
} from "@/lib/appShellHeaderMetrics";
import {
  PLANT_DETAIL_JUMP_GAP_PX,
  PLANT_DETAIL_JUMP_SCROLL_MARGIN_PX,
  PLANT_DETAIL_STICKY_HEADER_PX,
} from "@/lib/plantDetailJumpScroll";
import { PLANT_DETAIL_SECTION_ANCHORS } from "@/lib/plantDetailSectionAnchors";

/**
 * #2659 review (Reviewer C P2-1, P3-2): one shared header-height source for
 * AppShell and the jump offset, and coverage of every scroll path.
 */
const EXPECTED_MARGIN = `${PLANT_DETAIL_JUMP_SCROLL_MARGIN_PX}px`;
const frames: FrameRequestCallback[] = [];

function installFrames() {
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => frames.push(cb));
  vi.stubGlobal("cancelAnimationFrame", () => {});
}
function flushFrames() {
  act(() => frames.splice(0).forEach((cb) => cb(0)));
}
function wrapperAt(entry: string) {
  return function W({ children }: PropsWithChildren) {
    return <MemoryRouter initialEntries={[entry]}>{children}</MemoryRouter>;
  };
}
function mountSection(id: string) {
  const el = document.createElement("section");
  el.id = id;
  el.scrollIntoView = vi.fn();
  document.body.append(el);
  return el;
}

describe("shared AppShell header height", () => {
  it("derives the 65px sticky header (64px row + 1px border) and a 77px jump offset", () => {
    expect(APP_SHELL_HEADER_ROW_PX).toBe(64);
    expect(APP_SHELL_HEADER_BORDER_PX).toBe(1);
    expect(APP_SHELL_STICKY_HEADER_PX).toBe(65);
    expect(PLANT_DETAIL_STICKY_HEADER_PX).toBe(APP_SHELL_STICKY_HEADER_PX);
    expect(PLANT_DETAIL_JUMP_SCROLL_MARGIN_PX).toBe(
      APP_SHELL_STICKY_HEADER_PX + PLANT_DETAIL_JUMP_GAP_PX,
    );
  });

  it("AppShell sizes its header row from the shared constant", () => {
    const src = readFileSync(resolve(__dirname, "../components/AppShell.tsx"), "utf8");
    expect(src).toMatch(/from "@\/lib\/appShellHeaderMetrics"/);
    expect(src).toMatch(/style=\{\{ height: APP_SHELL_HEADER_ROW_PX \}\}/);
  });
});

describe("jump offset on every scroll path", () => {
  afterEach(() => {
    frames.length = 0;
    document.body.innerHTML = "";
    window.location.hash = "";
    vi.unstubAllGlobals();
  });

  it("route-hash landing applies the offset and aligns start", () => {
    installFrames();
    const section = mountSection(PLANT_DETAIL_SECTION_ANCHORS.timeline);
    const { unmount } = renderHook(
      () => usePlantDetailDisclosureNavigation({ plantId: "plant-1" }),
      { wrapper: wrapperAt(`/plants/plant-1#${PLANT_DETAIL_SECTION_ANCHORS.timeline}`) },
    );
    flushFrames();
    expect(section.style.scrollMarginTop).toBe(EXPECTED_MARGIN);
    expect(section.scrollIntoView).toHaveBeenCalledWith(
      expect.objectContaining({ block: "start" }),
    );
    unmount();
  });

  it("hashchange landing applies the offset and aligns start", () => {
    installFrames();
    const section = mountSection(PLANT_DETAIL_SECTION_ANCHORS.alerts);
    const { unmount } = renderHook(
      () => usePlantDetailDisclosureNavigation({ plantId: "plant-1" }),
      { wrapper: wrapperAt("/plants/plant-1") },
    );
    flushFrames();
    window.location.hash = `#${PLANT_DETAIL_SECTION_ANCHORS.alerts}`;
    act(() => {
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    flushFrames();
    expect(section.style.scrollMarginTop).toBe(EXPECTED_MARGIN);
    expect(section.scrollIntoView).toHaveBeenLastCalledWith(
      expect.objectContaining({ block: "start" }),
    );
    unmount();
  });

  it("item reveal through the hook applies the offset and stays centered", () => {
    installFrames();
    mountSection(PLANT_DETAIL_SECTION_ANCHORS.timeline);
    const item = document.createElement("article");
    item.scrollIntoView = vi.fn();
    document.body.append(item);
    const { result, unmount } = renderHook(
      () => usePlantDetailDisclosureNavigation({ plantId: "plant-1" }),
      { wrapper: wrapperAt("/plants/plant-1") },
    );
    act(() => result.current.revealAndNavigate(PLANT_DETAIL_SECTION_ANCHORS.timeline, item));
    flushFrames();
    expect(item.style.scrollMarginTop).toBe(EXPECTED_MARGIN);
    expect(item.scrollIntoView).toHaveBeenLastCalledWith(
      expect.objectContaining({ block: "center" }),
    );
    unmount();
  });

  it("PlantDetailSectionNav fallback (no coordinator) applies the offset and aligns start", () => {
    const section = mountSection(PLANT_DETAIL_SECTION_ANCHORS.overview);
    const { getByTestId } = render(<PlantDetailSectionNav hasAssignedTent />);
    fireEvent.click(getByTestId("plant-detail-section-link-overview"));
    expect(section.style.scrollMarginTop).toBe(EXPECTED_MARGIN);
    expect(section.scrollIntoView).toHaveBeenCalledWith(
      expect.objectContaining({ block: "start" }),
    );
  });
});
