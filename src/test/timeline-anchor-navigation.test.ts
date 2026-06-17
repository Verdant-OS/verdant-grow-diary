/**
 * timelineAnchorNavigation — helper tests.
 *
 * Covers:
 *  - cross-page navigation via router push
 *  - cross-page navigation falls back to `assign` when no router
 *  - same-page smooth-scroll when entry element exists
 *  - same-page fallback to `#timeline` section when entry absent
 *  - one-shot retry when element appears late, then hash fallback
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isSameTimelinePage,
  navigateToTimelineAnchor,
  scrollTimelineAnchorIntoView,
} from "@/lib/timelineAnchorNavigation";

function makeTarget(overrides?: Partial<{ path: string; hash: string }>) {
  const path = overrides?.path ?? "/plants/plant-1";
  const hash = overrides?.hash ?? "timeline-entry-ge-1";
  return { path, hash, href: `${path}#${hash}` };
}

describe("isSameTimelinePage", () => {
  it("true when current path matches target", () => {
    expect(isSameTimelinePage({ path: "/plants/p1" }, "/plants/p1")).toBe(true);
  });
  it("false on mismatch", () => {
    expect(isSameTimelinePage({ path: "/plants/p1" }, "/tents/t1")).toBe(false);
  });
  it("false when current path is null/undefined", () => {
    expect(isSameTimelinePage({ path: "/plants/p1" }, null)).toBe(false);
    expect(isSameTimelinePage({ path: "/plants/p1" }, undefined)).toBe(false);
  });
});

describe("scrollTimelineAnchorIntoView", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("scrolls element when present", () => {
    const el = document.createElement("div");
    el.id = "timeline-entry-x";
    const spy = vi.fn();
    (el as unknown as { scrollIntoView: typeof spy }).scrollIntoView = spy;
    document.body.appendChild(el);

    expect(scrollTimelineAnchorIntoView("timeline-entry-x")).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
  });

  it("returns false when element absent", () => {
    expect(scrollTimelineAnchorIntoView("missing-anchor")).toBe(false);
  });

  it("returns false for empty hash", () => {
    expect(scrollTimelineAnchorIntoView("")).toBe(false);
  });
});

describe("navigateToTimelineAnchor — cross-page", () => {
  it("calls router navigate with href when current path differs", () => {
    const navigate = vi.fn();
    navigateToTimelineAnchor(makeTarget(), {
      navigate,
      currentPath: "/somewhere-else",
    });
    expect(navigate).toHaveBeenCalledWith("/plants/plant-1#timeline-entry-ge-1");
  });

  it("falls back to assign when navigate is null", () => {
    const assign = vi.fn();
    navigateToTimelineAnchor(makeTarget(), {
      navigate: null,
      currentPath: "/somewhere-else",
      assign,
    });
    expect(assign).toHaveBeenCalledWith("/plants/plant-1#timeline-entry-ge-1");
  });
});

describe("navigateToTimelineAnchor — same-page", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("scrolls existing entry without invoking navigate", () => {
    const el = document.createElement("div");
    el.id = "timeline-entry-ge-1";
    const scroll = vi.fn();
    (el as unknown as { scrollIntoView: typeof scroll }).scrollIntoView = scroll;
    document.body.appendChild(el);

    const navigate = vi.fn();
    navigateToTimelineAnchor(makeTarget(), {
      navigate,
      currentPath: "/plants/plant-1",
    });

    expect(navigate).not.toHaveBeenCalled();
    expect(scroll).toHaveBeenCalledTimes(1);
  });

  it("retries once when element appears late and then succeeds", () => {
    const navigate = vi.fn();
    const target = makeTarget();

    navigateToTimelineAnchor(target, {
      navigate,
      currentPath: "/plants/plant-1",
      retryDelayMs: 50,
    });
    expect(navigate).not.toHaveBeenCalled();

    // Element appears before retry fires.
    const el = document.createElement("div");
    el.id = "timeline-entry-ge-1";
    const scroll = vi.fn();
    (el as unknown as { scrollIntoView: typeof scroll }).scrollIntoView = scroll;
    document.body.appendChild(el);

    vi.advanceTimersByTime(60);
    expect(scroll).toHaveBeenCalledTimes(1);
  });

  it("falls back to setting location.hash when retry still finds no element", () => {
    const navigate = vi.fn();
    navigateToTimelineAnchor(
      { path: "/plants/p1", hash: "timeline", href: "/plants/p1#timeline" },
      { navigate, currentPath: "/plants/p1", retryDelayMs: 50 },
    );
    vi.advanceTimersByTime(60);
    expect(window.location.hash).toBe("#timeline");
  });
});
