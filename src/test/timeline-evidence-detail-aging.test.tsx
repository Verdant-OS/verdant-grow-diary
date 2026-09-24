import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TimelineEvidenceDetailPreview from "@/components/TimelineEvidenceDetailPreview";
import type { TimelineEvidenceDetailInput } from "@/lib/timelineEvidenceDetailViewModel";

const NOW = new Date("2026-09-23T12:00:00Z");
const entry: TimelineEvidenceDetailInput = {
  id: "saved-observation",
  note: "Preserve this history",
  photo_url: "https://example.invalid/photo.jpg",
  entry_at: new Date(NOW.getTime() - 1439 * 60_000).toISOString(),
  details: {
    plant_name: "Plant A",
    source: "manual",
    sensor_snapshot: {
      source: "manual",
      ts: new Date(NOW.getTime() - 1439 * 60_000).toISOString(),
      temp: 24,
      rh: 55,
      vpd: 1.1,
    },
  },
};

describe("open Timeline evidence freshness", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("withdraws recent-context guidance on expiry while preserving the saved record", () => {
    render(<TimelineEvidenceDetailPreview open entry={entry} onClose={vi.fn()} />);
    expect(screen.getByTestId("timeline-evidence-drawer-context")).toHaveTextContent(
      "recent manual sensor snapshot",
    );
    act(() => vi.advanceTimersByTime(120_000));
    expect(screen.getByTestId("timeline-evidence-drawer-context")).toHaveTextContent(
      "Sensor context needs review",
    );
    expect(screen.getByTestId("timeline-evidence-drawer-context")).not.toHaveTextContent(
      "recent manual sensor snapshot",
    );
    expect(screen.getByTestId("timeline-evidence-drawer-note")).toHaveTextContent(entry.note!);
    expect(screen.getByTestId("timeline-evidence-drawer-badges")).toHaveTextContent(
      "Stale snapshot",
    );
  });

  it("only keeps a clock while a valid drawer is open and reevaluates on reopening", () => {
    const close = vi.fn();
    const view = render(
      <TimelineEvidenceDetailPreview open={false} entry={entry} onClose={close} />,
    );
    expect(vi.getTimerCount()).toBe(0);
    view.rerender(<TimelineEvidenceDetailPreview open entry={entry} onClose={close} />);
    expect(vi.getTimerCount()).toBe(1);
    view.rerender(<TimelineEvidenceDetailPreview open={false} entry={entry} onClose={close} />);
    expect(vi.getTimerCount()).toBe(0);
    act(() => vi.advanceTimersByTime(120_000));
    view.rerender(<TimelineEvidenceDetailPreview open entry={entry} onClose={close} />);
    expect(screen.getByTestId("timeline-evidence-drawer-context")).toHaveTextContent(
      "Sensor context needs review",
    );
  });

  it("does not render or start a clock without an entry", () => {
    render(<TimelineEvidenceDetailPreview open entry={null} onClose={vi.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("switches to the selected entry instead of retaining the previous plant's evidence", () => {
    const view = render(<TimelineEvidenceDetailPreview open entry={entry} onClose={vi.fn()} />);
    view.rerender(
      <TimelineEvidenceDetailPreview
        open
        entry={{ id: "other", note: "Plant B note", details: { plant_name: "Plant B" } }}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByTestId("timeline-evidence-drawer-title")).toHaveTextContent("Plant B");
    expect(screen.getByTestId("timeline-evidence-drawer-note")).toHaveTextContent("Plant B note");
    expect(screen.getByTestId("timeline-evidence-drawer-context")).toHaveTextContent(
      "Missing photo/sensor context",
    );
  });
});
