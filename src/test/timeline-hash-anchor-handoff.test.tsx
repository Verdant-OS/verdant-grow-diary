import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  parseTimelineEntryAnchorHash,
  useTimelineHashAnchorHandoff,
} from "@/hooks/useTimelineHashAnchorHandoff";

function HandoffHarness({
  hash,
  ready,
  mountTarget,
  prefersReducedMotion = false,
  onScroll,
}: {
  hash: string;
  ready: boolean;
  mountTarget: boolean;
  prefersReducedMotion?: boolean;
  onScroll: ReturnType<typeof vi.fn>;
}) {
  useTimelineHashAnchorHandoff(hash, ready, { prefersReducedMotion });

  return mountTarget ? (
    <li
      id="timeline-entry-grow-event-42"
      ref={(node) => {
        if (node) node.scrollIntoView = onScroll;
      }}
    >
      Saved feeding
    </li>
  ) : null;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Timeline async hash-anchor handoff", () => {
  it("scrolls and focuses exactly once when the target mounts after navigation", () => {
    const scroll = vi.fn();
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    const view = render(
      <HandoffHarness
        hash="#timeline-entry-grow-event-42"
        ready={false}
        mountTarget={false}
        onScroll={scroll}
      />,
    );

    expect(scroll).not.toHaveBeenCalled();

    view.rerender(
      <HandoffHarness
        hash="#timeline-entry-grow-event-42"
        ready={true}
        mountTarget={true}
        onScroll={scroll}
      />,
    );

    const target = document.getElementById("timeline-entry-grow-event-42");
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    expect(target).toHaveAttribute("tabindex", "-1");
    expect(document.activeElement).toBe(target);
    expect(setTimeoutSpy).not.toHaveBeenCalled();

    view.rerender(
      <HandoffHarness
        hash="#timeline-entry-grow-event-42"
        ready={true}
        mountTarget={true}
        onScroll={scroll}
      />,
    );
    expect(scroll).toHaveBeenCalledTimes(1);
  });

  it("uses instant scrolling under reduced motion while retaining focus", () => {
    const scroll = vi.fn();
    render(
      <HandoffHarness
        hash="#timeline-entry-grow-event-42"
        ready={true}
        mountTarget={true}
        prefersReducedMotion={true}
        onScroll={scroll}
      />,
    );

    const target = document.getElementById("timeline-entry-grow-event-42");
    expect(scroll).toHaveBeenCalledWith({ behavior: "auto", block: "start" });
    expect(document.activeElement).toBe(target);
  });

  it("rejects unrelated, empty, and malformed fragments", () => {
    expect(parseTimelineEntryAnchorHash("#timeline-entry-grow-event-42")).toBe(
      "timeline-entry-grow-event-42",
    );
    expect(parseTimelineEntryAnchorHash("#timeline")).toBeNull();
    expect(parseTimelineEntryAnchorHash("#timeline-entry-")).toBeNull();
    expect(parseTimelineEntryAnchorHash("#timeline-entry-%E0%A4%A")).toBeNull();
  });
});
