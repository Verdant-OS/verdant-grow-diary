/**
 * Diary Calendar — Environment Check visibility tests.
 *
 * Safety: confirms Environment Check Quick Log entries render on the
 * correct day, carry the "not live sensor telemetry" disclaimer, are
 * never treated as sensor_readings, and never break sibling
 * watering/feeding/diagnosis behavior.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen, fireEvent, within } from "@testing-library/react";
import DiaryCalendarSection from "@/components/DiaryCalendarSection";
import {
  buildDiaryCalendarViewModel,
  DIARY_CALENDAR_FILTERS,
} from "@/lib/diaryCalendarViewModel";

const ENV_ENTRY = {
  id: "env-1",
  entry_at: "2026-06-10T09:00:00Z",
  event_type: "environment",
  note: "Morning check",
  details: {
    event_type: "environment",
    environment_check: {
      temp_c: 24.6,
      humidity_pct: 58,
      vpd_kpa: 1.12,
      co2_ppm: 850,
    },
  },
};

describe("Diary Calendar — Environment Check", () => {
  it("includes Environment Check in the filter taxonomy", () => {
    expect(DIARY_CALENDAR_FILTERS.map((f) => f.value)).toContain("environment");
  });

  it("renders an Environment Check event on the correct day with the not-live disclaimer", () => {
    render(<DiaryCalendarSection rawEntries={[ENV_ENTRY]} />);
    const events = screen.getAllByTestId("diary-calendar-event");
    expect(events).toHaveLength(1);
    expect(within(events[0]).getAllByText(/Environment Check/i).length).toBeGreaterThan(0);
    expect(
      screen.getByTestId("diary-calendar-event-subtitle"),
    ).toHaveTextContent(
      /Quick Log environment check — not live sensor telemetry/i,
    );
    expect(screen.getByText(/24\.6°C/)).toBeInTheDocument();
    expect(screen.getByText(/58%/)).toBeInTheDocument();
    expect(screen.getByText(/1\.12 kPa/)).toBeInTheDocument();
    expect(screen.getByText(/850 ppm/)).toBeInTheDocument();
  });

  it("falls back gracefully when envelope is malformed", () => {
    const malformed = {
      id: "env-2",
      entry_at: "2026-06-10T09:00:00Z",
      event_type: "environment",
      note: "n/a",
      details: { event_type: "environment", environment_check: "not-an-object" },
    };
    render(<DiaryCalendarSection rawEntries={[malformed as any]} />);
    const events = screen.getAllByTestId("diary-calendar-event");
    expect(events).toHaveLength(1);
    expect(within(events[0]).getAllByText(/Environment Check/i).length).toBeGreaterThan(0);
    expect(
      screen.getByTestId("diary-calendar-event-subtitle"),
    ).toHaveTextContent(
      /not live sensor telemetry/i,
    );
  });


  it("preserves watering/feeding/diagnosis rendering alongside environment", () => {
    render(
      <DiaryCalendarSection
        rawEntries={[
          { id: "w", entry_at: "2026-06-10T08:00:00Z", event_type: "watering" },
          { id: "f", entry_at: "2026-06-10T09:00:00Z", event_type: "feeding" },
          { id: "d", entry_at: "2026-06-10T10:00:00Z", event_type: "diagnosis" },
          ENV_ENTRY,
        ]}
      />,
    );
    const events = screen.getAllByTestId("diary-calendar-event");
    expect(events).toHaveLength(4);
  });

  it("exposes an Environment Check filter chip when filters exist", () => {
    render(<DiaryCalendarSection rawEntries={[ENV_ENTRY]} />);
    const chip = screen.getByTestId("diary-calendar-filter-environment");
    fireEvent.click(chip);
    expect(screen.getAllByTestId("diary-calendar-event")).toHaveLength(1);
  });

  it("view-model never marks environment events as sensor readings", () => {
    const groups = buildDiaryCalendarViewModel([ENV_ENTRY]);
    expect(groups[0].events[0].kind).toBe("environment");
    expect(groups[0].counts.environment).toBe(1);
    const json = JSON.stringify(groups);
    expect(json).not.toContain("sensor_readings");
    // The only allowed "live" mention is inside the explicit "not live" disclaimer.
    const liveMatches = json.match(/live/gi) ?? [];
    for (const m of liveMatches) {
      // Each occurrence must be part of "not live sensor telemetry".
      expect(json).toMatch(/not live sensor telemetry/i);
    }
    expect(liveMatches.length).toBeLessThanOrEqual(2);
  });
});


describe("Static safety: diaryCalendarViewModel + envCheckCalendarViewModel", () => {
  const root = path.resolve(__dirname, "..");
  const forbidden = [
    "@/integrations/supabase",
    "supabase-js",
    "fetch(",
    "service_role",
  ];
  const files = [
    "lib/diaryCalendarViewModel.ts",
    "lib/environmentCheckCalendarViewModel.ts",
  ];
  for (const rel of files) {
    it(`${rel} has no Supabase/client/write imports`, () => {
      const src = readFileSync(path.join(root, rel), "utf8");
      for (const needle of forbidden) {
        expect(src).not.toContain(needle);
      }
    });
  }
});
