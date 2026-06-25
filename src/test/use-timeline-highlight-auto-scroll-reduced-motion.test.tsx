import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useTimelineHighlightAutoScroll } from "@/lib/useTimelineHighlightAutoScroll";
import {
  parseTimelineHighlightToken,
  TIMELINE_HIGHLIGHT_TESTID,
  TIMELINE_HIGHLIGHT_ARIA_LABEL,
} from "@/lib/timelineHighlightRules";

function makeNode() {
  const node = {
    scrollIntoView: vi.fn(),
    focus: vi.fn(),
  } as unknown as HTMLElement;
  return node;
}

function entry(id: string, key: string) {
  return {
    id,
    details: { kind: "action_queue_trace", idempotency_key: key },
  };
}

describe("useTimelineHighlightAutoScroll — reduced motion", () => {
  it("skips scrollIntoView when prefers-reduced-motion is reduce", () => {
    const node = makeNode();
    const highlight = parseTimelineHighlightToken("action-queue:aq-1:approved");
    renderHook(() =>
      useTimelineHighlightAutoScroll(highlight, [entry("d1", "action-queue:aq-1:approved")], {
        getNodeById: (id) => (id === "timeline-entry-d1" ? node : null),
        prefersReducedMotion: true,
      }),
    );
    expect((node.scrollIntoView as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    expect((node.focus as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
  });

  it("still scrolls when reduced motion is false", () => {
    const node = makeNode();
    const highlight = parseTimelineHighlightToken("action-queue:aq-1:approved");
    renderHook(() =>
      useTimelineHighlightAutoScroll(highlight, [entry("d1", "action-queue:aq-1:approved")], {
        getNodeById: () => node,
        prefersReducedMotion: false,
      }),
    );
    expect((node.scrollIntoView as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
    expect((node.focus as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
  });

  it("does not re-scroll on rerender with the same highlight token (reduced motion)", () => {
    const node = makeNode();
    const highlight = parseTimelineHighlightToken("action-queue:aq-1:approved");
    const entries = [entry("d1", "action-queue:aq-1:approved")];
    const { rerender } = renderHook(
      ({ h, e }: { h: typeof highlight; e: typeof entries }) =>
        useTimelineHighlightAutoScroll(h, e, {
          getNodeById: () => node,
          prefersReducedMotion: true,
        }),
      { initialProps: { h: highlight, e: entries } },
    );
    rerender({ h: highlight, e: [...entries] });
    expect((node.scrollIntoView as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    expect((node.focus as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
  });

  it("relies on test-injected reduced motion (testid/aria-label invariants intact)", () => {
    // These constants are still consumed by Timeline.tsx to mark the
    // highlighted entry; ensure they remain present so reduced-motion
    // mode keeps the visual highlight discoverable.
    expect(TIMELINE_HIGHLIGHT_TESTID).toBe(
      "timeline-highlighted-action-queue-trace",
    );
    expect(TIMELINE_HIGHLIGHT_ARIA_LABEL).toBe(
      "Highlighted Action Queue diary trace",
    );
  });
});
