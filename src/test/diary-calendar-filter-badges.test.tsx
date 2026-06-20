/**
 * DiaryCalendarSection — filter chip count badge tests.
 */
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import DiaryCalendarSection from "@/components/DiaryCalendarSection";
import { computeDiaryCalendarFilterCounts, buildDiaryCalendarViewModel } from "@/lib/diaryCalendarViewModel";

const FIXTURE_MIXED = [
  { id: "w1", entry_at: "2026-06-10T09:00:00Z", event_type: "watering" },
  { id: "w2", entry_at: "2026-06-10T10:00:00Z", event_type: "watering" },
  { id: "w3", entry_at: "2026-06-10T11:00:00Z", event_type: "watering" },
  { id: "f1", entry_at: "2026-06-10T18:00:00Z", event_type: "feeding" },
  { id: "f2", entry_at: "2026-06-11T12:00:00Z", event_type: "feeding" },
  { id: "d1", entry_at: "2026-06-11T08:00:00Z", event_type: "diagnosis" },
  { id: "d2", entry_at: "2026-06-11T09:00:00Z", event_type: "diagnosis" },
];

describe("computeDiaryCalendarFilterCounts", () => {
  it("returns correct counts for each filter from full dataset", () => {
    const groups = buildDiaryCalendarViewModel(FIXTURE_MIXED);
    const counts = computeDiaryCalendarFilterCounts(groups);
    expect(counts.all).toBe(7);
    expect(counts.watering).toBe(3);
    expect(counts.feeding).toBe(2);
    expect(counts.diagnosis).toBe(2);
  });

  it("ignores unsupported event types", () => {
    const groups = buildDiaryCalendarViewModel([
      ...FIXTURE_MIXED,
      { id: "p1", entry_at: "2026-06-12T08:00:00Z", event_type: "photo" },
      { id: "o1", entry_at: "2026-06-12T09:00:00Z", event_type: "observation" },
    ]);
    const counts = computeDiaryCalendarFilterCounts(groups);
    expect(counts.all).toBe(7);
    expect(counts.watering).toBe(3);
    expect(counts.feeding).toBe(2);
    expect(counts.diagnosis).toBe(2);
  });

  it("returns zero for all filters with empty input", () => {
    const counts = computeDiaryCalendarFilterCounts([]);
    expect(counts.all).toBe(0);
    expect(counts.watering).toBe(0);
    expect(counts.feeding).toBe(0);
    expect(counts.diagnosis).toBe(0);
  });
});

describe("DiaryCalendarSection — filter chip count badges", () => {
  it("renders count badges for All, Watering, Feeding, and Diagnosis", () => {
    render(<DiaryCalendarSection rawEntries={FIXTURE_MIXED} />);
    expect(screen.getByTestId("diary-calendar-filter-all")).toHaveTextContent("7");
    expect(screen.getByTestId("diary-calendar-filter-watering")).toHaveTextContent("3");
    expect(screen.getByTestId("diary-calendar-filter-feeding")).toHaveTextContent("2");
    expect(screen.getByTestId("diary-calendar-filter-diagnosis")).toHaveTextContent("2");
  });

  it("accessible chip names include the label and count", () => {
    render(<DiaryCalendarSection rawEntries={FIXTURE_MIXED} />);
    expect(screen.getByTestId("diary-calendar-filter-all")).toHaveAttribute(
      "aria-label",
      "All, 7 events",
    );
    expect(screen.getByTestId("diary-calendar-filter-watering")).toHaveAttribute(
      "aria-label",
      "Watering, 3 events",
    );
    expect(screen.getByTestId("diary-calendar-filter-feeding")).toHaveAttribute(
      "aria-label",
      "Feeding, 2 events",
    );
    expect(screen.getByTestId("diary-calendar-filter-diagnosis")).toHaveAttribute(
      "aria-label",
      "Diagnosis, 2 events",
    );
  });

  it("singular event uses 'event' in accessible name", () => {
    render(
      <DiaryCalendarSection
        rawEntries={[
          { id: "w1", entry_at: "2026-06-10T09:00:00Z", event_type: "watering" },
        ]}
      />,
    );
    expect(screen.getByTestId("diary-calendar-filter-watering")).toHaveAttribute(
      "aria-label",
      "Watering, 1 event",
    );
  });

  it("selected chip still has aria-pressed=true after adding badges", () => {
    render(<DiaryCalendarSection rawEntries={FIXTURE_MIXED} />);
    expect(screen.getByTestId("diary-calendar-filter-all")).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByTestId("diary-calendar-filter-watering"));
    expect(screen.getByTestId("diary-calendar-filter-watering")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("diary-calendar-filter-all")).toHaveAttribute("aria-pressed", "false");
  });

  it("zero-count filters remain visible, enabled, and show empty state on click", () => {
    render(
      <DiaryCalendarSection
        rawEntries={[
          { id: "w1", entry_at: "2026-06-10T09:00:00Z", event_type: "watering" },
        ]}
      />,
    );
    expect(screen.getByTestId("diary-calendar-filter-feeding")).toHaveTextContent("0");
    expect(screen.getByTestId("diary-calendar-filter-feeding")).not.toBeDisabled();
    fireEvent.click(screen.getByTestId("diary-calendar-filter-feeding"));
    expect(screen.getByTestId("diary-calendar-empty")).toHaveTextContent(
      /No feeding events logged for June 2026/i,
    );
  });

  it("selecting a counted chip filters events correctly", () => {
    render(<DiaryCalendarSection rawEntries={FIXTURE_MIXED} />);
    fireEvent.click(screen.getByTestId("diary-calendar-filter-diagnosis"));
    const events = screen.getAllByTestId("diary-calendar-event");
    expect(events.length).toBe(2);
    for (const ev of events) {
      expect(ev).toHaveTextContent(/Diagnosis/i);
    }
  });

  it("does not render raw_payload, service_role, token, or private key strings in badges", () => {
    const { container } = render(
      <DiaryCalendarSection
        rawEntries={[
          {
            id: "w1",
            entry_at: "2026-06-10T09:00:00Z",
            event_type: "watering",
            details: {
              raw_payload: { secret: "tok_LEAK" },
              service_role: "srv_LEAK",
              bearer_token: "Bearer abc",
            },
          },
        ]}
      />,
    );
    const html = container.innerHTML;
    expect(html).not.toMatch(/raw_payload/);
    expect(html).not.toMatch(/service_role/);
    expect(html).not.toMatch(/tok_LEAK/);
    expect(html).not.toMatch(/srv_LEAK/);
    expect(html).not.toMatch(/Bearer abc/);
  });

  it("does not introduce Supabase write or Action Queue strings", () => {
    const { container } = render(<DiaryCalendarSection rawEntries={FIXTURE_MIXED} />);
    const html = container.innerHTML;
    expect(html).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
    expect(html).not.toMatch(/action_queue|Action Queue|device.*control/i);
  });
});
