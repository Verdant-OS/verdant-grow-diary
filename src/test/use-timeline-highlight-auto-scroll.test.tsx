import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useTimelineHighlightAutoScroll } from "@/lib/useTimelineHighlightAutoScroll";
import { parseTimelineHighlightToken } from "@/lib/timelineHighlightRules";

function makeNode() {
  const node = {
    scrollIntoView: vi.fn(),
    focus: vi.fn(),
  } as unknown as HTMLElement;
  return node;
}

function entry(id: string, key: string | null) {
  return {
    id,
    details: key
      ? { kind: "action_queue_trace", idempotency_key: key }
      : null,
  };
}

describe("useTimelineHighlightAutoScroll", () => {
  it("scrolls + focuses the matching entry once per highlight token", () => {
    const node = makeNode();
    const highlight = parseTimelineHighlightToken("action-queue:aq-1:approved");
    const entries = [entry("d1", "action-queue:aq-1:approved")];
    const { rerender } = renderHook(
      ({ h, e }: { h: typeof highlight; e: typeof entries }) =>
        useTimelineHighlightAutoScroll(h, e, {
          getNodeById: (id) => (id === "timeline-entry-d1" ? node : null),
        }),
      { initialProps: { h: highlight, e: entries } },
    );
    expect((node.scrollIntoView as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
    expect((node.focus as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
    // Re-render with same token must not steal focus again.
    rerender({ h: highlight, e: entries });
    rerender({ h: highlight, e: [...entries] });
    expect((node.scrollIntoView as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
    expect((node.focus as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
  });

  it("re-scrolls when the highlight token changes", () => {
    const node1 = makeNode();
    const node2 = makeNode();
    const h1 = parseTimelineHighlightToken("action-queue:aq-1:approved");
    const h2 = parseTimelineHighlightToken("action-queue:aq-2:rejected");
    const entries1 = [entry("d1", "action-queue:aq-1:approved")];
    const entries2 = [entry("d2", "action-queue:aq-2:rejected")];
    const lookup = (id: string) =>
      id === "timeline-entry-d1" ? node1 : id === "timeline-entry-d2" ? node2 : null;
    const { rerender } = renderHook(
      ({ h, e }: { h: typeof h1; e: typeof entries1 }) =>
        useTimelineHighlightAutoScroll(h, e, { getNodeById: lookup }),
      { initialProps: { h: h1, e: entries1 } },
    );
    expect((node1.scrollIntoView as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
    rerender({ h: h2, e: entries2 });
    expect((node2.scrollIntoView as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
  });

  it("does nothing for null highlight or unmatched entries", () => {
    const node = makeNode();
    const highlight = parseTimelineHighlightToken("action-queue:aq-1:approved");
    renderHook(() =>
      useTimelineHighlightAutoScroll(null, [entry("d1", "action-queue:aq-1:approved")], {
        getNodeById: () => node,
      }),
    );
    expect((node.scrollIntoView as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    renderHook(() =>
      useTimelineHighlightAutoScroll(highlight, [entry("d1", "action-queue:aq-OTHER:approved")], {
        getNodeById: () => node,
      }),
    );
    expect((node.scrollIntoView as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it("does nothing for invalid highlight tokens", () => {
    const node = makeNode();
    const invalid = parseTimelineHighlightToken("garbage");
    renderHook(() =>
      useTimelineHighlightAutoScroll(invalid, [entry("d1", "action-queue:aq-1:approved")], {
        getNodeById: () => node,
      }),
    );
    expect(invalid).toBeNull();
    expect((node.scrollIntoView as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });
});
