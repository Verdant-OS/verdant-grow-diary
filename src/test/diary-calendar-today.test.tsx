/**
 * DiaryCalendarSection — Today button tests.
 * Pure helpers + read-only UI behaviors. No writes; no automation.
 */
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import DiaryCalendarSection from "@/components/DiaryCalendarSection";
import {
  buildDiaryCalendarViewModel,
  currentMonthKey,
  newestMatchingDateKeyInMonth,
} from "@/lib/diaryCalendarViewModel";

const TODAY = new Date(Date.UTC(2026, 5, 15, 12, 0, 0)); // 2026-06-15

const ENTRIES = [
  // April history (older month)
  { id: "apr-w", entry_at: "2026-04-04T09:00:00Z", event_type: "watering" },
  // May history
  { id: "may-w", entry_at: "2026-05-04T09:00:00Z", event_type: "watering" },
  { id: "may-f", entry_at: "2026-05-20T09:00:00Z", event_type: "feeding" },
  // June (current month) events
  { id: "jun-w1", entry_at: "2026-06-10T09:00:00Z", event_type: "watering" },
  { id: "jun-w2", entry_at: "2026-06-12T10:00:00Z", event_type: "watering" },
  { id: "jun-f", entry_at: "2026-06-11T12:00:00Z", event_type: "feeding" },
  { id: "jun-d", entry_at: "2026-06-12T08:00:00Z", event_type: "diagnosis" },
  // Unsupported kinds — must be ignored.
  { id: "ignored-photo", entry_at: "2026-06-15T08:00:00Z", event_type: "photo" },
  { id: "ignored-obs", entry_at: "2026-04-01T08:00:00Z", event_type: "observation" },
];

describe("Today helpers (pure)", () => {
  it("currentMonthKey returns YYYY-MM in UTC", () => {
    expect(currentMonthKey(new Date(Date.UTC(2026, 5, 15)))).toBe("2026-06");
    expect(currentMonthKey(new Date(Date.UTC(2026, 0, 1)))).toBe("2026-01");
    expect(currentMonthKey(new Date(Date.UTC(2026, 11, 31)))).toBe("2026-12");
  });

  it("newestMatchingDateKeyInMonth picks newest matching day under filter", () => {
    const groups = buildDiaryCalendarViewModel(ENTRIES);
    expect(newestMatchingDateKeyInMonth(groups, "2026-06", "all")).toBe(
      "2026-06-12",
    );
    expect(newestMatchingDateKeyInMonth(groups, "2026-06", "feeding")).toBe(
      "2026-06-11",
    );
    expect(newestMatchingDateKeyInMonth(groups, "2026-06", "diagnosis")).toBe(
      "2026-06-12",
    );
    // April has no diagnosis under filter.
    expect(newestMatchingDateKeyInMonth(groups, "2026-04", "diagnosis")).toBe(
      null,
    );
    expect(newestMatchingDateKeyInMonth(groups, null, "all")).toBe(null);
  });
});

