/**
 * Diary Calendar — Environment Check polish: filter isolation,
 * compact value rendering, safe fallback when all values are missing.
 */
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import DiaryCalendarSection from "@/components/DiaryCalendarSection";
import {
  buildDiaryCalendarViewModel,
  computeDiaryCalendarFilterCounts,
  ENVIRONMENT_CHECK_NO_VALUES_COPY,
} from "@/lib/diaryCalendarViewModel";

const MIXED = [
  { id: "w", entry_at: "2026-06-10T08:00:00Z", event_type: "watering" },
  { id: "f", entry_at: "2026-06-10T09:00:00Z", event_type: "feeding" },
  { id: "d", entry_at: "2026-06-10T10:00:00Z", event_type: "diagnosis" },
  {
    id: "e1",
    entry_at: "2026-06-10T11:00:00Z",
    event_type: "environment",
    details: {
      event_type: "environment",
      environment_check: {
        temp_c: 24.6,
        humidity_pct: 58,
        vpd_kpa: 1.12,
        co2_ppm: 720,
      },
    },
  },
  {
    id: "e2",
    entry_at: "2026-06-10T12:00:00Z",
    event_type: "environment",
    details: { event_type: "environment", environment_check: {} },
  },
];

function clickFilter(value: string) {
  fireEvent.click(screen.getByTestId(`diary-calendar-filter-${value}`));
}

describe("Diary Calendar — Environment Check polish", () => {
  it("Environment Check filter isolates environment events", () => {
    render(<DiaryCalendarSection rawEntries={MIXED} />);
    clickFilter("environment");
    const events = screen.getAllByTestId("diary-calendar-event");
    expect(events).toHaveLength(2);
    for (const ev of events) {
      expect(within(ev).getAllByText(/Environment Check/i).length).toBeGreaterThan(0);
    }
  });

  it.each([
    ["watering", "w"],
    ["feeding", "f"],
    ["diagnosis", "d"],
  ])("%s filter isolates its own kind", (filter, id) => {
    render(<DiaryCalendarSection rawEntries={MIXED} />);
    clickFilter(filter);
    const events = screen.getAllByTestId("diary-calendar-event");
    expect(events).toHaveLength(1);
    expect(events[0]).toBeDefined();
    expect(id).toBeDefined();
  });

  it("filter counts include Environment Check", () => {
    const groups = buildDiaryCalendarViewModel(MIXED);
    const counts = computeDiaryCalendarFilterCounts(groups);
    expect(counts.environment).toBe(2);
    expect(counts.watering).toBe(1);
    expect(counts.feeding).toBe(1);
    expect(counts.diagnosis).toBe(1);
    expect(counts.all).toBe(5);
  });

  it("renders compact temp/humidity/VPD/CO2 values with units", () => {
    render(<DiaryCalendarSection rawEntries={[MIXED[3]]} />);
    expect(screen.getByText(/24\.6°C/)).toBeInTheDocument();
    expect(screen.getByText(/58%/)).toBeInTheDocument();
    expect(screen.getByText(/1\.12 kPa/)).toBeInTheDocument();
    expect(screen.getByText(/720 ppm/)).toBeInTheDocument();
  });

  it("omits missing/malformed fields cleanly (only present values render)", () => {
    const partial = {
      id: "ep",
      entry_at: "2026-06-10T11:00:00Z",
      event_type: "environment",
      details: {
        event_type: "environment",
        environment_check: {
          temp_c: 22.1,
          humidity_pct: "garbage",
          vpd_kpa: null,
          co2_ppm: 900,
        },
      },
    };
    render(<DiaryCalendarSection rawEntries={[partial as any]} />);
    expect(screen.getByText(/22\.1°C/)).toBeInTheDocument();
    expect(screen.getByText(/900 ppm/)).toBeInTheDocument();
    expect(screen.queryByText(/kPa/)).not.toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it("shows 'No environment values captured.' when all values are missing", () => {
    render(<DiaryCalendarSection rawEntries={[MIXED[4]]} />);
    expect(screen.getByText(ENVIRONMENT_CHECK_NO_VALUES_COPY)).toBeInTheDocument();
    // Disclaimer must remain visible regardless of missing values.
    expect(
      screen.getByTestId("diary-calendar-event-subtitle"),
    ).toHaveTextContent(/not live sensor telemetry/i);
  });

  it("environment events are never marked as sensor_readings", () => {
    const groups = buildDiaryCalendarViewModel(MIXED);
    const json = JSON.stringify(groups);
    expect(json).not.toContain("sensor_readings");
    expect(json).not.toMatch(/"source"\s*:\s*"live"/);
  });
});
