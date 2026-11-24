/**
 * The in-app tent CSV import shows the same saturated-run warning as
 * /sensors/csv-preview. Warning only: confirm stays available and every
 * parsed row is still sent.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { parseEnvironmentCSVText } from "@/lib/csvParser";
import {
  ENVIRONMENT_CSV_SATURATED_RUN_TEST_ID,
  EnvironmentCsvSaturatedRunRules,
} from "@/lib/environmentCsvSaturatedRunRules";
import { EnvironmentCsvImportModal } from "@/components/EnvironmentCsvImportModal";

afterEach(cleanup);

function minute(index: number): string {
  const h = String(Math.floor(index / 60)).padStart(2, "0");
  const m = String(index % 60).padStart(2, "0");
  return `2026-06-01T${h}:${m}:00Z`;
}

/** Synthetic GGS-shaped file. Null is a blank humidity cell. */
function ggsCsv(humidity: readonly (number | null)[]): string {
  return [
    "deviceSerialnum,roomId,sensorId,temperature(°C),humidity,vpd,Timestamp",
    ...humidity.map(
      (value, index) => `SYNTHETIC-GGS,1,SYNTHETIC-SENSOR,24.0,${value ?? ""},,${minute(index)}`,
    ),
  ].join("\n");
}

function soilCsv(moisture: readonly number[]): string {
  return [
    "Timestamp,Temperature (C),Humidity,Soil Moisture (%)",
    ...moisture.map((value, index) => `${minute(index)},24.0,55,${value}`),
  ].join("\n");
}

const warningsFor = (csv: string) =>
  EnvironmentCsvSaturatedRunRules.warnings(parseEnvironmentCSVText(csv).validRows);

describe("EnvironmentCsvSaturatedRunRules", () => {
  it("names a run of 14 humidity readings at 100% with its time range", () => {
    expect(warningsFor(ggsCsv([55, ...Array(14).fill(100), 56]))).toEqual([
      `Saturated reading run · humidity_pct · 14 consecutive readings at 100% · ${new Date(
        minute(1),
      ).toISOString()} – ${new Date(minute(14)).toISOString()}`,
    ]);
  });

  it("flags 12 consecutive readings and not 11", () => {
    expect(warningsFor(ggsCsv([55, ...Array(12).fill(100), 56]))).toHaveLength(1);
    expect(warningsFor(ggsCsv([55, ...Array(11).fill(100), 56]))).toEqual([]);
  });

  it("ends a run at a blank cell instead of joining across it", () => {
    const humidity = [55, ...Array(6).fill(100), null, ...Array(6).fill(100), 56];
    const parsed = parseEnvironmentCSVText(ggsCsv(humidity));
    expect(parsed.validRows.some((row) => row.humidity_pct === null)).toBe(true);
    expect(EnvironmentCsvSaturatedRunRules.warnings(parsed.validRows)).toEqual([]);
  });

  it("flags a soil moisture run at 0%", () => {
    const warnings = warningsFor(soilCsv([40, ...Array(13).fill(0), 41]));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("soil_moisture_pct · 13 consecutive readings at 0%");
  });
});

async function openFile(csv: string) {
  const onConfirm = vi.fn().mockResolvedValue({ insertedCount: 1, error: null });
  render(<EnvironmentCsvImportModal open onOpenChange={() => {}} onConfirm={onConfirm} />);
  const input = screen.getByTestId("csv-import-file-input") as HTMLInputElement;
  Object.defineProperty(input, "files", {
    value: [new File([csv], "saturated-run.csv", { type: "text/csv" })],
  });
  fireEvent.change(input);
  await waitFor(() => expect(screen.getByTestId("csv-import-preview")).toBeTruthy());
  return onConfirm;
}

describe("import modal saturated-run warning", () => {
  it("shows the warning before confirm and still imports every row", async () => {
    const onConfirm = await openFile(ggsCsv([55, ...Array(14).fill(100), 56]));
    const warning = screen.getByTestId(ENVIRONMENT_CSV_SATURATED_RUN_TEST_ID);
    expect(warning.getAttribute("role")).toBe("status");
    expect(warning.textContent).toContain(
      "Saturated reading run · humidity_pct · 14 consecutive readings at 100%",
    );
    const confirm = screen.getByTestId("csv-import-confirm");
    expect(confirm).toHaveProperty("disabled", false);
    fireEvent.click(confirm);
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(onConfirm.mock.calls[0][0]).toHaveLength(16);
  });

  it("shows no warning for a file without a saturated run", async () => {
    await openFile(ggsCsv([55, ...Array(11).fill(100), 56]));
    expect(screen.queryByTestId(ENVIRONMENT_CSV_SATURATED_RUN_TEST_ID)).toBeNull();
  });
});
