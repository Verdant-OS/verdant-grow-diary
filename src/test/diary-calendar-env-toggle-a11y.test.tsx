/**
 * Diary Calendar — Environment Check details toggle accessibility +
 * expanded layout polish tests.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import DiaryCalendarSection, {
  ENVIRONMENT_CHECK_SHOW_DETAILS_LABEL,
  ENVIRONMENT_CHECK_HIDE_DETAILS_LABEL,
  ENVIRONMENT_CHECK_SHOW_DETAILS_ARIA,
  ENVIRONMENT_CHECK_HIDE_DETAILS_ARIA,
  ENVIRONMENT_CHECK_NO_VALUES_LABEL,
} from "@/components/DiaryCalendarSection";

beforeEach(() => {
  window.localStorage.clear();
});

const NOW = new Date("2026-06-18T12:00:00Z");

function envEntry(id: string, details: Record<string, unknown>) {
  return {
    id,
    type: "environment",
    occurredAt: "2026-06-18T09:00:00Z",
    plantName: "Plant A",
    note: "Lights up 18/6, drying out fast.",
    details,
  };
}

describe("Environment Check details toggle — a11y", () => {
  it("renders a real button with accessible name and aria-controls", () => {
    render(
      <DiaryCalendarSection
        now={NOW}
        rawEntries={[
          envEntry("env-1", {
            tempF: 78,
            humidity: 55,
            vpd: 1.2,
            co2: 900,
          }),
        ]}
      />,
    );
    const toggle = screen.getByTestId("diary-calendar-env-toggle");
    expect(toggle.tagName).toBe("BUTTON");
    expect(toggle).toHaveAttribute("type", "button");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveAccessibleName(ENVIRONMENT_CHECK_SHOW_DETAILS_ARIA);
    expect(toggle.textContent).toContain(ENVIRONMENT_CHECK_SHOW_DETAILS_LABEL);
    const controls = toggle.getAttribute("aria-controls");
    expect(controls).toBe("diary-calendar-env-details-env-1");
  });

  it("toggles aria-expanded and exposes the controlled region by id", () => {
    render(
      <DiaryCalendarSection
        now={NOW}
        rawEntries={[envEntry("env-2", { tempF: 75, humidity: 50 })]}
      />,
    );
    const toggle = screen.getByTestId("diary-calendar-env-toggle");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveAccessibleName(ENVIRONMENT_CHECK_HIDE_DETAILS_ARIA);
    expect(toggle.textContent).toContain(ENVIRONMENT_CHECK_HIDE_DETAILS_LABEL);
    const region = document.getElementById(
      toggle.getAttribute("aria-controls") as string,
    );
    expect(region).not.toBeNull();
    expect(region).toBe(screen.getByTestId("diary-calendar-env-expanded"));
  });

  it("keyboard activation (Enter) toggles the details region", () => {
    render(
      <DiaryCalendarSection
        now={NOW}
        rawEntries={[envEntry("env-3", { tempF: 72, humidity: 60 })]}
      />,
    );
    const toggle = screen.getByTestId("diary-calendar-env-toggle") as HTMLButtonElement;
    toggle.focus();
    expect(document.activeElement).toBe(toggle);
    fireEvent.click(toggle); // native <button> Enter/Space -> click
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(document.activeElement).toBe(toggle);
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(document.activeElement).toBe(toggle);
  });
});

describe("Environment Check expanded layout polish", () => {
  it("renders aligned label/value pairs for present fields and omits missing ones", () => {
    render(
      <DiaryCalendarSection
        now={NOW}
        rawEntries={[envEntry("env-4", { tempF: 78, humidity: 55, vpd: 1.2 })]}
      />,
    );
    fireEvent.click(screen.getByTestId("diary-calendar-env-toggle"));
    const region = screen.getByTestId("diary-calendar-env-expanded");
    const dts = within(region).getAllByRole("term").map((n) => n.textContent);
    const dds = within(region).getAllByRole("definition").map((n) => n.textContent);
    expect(dts.length).toBe(dds.length);
    // CO2 was not provided -> must be omitted.
    expect(dts.join("|").toLowerCase()).not.toContain("co");
  });

  it("renders the no-values copy when no environment fields are captured", () => {
    render(
      <DiaryCalendarSection
        now={NOW}
        rawEntries={[envEntry("env-5", { event_type: "environment", environment_check: {} })]}
      />,
    );
    expect(
      screen.getByText(ENVIRONMENT_CHECK_NO_VALUES_LABEL),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("diary-calendar-env-compact"),
    ).not.toBeInTheDocument();
  });
});
