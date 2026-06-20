/**
 * DiaryCalendarSection — filter chips tests.
 */
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import DiaryCalendarSection from "@/components/DiaryCalendarSection";
import {
  filterDiaryCalendarGroups,
  buildDiaryCalendarViewModel,
  diaryCalendarEmptyTitleFor,
  DIARY_CALENDAR_FILTERS,
} from "@/lib/diaryCalendarViewModel";

const FIXTURE = [
  { id: "w1", entry_at: "2026-06-10T09:00:00Z", event_type: "watering" },
  { id: "f1", entry_at: "2026-06-10T18:00:00Z", event_type: "feeding" },
  { id: "d1", entry_at: "2026-06-11T08:00:00Z", event_type: "diagnosis" },
];

describe("filterDiaryCalendarGroups", () => {
  it("all returns every supported kind", () => {
    const groups = buildDiaryCalendarViewModel(FIXTURE);
    const all = filterDiaryCalendarGroups(groups, "all");
    expect(all.flatMap((g) => g.events.map((e) => e.id)).sort()).toEqual([
      "d1",
      "f1",
      "w1",
    ]);
  });

  it.each(["watering", "feeding", "diagnosis"] as const)(
    "%s filter returns only that kind",
    (kind) => {
      const groups = buildDiaryCalendarViewModel(FIXTURE);
      const out = filterDiaryCalendarGroups(groups, kind);
      for (const g of out) {
        for (const e of g.events) expect(e.kind).toBe(kind);
        expect(g.counts[kind]).toBeGreaterThan(0);
      }
    },
  );

  it("filter copy mentions the selected kind", () => {
    expect(diaryCalendarEmptyTitleFor("watering")).toMatch(/No watering events/);
    expect(diaryCalendarEmptyTitleFor("feeding")).toMatch(/No feeding events/);
    expect(diaryCalendarEmptyTitleFor("diagnosis")).toMatch(/No diagnosis events/);
    expect(diaryCalendarEmptyTitleFor("all")).toMatch(/watering, feeding, or diagnosis/);
  });

  it("exposes all filter buttons including environment", () => {
    expect(DIARY_CALENDAR_FILTERS.map((f) => f.value)).toEqual([
      "all",
      "watering",
      "feeding",
      "diagnosis",
      "environment",
    ]);
  });

});

describe("DiaryCalendarSection — filter chips UI", () => {
  it("renders chips with default All pressed, others not pressed", () => {
    render(<DiaryCalendarSection rawEntries={FIXTURE} />);
    expect(
      screen.getByTestId("diary-calendar-filter-all"),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByTestId("diary-calendar-filter-watering"),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("clicking Watering shows only watering events", () => {
    render(<DiaryCalendarSection rawEntries={FIXTURE} />);
    fireEvent.click(screen.getByTestId("diary-calendar-filter-watering"));
    expect(
      screen.getByTestId("diary-calendar-filter-watering"),
    ).toHaveAttribute("aria-pressed", "true");
    const events = screen.getAllByTestId("diary-calendar-event");
    expect(events.length).toBe(1);
    expect(events[0]).toHaveTextContent(/Watering/i);
    expect(screen.queryByText(/Feeding details/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Diagnosis details/i)).not.toBeInTheDocument();
  });

  it("clicking Feeding shows only feeding events", () => {
    render(<DiaryCalendarSection rawEntries={FIXTURE} />);
    fireEvent.click(screen.getByTestId("diary-calendar-filter-feeding"));
    const events = screen.getAllByTestId("diary-calendar-event");
    expect(events.length).toBe(1);
    expect(events[0]).toHaveTextContent(/Feeding/);
  });

  it("clicking Diagnosis shows only diagnosis events", () => {
    render(<DiaryCalendarSection rawEntries={FIXTURE} />);
    fireEvent.click(screen.getByTestId("diary-calendar-filter-diagnosis"));
    const events = screen.getAllByTestId("diary-calendar-event");
    expect(events.length).toBe(1);
    expect(events[0]).toHaveTextContent(/Diagnosis/);
  });

  it("shows filter-aware empty copy when no events match", () => {
    render(
      <DiaryCalendarSection
        rawEntries={[
          { id: "w", entry_at: "2026-06-10T09:00:00Z", event_type: "watering" },
        ]}
      />,
    );
    fireEvent.click(screen.getByTestId("diary-calendar-filter-feeding"));
    expect(screen.getByTestId("diary-calendar-empty")).toHaveTextContent(
      /No feeding events logged for June 2026\./i,
    );
  });

  it("filter change does not leak hidden expanded details from removed days", () => {
    const { container } = render(
      <DiaryCalendarSection
        rawEntries={[
          {
            id: "f1",
            entry_at: "2026-06-11T09:00:00Z",
            event_type: "feeding",
            details: {
              nutrients: "FEEDING_SECRET_RECIPE",
              raw_payload: { token: "tok_LEAK" },
            },
          },
          { id: "w1", entry_at: "2026-06-10T09:00:00Z", event_type: "watering" },
        ]}
      />,
    );
    // Newest day is feeding and is expanded by default.
    expect(container.innerHTML).toContain("FEEDING_SECRET_RECIPE");
    fireEvent.click(screen.getByTestId("diary-calendar-filter-watering"));
    expect(container.innerHTML).not.toContain("FEEDING_SECRET_RECIPE");
    expect(container.innerHTML).not.toMatch(/tok_LEAK|raw_payload/);
  });
});
