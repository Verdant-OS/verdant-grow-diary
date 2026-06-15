/**
 * DiaryCalendarSection — month navigation tests.
 * Pure helpers + component behaviors. Read-only; no writes.
 */
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import DiaryCalendarSection from "@/components/DiaryCalendarSection";
import {
  buildDiaryCalendarViewModel,
  defaultDiaryCalendarMonth,
  filterDiaryCalendarGroupsByMonth,
  shiftMonthKey,
  formatDiaryCalendarMonthLabel,
  diaryCalendarMonthEmptyTitle,
  monthKeyFromDateKey,
  listDiaryCalendarMonthKeys,
} from "@/lib/diaryCalendarViewModel";

const MULTI_MONTH = [
  { id: "may-w", entry_at: "2026-05-04T09:00:00Z", event_type: "watering" },
  { id: "may-f", entry_at: "2026-05-20T09:00:00Z", event_type: "feeding" },
  { id: "jun-w1", entry_at: "2026-06-10T09:00:00Z", event_type: "watering" },
  { id: "jun-w2", entry_at: "2026-06-10T10:00:00Z", event_type: "watering" },
  { id: "jun-f", entry_at: "2026-06-11T12:00:00Z", event_type: "feeding" },
  { id: "jun-d", entry_at: "2026-06-12T08:00:00Z", event_type: "diagnosis" },
  // Unsupported kinds — must be ignored.
  { id: "ignored-photo", entry_at: "2026-06-15T08:00:00Z", event_type: "photo" },
  { id: "ignored-obs", entry_at: "2026-04-01T08:00:00Z", event_type: "observation" },
];

describe("month-nav pure helpers", () => {
  it("monthKeyFromDateKey extracts YYYY-MM", () => {
    expect(monthKeyFromDateKey("2026-06-10")).toBe("2026-06");
  });

  it("listDiaryCalendarMonthKeys returns unique months newest-first", () => {
    const groups = buildDiaryCalendarViewModel(MULTI_MONTH);
    expect(listDiaryCalendarMonthKeys(groups)).toEqual(["2026-06", "2026-05"]);
  });

  it("shiftMonthKey handles year wraps", () => {
    expect(shiftMonthKey("2026-01", -1)).toBe("2025-12");
    expect(shiftMonthKey("2026-12", 1)).toBe("2027-01");
    expect(shiftMonthKey("2026-06", -1)).toBe("2026-05");
  });

  it("defaultDiaryCalendarMonth returns newest month with matching events", () => {
    const groups = buildDiaryCalendarViewModel(MULTI_MONTH);
    expect(defaultDiaryCalendarMonth(groups, "all")).toBe("2026-06");
    expect(defaultDiaryCalendarMonth(groups, "diagnosis")).toBe("2026-06");
    // Only May has feeding-without-June? May has feeding too, June newer.
    expect(defaultDiaryCalendarMonth(groups, "feeding")).toBe("2026-06");
  });

  it("defaultDiaryCalendarMonth falls back to newest dataset month then null", () => {
    const groups = buildDiaryCalendarViewModel([
      { id: "w", entry_at: "2026-05-01T00:00:00Z", event_type: "watering" },
    ]);
    expect(defaultDiaryCalendarMonth(groups, "diagnosis")).toBe("2026-05");
    expect(defaultDiaryCalendarMonth([], "all")).toBe(null);
  });

  it("filterDiaryCalendarGroupsByMonth scopes groups to a month", () => {
    const groups = buildDiaryCalendarViewModel(MULTI_MONTH);
    const may = filterDiaryCalendarGroupsByMonth(groups, "2026-05");
    expect(may.every((g) => g.dateKey.startsWith("2026-05"))).toBe(true);
    expect(may.length).toBeGreaterThan(0);
    const none = filterDiaryCalendarGroupsByMonth(groups, "2026-07");
    expect(none).toEqual([]);
  });

  it("formatDiaryCalendarMonthLabel produces 'Month YYYY'", () => {
    expect(formatDiaryCalendarMonthLabel("2026-06")).toMatch(/June 2026/);
  });

  it("diaryCalendarMonthEmptyTitle names month + filter", () => {
    expect(diaryCalendarMonthEmptyTitle("2026-06", "watering")).toMatch(
      /No watering events logged for June 2026\./,
    );
    expect(diaryCalendarMonthEmptyTitle("2026-06", "all")).toMatch(
      /No watering, feeding, or diagnosis events logged for June 2026\./,
    );
  });
});

