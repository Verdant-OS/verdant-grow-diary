/**
 * TimelinePhotoLightbox — UI render coverage. Presentation-only.
 * Verifies open/close, prev/next behavior, keyboard nav, edge disabling,
 * and that alt text is non-empty.
 */
import { describe, it, expect, vi } from "vitest";
import React, { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import TimelinePhotoLightbox from "@/components/TimelinePhotoLightbox";
import type { TimelinePhotoLightboxItem } from "@/lib/timelinePhotoLightboxRules";

const ITEMS: TimelinePhotoLightboxItem[] = [
  { id: "a", photoUrl: "https://x/a.jpg", entryAt: "2025-01-01T00:00:00Z", note: "n1", stage: "veg", plantName: "Blue Dream" },
  { id: "b", photoUrl: "https://x/b.jpg", entryAt: "2025-01-02T00:00:00Z", note: "n2", stage: "veg", plantName: "Northern Lights" },
  { id: "c", photoUrl: "https://x/c.jpg", entryAt: "2025-01-03T00:00:00Z", note: "n3", stage: "flower", plantName: null },
];

function Harness({ start = 0 }: { start?: number }) {
  const [i, setI] = useState<number | null>(start);
  if (i === null) return <div data-testid="closed">closed</div>;
  return (
    <TimelinePhotoLightbox
      items={ITEMS}
      activeIndex={i}
      onClose={() => setI(null)}
      onNavigate={(n) => setI(n)}
    />
  );
}

describe("TimelinePhotoLightbox", () => {
  it("renders the active image with a non-empty accessible alt", () => {
    render(<Harness start={0} />);
    const img = screen.getByTestId("timeline-photo-lightbox-image") as HTMLImageElement;
    expect(img.src).toContain("a.jpg");
    expect(img.alt.length).toBeGreaterThan(0);
    expect(img.alt).toContain("Blue Dream");
  });

  it("Close button closes the lightbox", () => {
    render(<Harness start={0} />);
    fireEvent.click(screen.getByTestId("timeline-photo-lightbox-close"));
    expect(screen.getByTestId("closed")).toBeTruthy();
  });

  it("Next navigates forward, Previous navigates back", () => {
    render(<Harness start={0} />);
    fireEvent.click(screen.getByTestId("timeline-photo-lightbox-next"));
    expect((screen.getByTestId("timeline-photo-lightbox-image") as HTMLImageElement).src).toContain("b.jpg");
    fireEvent.click(screen.getByTestId("timeline-photo-lightbox-prev"));
    expect((screen.getByTestId("timeline-photo-lightbox-image") as HTMLImageElement).src).toContain("a.jpg");
  });

  it("hides Previous at first and Next at last", () => {
    const { rerender } = render(<Harness start={0} />);
    expect(screen.queryByTestId("timeline-photo-lightbox-prev")).toBeNull();
    expect(screen.getByTestId("timeline-photo-lightbox-next")).toBeTruthy();
    rerender(<Harness start={ITEMS.length - 1} />);
    expect(screen.queryByTestId("timeline-photo-lightbox-next")).toBeNull();
    expect(screen.getByTestId("timeline-photo-lightbox-prev")).toBeTruthy();
  });

  it("Escape key closes; Arrow keys navigate", () => {
    render(<Harness start={1} />);
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect((screen.getByTestId("timeline-photo-lightbox-image") as HTMLImageElement).src).toContain("a.jpg");
    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect((screen.getByTestId("timeline-photo-lightbox-image") as HTMLImageElement).src).toContain("c.jpg");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByTestId("closed")).toBeTruthy();
  });

  it("renders single-photo list with no nav buttons", () => {
    const onClose = vi.fn();
    render(
      <TimelinePhotoLightbox
        items={[ITEMS[0]]}
        activeIndex={0}
        onClose={onClose}
        onNavigate={() => {}}
      />,
    );
    expect(screen.queryByTestId("timeline-photo-lightbox-prev")).toBeNull();
    expect(screen.queryByTestId("timeline-photo-lightbox-next")).toBeNull();
  });

  it("does not render when no active item", () => {
    const { container } = render(
      <TimelinePhotoLightbox
        items={[]}
        activeIndex={0}
        onClose={() => {}}
        onNavigate={() => {}}
      />,
    );
    expect(container.querySelector("[data-testid='timeline-photo-lightbox']")).toBeNull();
  });
});
