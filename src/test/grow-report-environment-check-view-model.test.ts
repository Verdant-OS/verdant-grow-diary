/**
 * Tests for growReportEnvironmentCheckViewModel — pure helper.
 * No I/O. No Supabase. No Action Queue. No AI.
 */
import { describe, it, expect } from "vitest";
import {
  buildGrowReportEnvironmentCheckSection,
  GROW_REPORT_ENVIRONMENT_CHECKS_DISCLAIMER,
  GROW_REPORT_ENVIRONMENT_CHECKS_EMPTY,
  GROW_REPORT_ENVIRONMENT_CHECKS_TITLE,
} from "@/lib/growReportEnvironmentCheckViewModel";

const make = (
  id: string,
  ts: string,
  overrides: Record<string, unknown> = {},
) => ({
  id,
  entry_at: ts,
  event_type: "environment",
  note: null,
  details: {
    plant_name: "Plant A",
    tent_name: "Tent 1",
    environment_check: {
      temp_c: 24.2,
      humidity_pct: 57,
      vpd_kpa: 1.1,
      co2_ppm: 800,
    },
    ...overrides,
  },
});

describe("growReportEnvironmentCheckViewModel", () => {
  it("builds a separate Environment Checks section with disclaimer copy", () => {
    const section = buildGrowReportEnvironmentCheckSection([
      make("a", "2026-06-15T08:00:00Z"),
      make("b", "2026-06-16T08:00:00Z"),
    ]);
    expect(section.title).toBe(GROW_REPORT_ENVIRONMENT_CHECKS_TITLE);
    expect(section.disclaimer).toBe(GROW_REPORT_ENVIRONMENT_CHECKS_DISCLAIMER);
    expect(section.totalCount).toBe(2);
    expect(section.rows[0].entryId).toBe("b");
    expect(section.rows[0].plantName).toBe("Plant A");
    expect(section.rows[0].tentName).toBe("Tent 1");
  });

  it("flags rows as not sensor readings and not merged into sensor averages", () => {
    const section = buildGrowReportEnvironmentCheckSection([make("a", "2026-06-15T00:00:00Z")]);
    expect(section.mergedIntoSensorAverages).toBe(false);
    expect(section.usedForHealthScoring).toBe(false);
    expect(section.rows[0].isSensorReading).toBe(false);
    expect(section.rows[0].notLive).toBe(true);
  });

  it("never labels Environment Check values as live", () => {
    const section = buildGrowReportEnvironmentCheckSection([make("a", "2026-06-15T00:00:00Z")]);
    expect(section.rows[0].notLive).toBe(true);
    expect(section.rows[0].isSensorReading).toBe(false);
    expect(JSON.stringify(section)).not.toMatch(/"source"\s*:\s*"live"/i);
  });

  it("returns empty section copy when no environment checks exist", () => {
    const section = buildGrowReportEnvironmentCheckSection([]);
    expect(section.rows).toEqual([]);
    expect(section.emptyState).toBe(GROW_REPORT_ENVIRONMENT_CHECKS_EMPTY);
  });

  it("ignores non-environment entries", () => {
    const section = buildGrowReportEnvironmentCheckSection([
      { id: "w", entry_at: "2026-06-15T00:00:00Z", event_type: "watering" } as never,
      make("a", "2026-06-15T00:00:00Z"),
    ]);
    expect(section.totalCount).toBe(1);
    expect(section.rows[0].entryId).toBe("a");
  });
});
