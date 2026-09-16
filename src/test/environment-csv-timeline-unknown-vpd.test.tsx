import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  buildCsvTimelineContext,
  type CsvSensorReadingRow,
} from "@/lib/environmentCsvTimelineContextViewModel";
import { CsvTimelineEnvironmentChip } from "@/components/CsvTimelineEnvironmentChip";

vi.mock("@/hooks/useTemperatureUnitPreference", () => ({
  useTemperatureUnitPreference: () => "celsius",
}));

const capturedAt = "2026-06-01T10:00:00.000Z";
function row(raw_payload: unknown): CsvSensorReadingRow {
  return {
    tent_id: "tent-a",
    source: "csv",
    metric: "vpd_kpa",
    value: 1.42,
    captured_at: capturedAt,
    raw_payload,
  };
}
function snapshot(rows: CsvSensorReadingRow[]) {
  return buildCsvTimelineContext({
    diaryEntries: [
      { id: "diary-a", grow_id: "grow-a", tent_id: "tent-a", occurred_at: capturedAt },
    ],
    sensorReadings: rows,
    growId: "grow-a",
    tentId: "tent-a",
  })[0].snapshot!;
}
function expectNeutral(rows: CsvSensorReadingRow[]) {
  const before = JSON.stringify(rows);
  const result = snapshot(rows);
  expect(result.derivedVpdKpa).toBe(1.42);
  expect(result.derivedVpdLabel).toBe("VPD");
  expect(result.sourceLabel).toBe("CSV");
  expect(result.capturedAt).toBe(capturedAt);
  render(<CsvTimelineEnvironmentChip diaryEntryId="diary-a" snapshot={result} />);
  const chip = screen.getByTestId("csv-timeline-chip-diary-a");
  expect(chip).toHaveTextContent("VPD: 1.42 kPa");
  expect(chip).not.toHaveTextContent("Derived VPD");
  expect(chip).not.toHaveTextContent("CSV VPD");
  expect(chip.textContent?.toLowerCase()).not.toContain("live");
  expect(JSON.stringify(rows)).toBe(before);
}

describe("CSV Timeline unknown VPD provenance", () => {
  it.each([undefined, null, "", "CSV", "live", "manual", 1, false, [], { origin: "csv" }])(
    "does not invent derivation for vpd_source %j",
    (vpd_source) => {
      expectNeutral([row({ grow_id: "grow-a", vpd_source })]);
    },
  );
  it.each([undefined, null, "not-an-object", ["csv"]])(
    "keeps legacy payload %j neutral without dropping its value",
    (raw_payload) => expectNeutral([row(raw_payload)]),
  );
  it.each([
    { origin: "csv", label: "CSV VPD" },
    { origin: "derived", label: "Derived VPD" },
  ])("preserves explicit $origin provenance", ({ origin, label }) => {
    const result = snapshot([row({ grow_id: "grow-a", vpd_source: origin })]);
    expect(result.derivedVpdLabel).toBe(label);
    render(<CsvTimelineEnvironmentChip diaryEntryId="known" snapshot={result} />);
    expect(screen.getByTestId("csv-timeline-chip-known")).toHaveTextContent(`${label}: 1.42 kPa`);
  });
  it("does not borrow provenance from another metric or a later duplicate VPD row", () => {
    expectNeutral([
      { ...row({ grow_id: "grow-a", vpd_source: "derived" }), metric: "temperature_c", value: 25 },
      row({ grow_id: "grow-a" }),
      { ...row({ grow_id: "grow-a", vpd_source: "csv" }), value: 1.7 },
    ]);
  });
  it("does not imply derivation or render VPD when the matched group has no VPD row", () => {
    const result = snapshot([
      { ...row({ grow_id: "grow-a", vpd_source: "derived" }), metric: "humidity_pct", value: 55 },
    ]);
    expect(result.derivedVpdLabel).toBe("VPD");
    expect(result.derivedVpdKpa).toBeNull();
    render(<CsvTimelineEnvironmentChip diaryEntryId="absent" snapshot={result} />);
    expect(screen.getByTestId("csv-timeline-chip-absent")).not.toHaveTextContent("VPD");
  });
});
