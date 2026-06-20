/**
 * DiaryCalendarSection — UI smoke + safety tests.
 */
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import DiaryCalendarSection from "@/components/DiaryCalendarSection";

describe("DiaryCalendarSection", () => {
  it("renders empty state copy with no events", () => {
    render(<DiaryCalendarSection rawEntries={[]} />);
    expect(
      screen.getByText(
        /No watering, feeding, or diagnosis events logged for this period\./i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Use Quick Log to add your next plant event\./i),
    ).toBeInTheDocument();
  });

  it("groups events by date with accessible day headings and chips", () => {
    render(
      <DiaryCalendarSection
        rawEntries={[
          { id: "a", entry_at: "2026-06-10T09:00:00Z", event_type: "watering" },
          { id: "b", entry_at: "2026-06-10T18:00:00Z", event_type: "feeding" },
          { id: "c", entry_at: "2026-06-11T08:00:00Z", event_type: "diagnosis" },
        ]}
      />,
    );
    const days = screen.getAllByTestId("diary-calendar-day");
    expect(days).toHaveLength(2);
    // First (newest) day expanded by default — shows its diagnosis event.
    const events = screen.getAllByTestId("diary-calendar-event");
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(within(events[0]).getAllByText(/Diagnosis/i).length).toBeGreaterThan(0);
  });

  it("expands a collapsed day on tap and shows safe event details", () => {
    render(
      <DiaryCalendarSection
        rawEntries={[
          {
            id: "a",
            entry_at: "2026-06-10T09:00:00Z",
            event_type: "watering",
            note: "200ml pH 6.3",
            details: { plant_name: "Plant A" },
          },
          { id: "c", entry_at: "2026-06-11T08:00:00Z", event_type: "diagnosis" },
        ]}
      />,
    );
    // Older day is collapsed; click its day header to expand. Scope to the
    // diary-calendar-day containers so the insights-panel toggle is ignored.
    const days = screen.getAllByTestId("diary-calendar-day");
    const collapsedDay = days.find((d) =>
      within(d).queryAllByRole("button", { expanded: false }).length > 0,
    );
    expect(collapsedDay).toBeDefined();
    fireEvent.click(within(collapsedDay!).getAllByRole("button", { expanded: false })[0]);
    expect(screen.getByText(/200ml pH 6\.3/)).toBeInTheDocument();
    expect(screen.getByText(/Plant A/)).toBeInTheDocument();
  });

  it("ignores unrelated event kinds", () => {
    render(
      <DiaryCalendarSection
        rawEntries={[
          { id: "p", entry_at: "2026-06-10T09:00:00Z", event_type: "photo" },
          { id: "o", entry_at: "2026-06-10T10:00:00Z", event_type: "observation" },
        ]}
      />,
    );
    expect(screen.getByTestId("diary-calendar-empty")).toBeInTheDocument();
  });

  it("never renders raw_payload, service_role, or token strings", () => {
    const { container } = render(
      <DiaryCalendarSection
        rawEntries={[
          {
            id: "a",
            entry_at: "2026-06-10T09:00:00Z",
            event_type: "watering",
            details: {
              plant_name: "OK",
              raw_payload: { secret: "tok_secret_LEAK" },
              service_role: "srv_LEAK",
            },
          },
        ]}
      />,
    );
    const html = container.innerHTML;
    expect(html).not.toMatch(/raw_payload/);
    expect(html).not.toMatch(/service_role/);
    expect(html).not.toMatch(/tok_secret_LEAK/);
    expect(html).not.toMatch(/srv_LEAK/);
  });

  it("section has an accessible label", () => {
    render(<DiaryCalendarSection rawEntries={[]} />);
    expect(screen.getByRole("region", { name: /Diary calendar/i })).toBeInTheDocument();
  });
});
