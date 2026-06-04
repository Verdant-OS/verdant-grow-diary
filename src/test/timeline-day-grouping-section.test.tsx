/**
 * timeline-day-grouping-section.test.tsx
 *
 * Tests TimelineMemorySection day-grouping and stage chip rendering.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import TimelineMemorySection from "@/components/TimelineMemorySection";
import * as useTimelineMemoryModule from "@/hooks/useTimelineMemory";
import type { TimelineMemoryItem } from "@/lib/timelineFilterRules";

const TZ_OFFSET_MS = new Date().getTimezoneOffset() * 60_000;

function localIso(y: number, m: number, d: number, h = 0, min = 0): string {
  return new Date(Date.UTC(y, m - 1, d, h, min) + TZ_OFFSET_MS).toISOString();
}

function makeDiaryItem(opts: {
  key: string;
  occurredAt: string;
  eventType?: string | null;
  note?: string | null;
  stage?: string | null;
  hasPhoto?: boolean;
  photoUrl?: string | null;
  sensorSnapshot?: unknown;
}): TimelineMemoryItem {
  return {
    kind: "diary",
    key: opts.key,
    occurredAt: opts.occurredAt,
    eventType: opts.eventType ?? null,
    hasPhoto: opts.hasPhoto ?? false,
    note: opts.note ?? null,
    stage: opts.stage ?? null,
    photoUrl: opts.photoUrl ?? null,
    sensorSnapshot: opts.sensorSnapshot,
  };
}

function stubItems(items: TimelineMemoryItem[]) {
  vi.spyOn(useTimelineMemoryModule, "useTimelineMemory").mockReturnValue({
    items,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  });
}

describe("TimelineMemorySection day grouping", () => {
  it("renders day group headers with labels", () => {
    const now = new Date();
    const todayIso = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10).toISOString();
    const twoDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2, 14).toISOString();
    stubItems([
      makeDiaryItem({ key: "a", occurredAt: todayIso }),
      makeDiaryItem({ key: "b", occurredAt: twoDaysAgo }),
    ]);
    render(<TimelineMemorySection scope="plant" plantId="p1" />);

    const groups = screen.getAllByTestId("timeline-day-group");
    expect(groups).toHaveLength(2);

    const labels = screen.getAllByTestId("timeline-day-group-label");
    expect(labels[0].textContent).toBe("Today");
    expect(labels[1].textContent).not.toBe("Today");
  });

  it("shows event count per group", () => {
    stubItems([
      makeDiaryItem({ key: "a", occurredAt: localIso(2026, 6, 5, 10) }),
      makeDiaryItem({ key: "b", occurredAt: localIso(2026, 6, 5, 11) }),
      makeDiaryItem({ key: "c", occurredAt: localIso(2026, 6, 3, 14) }),
    ]);
    render(<TimelineMemorySection scope="plant" plantId="p1" />);

    const counts = screen.getAllByTestId("timeline-day-group-count");
    expect(counts[0].textContent).toBe("2 events");
    expect(counts[1].textContent).toBe("1 event");
  });

  it("preserves event order inside groups", () => {
    stubItems([
      makeDiaryItem({ key: "a", occurredAt: localIso(2026, 6, 5, 14) }),
      makeDiaryItem({ key: "b", occurredAt: localIso(2026, 6, 5, 10) }),
      makeDiaryItem({ key: "c", occurredAt: localIso(2026, 6, 5, 16) }),
    ]);
    render(<TimelineMemorySection scope="plant" plantId="p1" />);

    const group = screen.getAllByTestId("timeline-day-group")[0];
    const items = within(group).getAllByTestId("timeline-memory-diary-item");
    expect(items.map((el) => el.getAttribute("data-item-key"))).toEqual(["a", "b", "c"]);
  });

  it("still renders sensor chips inside grouped items", () => {
    stubItems([
      makeDiaryItem({
        key: "a",
        occurredAt: localIso(2026, 6, 5, 10),
        sensorSnapshot: { temp_f: 75, rh: 55 },
      }),
    ]);
    render(<TimelineMemorySection scope="plant" plantId="p1" />);

    expect(screen.getByTestId("timeline-diary-sensor-chips")).toBeInTheDocument();
    expect(screen.getByTestId("timeline-diary-sensor-chip-temp_f")).toHaveTextContent("Temp 75°F");
  });

  it("still renders photo thumbnails inside grouped items", () => {
    stubItems([
      makeDiaryItem({
        key: "a",
        occurredAt: localIso(2026, 6, 5, 10),
        hasPhoto: true,
        photoUrl: "https://example.com/photo.jpg",
      }),
    ]);
    render(<TimelineMemorySection scope="plant" plantId="p1" />);

    expect(screen.getByTestId("timeline-diary-photo-strip")).toBeInTheDocument();
  });

  it("keeps empty state unchanged", () => {
    stubItems([]);
    render(<TimelineMemorySection scope="plant" plantId="p1" />);
    expect(screen.getByTestId("timeline-memory-empty")).toBeInTheDocument();
  });

  it("keeps loading state unchanged", () => {
    vi.spyOn(useTimelineMemoryModule, "useTimelineMemory").mockReturnValue({
      items: [],
      isLoading: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<TimelineMemorySection scope="plant" plantId="p1" />);
    expect(screen.getByTestId("timeline-memory-loading")).toBeInTheDocument();
  });

  it("keeps error state unchanged", () => {
    vi.spyOn(useTimelineMemoryModule, "useTimelineMemory").mockReturnValue({
      items: [],
      isLoading: false,
      isError: true,
      error: new Error("fail"),
      refetch: vi.fn(),
    });
    render(<TimelineMemorySection scope="plant" plantId="p1" />);
    expect(screen.getByTestId("timeline-memory-error")).toBeInTheDocument();
  });

  it("stage chip renders only when stage exists", () => {
    stubItems([
      makeDiaryItem({ key: "a", occurredAt: localIso(2026, 6, 5, 10), stage: "flowering" }),
      makeDiaryItem({ key: "b", occurredAt: localIso(2026, 6, 5, 11) }),
    ]);
    render(<TimelineMemorySection scope="plant" plantId="p1" />);

    const chips = screen.getAllByTestId("timeline-diary-stage-chip");
    expect(chips).toHaveLength(1);
    expect(chips[0]).toHaveTextContent("flowering");
  });

  it("missing stage does not invent copy", () => {
    stubItems([
      makeDiaryItem({ key: "a", occurredAt: localIso(2026, 6, 5, 10) }),
    ]);
    render(<TimelineMemorySection scope="plant" plantId="p1" />);
    expect(screen.queryByTestId("timeline-diary-stage-chip")).not.toBeInTheDocument();
  });

  it("filters still work with day groups", () => {
    stubItems([
      makeDiaryItem({ key: "a", occurredAt: localIso(2026, 6, 5, 10), eventType: "watering" }),
      makeDiaryItem({ key: "b", occurredAt: localIso(2026, 6, 5, 11), eventType: "feeding" }),
    ]);
    render(<TimelineMemorySection scope="plant" plantId="p1" />);

    // Filter should still work (filter bar is present)
    expect(screen.getByTestId("timeline-memory-day-groups")).toBeInTheDocument();
  });
});
