import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import {
  buildCsvTimelineContext,
  CSV_SNAPSHOT_TITLE,
  CSV_SOURCE_LABEL,
  CSV_DERIVED_VPD_LABEL,
} from "@/lib/environmentCsvTimelineContextViewModel";
import { CsvTimelineEnvironmentChip } from "@/components/CsvTimelineEnvironmentChip";

const TENT_A = "tent-a";
const TENT_B = "tent-b";
const GROW_A = "grow-a";

function csvRow(
  metric: "temperature_c" | "humidity_pct" | "vpd_kpa",
  value: number,
  capturedAt: string,
  tentId = TENT_A,
  growId: string | null = GROW_A,
) {
  return {
    tent_id: tentId,
    source: "csv",
    metric,
    value,
    captured_at: capturedAt,
    raw_payload: growId ? { grow_id: growId, source_tag: "csv" } : { source_tag: "csv" },
  };
}

describe("buildCsvTimelineContext", () => {
  it("links CSV reading inside ±45 min window (test 33)", () => {
    const entry = { id: "d1", grow_id: GROW_A, tent_id: TENT_A, occurred_at: "2026-06-01T10:00:00Z" };
    const rows = [
      csvRow("temperature_c", 25, "2026-06-01T10:20:00Z"),
      csvRow("humidity_pct", 55, "2026-06-01T10:20:00Z"),
      csvRow("vpd_kpa", 1.42, "2026-06-01T10:20:00Z"),
    ];
    const out = buildCsvTimelineContext({
      diaryEntries: [entry],
      sensorReadings: rows,
      growId: GROW_A,
      tentId: TENT_A,
    });
    expect(out[0].snapshot).not.toBeNull();
    expect(out[0].snapshot!.temperatureC).toBe(25);
    expect(out[0].snapshot!.humidityPct).toBe(55);
    expect(out[0].snapshot!.derivedVpdKpa).toBe(1.42);
    expect(out[0].matchAgeMinutes).toBe(20);
  });

  it("does not link reading outside window (test 34)", () => {
    const entry = { id: "d1", grow_id: GROW_A, tent_id: TENT_A, occurred_at: "2026-06-01T10:00:00Z" };
    const rows = [csvRow("temperature_c", 25, "2026-06-01T12:00:00Z")];
    const out = buildCsvTimelineContext({
      diaryEntries: [entry],
      sensorReadings: rows,
      growId: GROW_A,
      tentId: TENT_A,
    });
    expect(out[0].snapshot).toBeNull();
  });

  it("does not link readings from another tent or grow (test 35)", () => {
    const entry = { id: "d1", grow_id: GROW_A, tent_id: TENT_A, occurred_at: "2026-06-01T10:00:00Z" };
    const rows = [
      csvRow("temperature_c", 25, "2026-06-01T10:10:00Z", TENT_B),
      csvRow("temperature_c", 25, "2026-06-01T10:10:00Z", TENT_A, "other-grow"),
    ];
    const out = buildCsvTimelineContext({
      diaryEntries: [entry],
      sensorReadings: rows,
      growId: GROW_A,
      tentId: TENT_A,
    });
    expect(out[0].snapshot).toBeNull();
  });

  it("only attaches CSV-source rows (never live/ecowitt)", () => {
    const entry = { id: "d1", grow_id: GROW_A, tent_id: TENT_A, occurred_at: "2026-06-01T10:00:00Z" };
    const rows = [
      { tent_id: TENT_A, source: "ecowitt", metric: "temperature_c", value: 22, captured_at: "2026-06-01T10:05:00Z", raw_payload: { grow_id: GROW_A } },
    ];
    const out = buildCsvTimelineContext({
      diaryEntries: [entry],
      sensorReadings: rows,
      growId: GROW_A,
      tentId: TENT_A,
    });
    expect(out[0].snapshot).toBeNull();
  });
});

describe("CsvTimelineEnvironmentChip", () => {
  it("chip says CSV environment snapshot (test 36)", () => {
    render(
      <CsvTimelineEnvironmentChip
        diaryEntryId="d1"
        snapshot={{
          capturedAt: "2026-06-01T10:00:00Z",
          temperatureC: 25,
          humidityPct: 55,
          derivedVpdKpa: 1.42,
          sourceLabel: CSV_SOURCE_LABEL,
          title: CSV_SNAPSHOT_TITLE,
          derivedVpdLabel: CSV_DERIVED_VPD_LABEL,
        }}
      />,
    );
    expect(screen.getByText(CSV_SNAPSHOT_TITLE)).toBeTruthy();
    expect(screen.getByTestId("csv-timeline-chip-source-d1").textContent).toBe(
      CSV_SOURCE_LABEL,
    );
    expect(screen.getByText(/Derived VPD/)).toBeTruthy();
  });

  it("chip never says Live or Live VPD (test 37)", () => {
    const { container } = render(
      <CsvTimelineEnvironmentChip
        diaryEntryId="d1"
        snapshot={{
          capturedAt: "2026-06-01T10:00:00Z",
          temperatureC: 25,
          humidityPct: 55,
          derivedVpdKpa: 1.42,
          sourceLabel: CSV_SOURCE_LABEL,
          title: CSV_SNAPSHOT_TITLE,
          derivedVpdLabel: CSV_DERIVED_VPD_LABEL,
        }}
      />,
    );
    expect(container.textContent?.toLowerCase()).not.toContain("live");
  });

  it("renders nothing when snapshot is null", () => {
    const { container } = render(
      <CsvTimelineEnvironmentChip diaryEntryId="d1" snapshot={null} />,
    );
    expect(container.firstChild).toBeNull();
  });
});

describe("CSV timeline source safety scan", () => {
  it("view-model + chip contain no live/alert/action_queue/device strings", () => {
    const vm = readFileSync(
      resolve(__dirname, "../lib/environmentCsvTimelineContextViewModel.ts"),
      "utf8",
    );
    const chip = readFileSync(
      resolve(__dirname, "../components/CsvTimelineEnvironmentChip.tsx"),
      "utf8",
    );
    for (const src of [vm, chip]) {
      expect(src).not.toMatch(/alerts/i);
      expect(src).not.toMatch(/action_queue/i);
      expect(src).not.toMatch(/service_role/i);
      expect(src).not.toMatch(/switchbot/i);
      expect(src).not.toMatch(/device.?control/i);
      expect(src).not.toMatch(/automation/i);
      // "Live" must not appear except inside a comment forbidding it
      const noComments = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(noComments.toLowerCase()).not.toMatch(/"live"|'live'|live vpd/);
    }
  });
});
