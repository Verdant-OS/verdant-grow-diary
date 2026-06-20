/**
 * Diary Calendar — persisted filter integration + Environment Check
 * tap-for-details expansion.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import DiaryCalendarSection from "@/components/DiaryCalendarSection";
import {
  DIARY_CALENDAR_FILTER_STORAGE_KEY,
  readPersistedDiaryCalendarFilter,
} from "@/lib/diaryCalendarFilterPersistence";

const ENV_FULL = {
  id: "e1",
  entry_at: "2026-06-10T11:00:00Z",
  event_type: "environment",
  note: "Morning check after lights on.",
  details: {
    event_type: "environment",
    environment_check: {
      temp_c: 24.6,
      humidity_pct: 58,
      vpd_kpa: 1.12,
      co2_ppm: 720,
    },
  },
};

const ENV_EMPTY = {
  id: "e2",
  entry_at: "2026-06-10T12:00:00Z",
  event_type: "environment",
  details: { event_type: "environment", environment_check: {} },
};

const MIXED = [
  { id: "w", entry_at: "2026-06-10T08:00:00Z", event_type: "watering" },
  { id: "f", entry_at: "2026-06-10T09:00:00Z", event_type: "feeding" },
  { id: "d", entry_at: "2026-06-10T10:00:00Z", event_type: "diagnosis" },
  ENV_FULL,
];

beforeEach(() => {
  window.localStorage.clear();
});

describe("DiaryCalendarSection — persisted filter", () => {
  it("persists Environment Check filter to localStorage", () => {
    render(<DiaryCalendarSection rawEntries={MIXED} />);
    fireEvent.click(screen.getByTestId("diary-calendar-filter-environment"));
    expect(readPersistedDiaryCalendarFilter()).toBe("environment");
  });

  it("restores Environment Check filter after remount", () => {
    render(<DiaryCalendarSection rawEntries={MIXED} />);
    fireEvent.click(screen.getByTestId("diary-calendar-filter-environment"));
    cleanup();
    render(<DiaryCalendarSection rawEntries={MIXED} />);
    expect(
      screen.getByTestId("diary-calendar-filter-environment"),
    ).toHaveAttribute("aria-pressed", "true");
    // Only Environment Check events should be visible.
    const events = screen.getAllByTestId("diary-calendar-event");
    expect(events).toHaveLength(1);
    expect(within(events[0]!).getAllByText(/Environment Check/i).length).toBeGreaterThan(0);
  });

  it("rejects an invalid persisted filter and falls back to 'all'", () => {
    window.localStorage.setItem(DIARY_CALENDAR_FILTER_STORAGE_KEY, "garbage");
    render(<DiaryCalendarSection rawEntries={MIXED} />);
    expect(
      screen.getByTestId("diary-calendar-filter-all"),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it.each([
    ["all", 4],
    ["watering", 1],
    ["feeding", 1],
    ["diagnosis", 1],
  ])("preserves %s filter behavior after persist", (kind, expected) => {
    render(<DiaryCalendarSection rawEntries={MIXED} />);
    fireEvent.click(screen.getByTestId(`diary-calendar-filter-${kind}`));
    cleanup();
    render(<DiaryCalendarSection rawEntries={MIXED} />);
    expect(
      screen.getByTestId(`diary-calendar-filter-${kind}`),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByTestId("diary-calendar-event")).toHaveLength(expected);
  });
});

describe("DiaryCalendarSection — Environment Check tap-for-details", () => {
  it("renders Environment Check collapsed by default (compact line, no expanded grid)", () => {
    render(<DiaryCalendarSection rawEntries={[ENV_FULL]} />);
    expect(screen.getByTestId("diary-calendar-env-compact")).toHaveTextContent(
      /24\.6°C/,
    );
    expect(screen.queryByTestId("diary-calendar-env-expanded")).toBeNull();
    // Disclaimer visible while collapsed
    expect(
      screen.getByTestId("diary-calendar-event-subtitle"),
    ).toHaveTextContent(/not live sensor telemetry/i);
  });

  it("Show details expands Environment Check with full temp/RH/VPD/CO2 + note + disclaimer", () => {
    render(<DiaryCalendarSection rawEntries={[ENV_FULL]} />);
    fireEvent.click(screen.getByTestId("diary-calendar-env-toggle"));
    const expanded = screen.getByTestId("diary-calendar-env-expanded");
    expect(within(expanded).getByText(/24\.6°C/)).toBeInTheDocument();
    expect(within(expanded).getByText(/58%/)).toBeInTheDocument();
    expect(within(expanded).getByText(/1\.12 kPa/)).toBeInTheDocument();
    expect(within(expanded).getByText(/720 ppm/)).toBeInTheDocument();
    expect(within(expanded).getByText(/Morning check/i)).toBeInTheDocument();
    expect(
      screen.getByTestId("diary-calendar-event-subtitle"),
    ).toHaveTextContent(/not live sensor telemetry/i);
    expect(screen.getByTestId("diary-calendar-env-toggle")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("Hide details collapses the expanded view back", () => {
    render(<DiaryCalendarSection rawEntries={[ENV_FULL]} />);
    const btn = screen.getByTestId("diary-calendar-env-toggle");
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(screen.queryByTestId("diary-calendar-env-expanded")).toBeNull();
  });

  it("Empty Environment Check shows fallback copy and no toggle", () => {
    render(<DiaryCalendarSection rawEntries={[ENV_EMPTY]} />);
    expect(
      screen.getByText("No environment values captured."),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("diary-calendar-env-toggle")).toBeNull();
    expect(
      screen.getByTestId("diary-calendar-event-subtitle"),
    ).toHaveTextContent(/not live sensor telemetry/i);
  });

  it("Malformed Environment Check values do not crash", () => {
    const bad = {
      id: "eb",
      entry_at: "2026-06-10T11:00:00Z",
      event_type: "environment",
      details: {
        event_type: "environment",
        environment_check: {
          temp_c: "junk",
          humidity_pct: null,
          vpd_kpa: undefined,
          co2_ppm: NaN,
        },
      },
    };
    expect(() =>
      render(<DiaryCalendarSection rawEntries={[bad as never]} />),
    ).not.toThrow();
    expect(
      screen.getByText("No environment values captured."),
    ).toBeInTheDocument();
  });
});

describe("DiaryCalendarSection — Environment Check expansion safety", () => {
  it("never marks env events as sensor_readings or live", () => {
    render(<DiaryCalendarSection rawEntries={[ENV_FULL]} />);
    fireEvent.click(screen.getByTestId("diary-calendar-env-toggle"));
    const html = document.body.innerHTML;
    expect(html).not.toContain("sensor_readings");
    expect(html).not.toMatch(/"source"\s*:\s*"live"/);
    expect(html).not.toMatch(/(?<!not )\blive sensor telemetry\b/i);
  });
});