describe("DiaryCalendarSection — Today button", () => {
  it("jumps from a previous month to the current month", () => {
    render(<DiaryCalendarSection rawEntries={ENTRIES} now={TODAY} />);
    fireEvent.click(screen.getByTestId("diary-calendar-month-prev")); // May
    fireEvent.click(screen.getByTestId("diary-calendar-month-prev")); // April
    expect(screen.getByTestId("diary-calendar-month-label")).toHaveTextContent(
      /April 2026/,
    );
    fireEvent.click(screen.getByTestId("diary-calendar-today"));
    expect(screen.getByTestId("diary-calendar-month-label")).toHaveTextContent(
      /June 2026/,
    );
  });

  it("keeps the active filter applied", () => {
    render(<DiaryCalendarSection rawEntries={ENTRIES} now={TODAY} />);
    fireEvent.click(screen.getByTestId("diary-calendar-filter-feeding"));
    fireEvent.click(screen.getByTestId("diary-calendar-month-prev"));
    fireEvent.click(screen.getByTestId("diary-calendar-today"));
    expect(
      screen.getByTestId("diary-calendar-filter-feeding"),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("diary-calendar-month-label")).toHaveTextContent(
      /June 2026/,
    );
    // Only June feeding visible (1 event on Jun 11).
    expect(screen.getAllByTestId("diary-calendar-event").length).toBe(1);
  });

  it("expands the newest matching day in the current month", () => {
    render(<DiaryCalendarSection rawEntries={ENTRIES} now={TODAY} />);
    fireEvent.click(screen.getByTestId("diary-calendar-month-prev"));
    fireEvent.click(screen.getByTestId("diary-calendar-today"));
    // All filter, June: newest day is 2026-06-12 with 2 events (watering + diagnosis).
    expect(screen.getAllByTestId("diary-calendar-event").length).toBe(2);
  });

  it("closes stale expanded day when no matching current-month event exists", () => {
    // Today is in a month with no events at all.
    const future = new Date(Date.UTC(2026, 8, 1)); // 2026-09
    render(<DiaryCalendarSection rawEntries={ENTRIES} now={future} />);
    fireEvent.click(screen.getByTestId("diary-calendar-today"));
    expect(screen.getByTestId("diary-calendar-month-label")).toHaveTextContent(
      /September 2026/,
    );
    expect(screen.getByTestId("diary-calendar-empty")).toHaveTextContent(
      /No watering, feeding, or diagnosis events logged for September 2026\./,
    );
    expect(screen.queryAllByTestId("diary-calendar-event").length).toBe(0);
  });

  it("empty state remains month/filter aware after Today", () => {
    const future = new Date(Date.UTC(2026, 8, 1));
    render(<DiaryCalendarSection rawEntries={ENTRIES} now={future} />);
    fireEvent.click(screen.getByTestId("diary-calendar-filter-watering"));
    fireEvent.click(screen.getByTestId("diary-calendar-today"));
    expect(screen.getByTestId("diary-calendar-empty")).toHaveTextContent(
      /No watering events logged for September 2026\./,
    );
  });

  it("unsupported event types do not affect Today behavior", () => {
    render(<DiaryCalendarSection rawEntries={ENTRIES} now={TODAY} />);
    fireEvent.click(screen.getByTestId("diary-calendar-today"));
    // June: 4 supported events across 3 days; newest day (Jun 12) auto-expands → 2 events.
    expect(screen.getAllByTestId("diary-calendar-event").length).toBe(2);
    // 'photo' on Jun 15 must not appear and must not bump counts.
    expect(
      screen.getByTestId("diary-calendar-filter-all"),
    ).toHaveTextContent("4");
  });

  it("Today button is accessible by name", () => {
    render(<DiaryCalendarSection rawEntries={ENTRIES} now={TODAY} />);
    expect(screen.getByRole("button", { name: "Today" })).toBeInTheDocument();
  });

  it("does not leak raw_payload / service_role / tokens / private keys", () => {
    const { container } = render(
      <DiaryCalendarSection
        rawEntries={[
          {
            id: "jun-d",
            entry_at: "2026-06-12T08:00:00Z",
            event_type: "diagnosis",
            details: {
              summary: "OK",
              raw_payload: { tok: "tok_LEAK" },
              service_role: "srv_LEAK",
              private_key: "pk_LEAK",
            },
          },
        ]}
        now={TODAY}
      />,
    );
    fireEvent.click(screen.getByTestId("diary-calendar-today"));
    const html = container.innerHTML;
    expect(html).not.toMatch(/raw_payload/);
    expect(html).not.toMatch(/service_role/);
    expect(html).not.toMatch(/tok_LEAK/);
    expect(html).not.toMatch(/srv_LEAK/);
    expect(html).not.toMatch(/private_key|pk_LEAK/);
  });

  it("does not introduce Supabase write or Action Queue / device-control strings", () => {
    const { container } = render(
      <DiaryCalendarSection rawEntries={ENTRIES} now={TODAY} />,
    );
    fireEvent.click(screen.getByTestId("diary-calendar-today"));
    const html = container.innerHTML;
    expect(html).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
    expect(html).not.toMatch(/action_queue|Action Queue|device.*control/i);
  });
});