describe("DiaryCalendarSection — month navigation UI", () => {
  it("defaults to the newest month with events and shows its label", () => {
    render(<DiaryCalendarSection rawEntries={MULTI_MONTH} />);
    expect(screen.getByTestId("diary-calendar-month-label")).toHaveTextContent(
      /June 2026/,
    );
    // June has 4 supported events: 2 watering + 1 feeding + 1 diagnosis.
    const events = screen.getAllByTestId("diary-calendar-event");
    expect(events.length).toBeGreaterThan(0);
  });

  it("previous month shows May events; next returns to June", () => {
    render(<DiaryCalendarSection rawEntries={MULTI_MONTH} />);
    fireEvent.click(screen.getByTestId("diary-calendar-month-prev"));
    expect(screen.getByTestId("diary-calendar-month-label")).toHaveTextContent(
      /May 2026/,
    );
    // May has 1 watering + 1 feeding on different days; only the newest
    // day auto-expands so 1 event is visible. Both days are listed.
    expect(screen.getAllByTestId("diary-calendar-day").length).toBe(2);
    expect(screen.getAllByTestId("diary-calendar-event").length).toBe(1);
    fireEvent.click(screen.getByTestId("diary-calendar-month-next"));
    expect(screen.getByTestId("diary-calendar-month-label")).toHaveTextContent(
      /June 2026/,
    );
  });

  it("selected filter remains applied across month changes", () => {
    render(<DiaryCalendarSection rawEntries={MULTI_MONTH} />);
    fireEvent.click(screen.getByTestId("diary-calendar-filter-watering"));
    expect(
      screen.getByTestId("diary-calendar-filter-watering"),
    ).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByTestId("diary-calendar-month-prev"));
    expect(
      screen.getByTestId("diary-calendar-filter-watering"),
    ).toHaveAttribute("aria-pressed", "true");
    // May watering only: 1 event.
    expect(screen.getAllByTestId("diary-calendar-event").length).toBe(1);
  });

  it("count badges reflect the visible month", () => {
    render(<DiaryCalendarSection rawEntries={MULTI_MONTH} />);
    // June visible: 2 watering + 1 feeding + 1 diagnosis = 4.
    expect(
      screen.getByTestId("diary-calendar-filter-all"),
    ).toHaveTextContent("4");
    expect(
      screen.getByTestId("diary-calendar-filter-watering"),
    ).toHaveTextContent("2");
    fireEvent.click(screen.getByTestId("diary-calendar-month-prev"));
    // May visible: 1 watering + 1 feeding + 0 diagnosis = 2.
    expect(
      screen.getByTestId("diary-calendar-filter-all"),
    ).toHaveTextContent("2");
    expect(
      screen.getByTestId("diary-calendar-filter-diagnosis"),
    ).toHaveTextContent("0");
  });

  it("empty state names the visible month and the active filter", () => {
    render(<DiaryCalendarSection rawEntries={MULTI_MONTH} />);
    fireEvent.click(screen.getByTestId("diary-calendar-filter-diagnosis"));
    // Default jumps to June (newest with diagnosis). Go back to May → empty.
    fireEvent.click(screen.getByTestId("diary-calendar-month-prev"));
    expect(screen.getByTestId("diary-calendar-empty")).toHaveTextContent(
      /No diagnosis events logged for May 2026\./,
    );
  });

  it("expanded day does not leak details after a month change", () => {
    const { container } = render(
      <DiaryCalendarSection
        rawEntries={[
          {
            id: "jun-d",
            entry_at: "2026-06-12T08:00:00Z",
            event_type: "diagnosis",
            details: {
              summary: "Sensitive June summary",
              raw_payload: { tok: "tok_LEAK" },
              service_role: "srv_LEAK",
            },
          },
          {
            id: "may-w",
            entry_at: "2026-05-04T09:00:00Z",
            event_type: "watering",
            details: { amount_ml: 500 },
          },
        ]}
      />,
    );
    expect(container.innerHTML).toMatch(/Sensitive June summary/);
    fireEvent.click(screen.getByTestId("diary-calendar-month-prev"));
    const html = container.innerHTML;
    expect(html).not.toMatch(/Sensitive June summary/);
    expect(html).not.toMatch(/raw_payload/);
    expect(html).not.toMatch(/service_role/);
    expect(html).not.toMatch(/tok_LEAK/);
    expect(html).not.toMatch(/srv_LEAK/);
  });

  it("unsupported event types do not affect month nav or counts", () => {
    render(<DiaryCalendarSection rawEntries={MULTI_MONTH} />);
    // April observation entry must NOT create an April-only month.
    fireEvent.click(screen.getByTestId("diary-calendar-month-prev")); // May
    fireEvent.click(screen.getByTestId("diary-calendar-month-prev")); // April (empty)
    expect(screen.getByTestId("diary-calendar-month-label")).toHaveTextContent(
      /April 2026/,
    );
    expect(screen.getByTestId("diary-calendar-empty")).toBeInTheDocument();
    // All badges are zero in April.
    expect(
      screen.getByTestId("diary-calendar-filter-all"),
    ).toHaveTextContent("0");
  });

  it("prev/next buttons expose accessible names", () => {
    render(<DiaryCalendarSection rawEntries={MULTI_MONTH} />);
    expect(screen.getByRole("button", { name: "Previous month" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next month" })).toBeInTheDocument();
  });

  it("does not introduce Supabase write or Action Queue strings", () => {
    const { container } = render(
      <DiaryCalendarSection rawEntries={MULTI_MONTH} />,
    );
    const html = container.innerHTML;
    expect(html).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
    expect(html).not.toMatch(/action_queue|Action Queue|device.*control/i);
  });
});
