/**
 * Spider Farmer soil import and opt-in DST exclusion.
 *
 * Founder decisions (2026-11-05): map temperature_soil → soil_temp_c,
 * humidity_soil → soil_moisture_pct (labeled uncalibrated), ec_soil → ec
 * (mS/cm assumed); offer an explicit opt-in to leave out DST fold/gap rows.
 *
 * Fixtures are SYNTHETIC, shaped like Spider Farmer exports. Not real
 * observations or hardware identifiers.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { parseEnvironmentCSVText } from "@/lib/csvParser";
import {
  buildCsvImportDoneMessage,
  canConfirmImport,
  excludeUnresolvedTimeRows,
  reduceParseResult,
  reopenTimeZoneChoice,
  rowsToPersist,
  startParsingState,
  undoTimeExclusion,
} from "@/lib/environmentCsvImportViewModel";
import {
  buildSensorReadingInserts,
  persistCsvEnvironmentRows,
  type InsertClient,
} from "@/lib/environmentCsvImportPersistence";
import { EnvironmentCsvImportModal } from "@/components/EnvironmentCsvImportModal";

const CHICAGO = "America/Chicago";
const SOIL_HEADER =
  "deviceSerialnum,roomId,sensorId,temperature(°C),humidity,vpd,temperature(°F),co2,Timestamp,temperature_soil_f(°F),temperature_soil(°C),humidity_soil,ec_soil";
const soilRow = (ts: string, c = "24.7", m = "68.1", ec = "0.74") =>
  `SYNTHETIC-BRAVO,10000,SYNTHETIC-SOIL,,,,,,${ts},76.5,${c},${m},${ec}`;
const DEVICE_HEADER =
  "deviceSerialnum,temperature(°C),humidity,vpd,temperature(°F),co2,Timestamp,temperature_soil_f(°F),temperature_soil(°C),humidity_soil,ec_soil,ppfd";
const deviceRow = (ts: string) =>
  `SYNTHETIC-BRAVO,19.4,76,0.54,66.9,297,${ts},67.8,19.9,69.8,0.75,0`;

const SOIL_FILE = [
  SOIL_HEADER,
  soilRow("2026-09-04 23:00:00"),
  soilRow("2026-09-04 23:05:00", "0", "0", "0"),
].join("\n");
// Nov 1 01:30 happens twice in America/Chicago.
const FOLD_FILE = [
  DEVICE_HEADER,
  deviceRow("2026-10-31 18:00:00"),
  deviceRow("2026-11-01 01:30:00"),
  deviceRow("2026-11-01 01:35:00"),
  deviceRow("2026-11-05 11:00:00"),
].join("\n");

const SCOPE = { user_id: "u-1", grow_id: "g-1", tent_id: "t-1" };

describe("Spider Farmer soil columns", () => {
  it("imports a soil-only export as soil metrics, never as air metrics", () => {
    const r = parseEnvironmentCSVText(SOIL_FILE, { sourceTimeZone: CHICAGO });
    expect(r.errors).toEqual([]);
    expect(r.unsupportedColumns).toEqual([]);
    expect(r.validRows).toHaveLength(2);
    expect(r.validRows[0]).toMatchObject({
      captured_at: "2026-09-05T04:00:00.000Z",
      temperature_c: null,
      humidity_pct: null,
      vpd_kpa: null,
      soil_temp_c: 24.7,
      soil_moisture_pct: 68.1,
      soil_ec: 0.74,
    });
    // Zero is a value, not missing.
    expect(r.validRows[1]).toMatchObject({ soil_temp_c: 0, soil_moisture_pct: 0, soil_ec: 0 });
  });

  it("keeps air and soil separate in a device export, whatever the column order", () => {
    const csv = [DEVICE_HEADER, deviceRow("2026-11-05T11:00:00-06:00")].join("\n");
    const r = parseEnvironmentCSVText(csv);
    expect(r.validRows[0]).toMatchObject({
      temperature_c: 19.4,
      humidity_pct: 76,
      soil_temp_c: 19.9,
      soil_moisture_pct: 69.8,
      soil_ec: 0.75,
      ppfd: 0,
    });
    const cols = DEVICE_HEADER.split(",");
    const order = [...cols].reverse();
    const cells = deviceRow("2026-11-05T11:00:00-06:00").split(",");
    const reordered = [order.join(","), order.map((h) => cells[cols.indexOf(h)]).join(",")].join(
      "\n",
    );
    expect(parseEnvironmentCSVText(reordered).validRows[0]).toMatchObject({
      temperature_c: 19.4,
      humidity_pct: 76,
      soil_temp_c: 19.9,
      soil_moisture_pct: 69.8,
    });
  });

  it("uses soil °F only when there is no soil °C column", () => {
    const csv = "Timestamp,temperature_soil_f(°F)\n2026-11-05T11:00:00Z,76.5\n";
    expect(parseEnvironmentCSVText(csv).validRows[0].soil_temp_c).toBe(24.7);
  });

  it("drops an out-of-range soil value instead of saving it", () => {
    const csv = [SOIL_HEADER, soilRow("2026-11-05T11:00:00Z", "95", "140", "0.5")].join("\n");
    const r = parseEnvironmentCSVText(csv);
    expect(r.validRows[0]).toMatchObject({
      soil_temp_c: null,
      soil_moisture_pct: null,
      soil_ec: 0.5,
    });
  });

  it("persists soil metrics with their meaning recorded", () => {
    const rows = parseEnvironmentCSVText(SOIL_FILE, { sourceTimeZone: CHICAGO }).validRows;
    const inserts = buildSensorReadingInserts(rows.slice(0, 1), SCOPE);
    expect(inserts.map((i) => [i.metric, i.value, i.source])).toEqual([
      ["soil_temp_c", 24.7, "csv"],
      ["soil_moisture_pct", 68.1, "csv"],
      ["ec", 0.74, "csv"],
    ]);
    expect(inserts[1].raw_payload.soil_moisture_basis).toBe("vendor_reading_uncalibrated");
    expect(inserts[2].raw_payload.ec_unit_assumed).toBe("mS/cm");
    expect(inserts[0].raw_payload.raw_row.humidity_soil).toBe("68.1");
  });
});

describe("opt-in exclusion of DST fold rows", () => {
  const parsed = () => parseEnvironmentCSVText(FOLD_FILE, { sourceTimeZone: CHICAGO });

  it("stays blocked by default; excluding names exactly the fold rows", () => {
    const state = reduceParseResult(startParsingState(), parsed());
    expect(canConfirmImport(state)).toBe(false);
    expect(rowsToPersist(state.parsed, state.timeExclusion)).toEqual([]);

    const excluded = excludeUnresolvedTimeRows(state);
    expect(excluded.timeExclusion).toEqual({ sourceTimeZone: CHICAGO, rowNumbers: [2, 3] });
    expect(canConfirmImport(excluded)).toBe(true);
    const rows = rowsToPersist(excluded.parsed, excluded.timeExclusion);
    expect(rows.map((r) => r.rowNumber)).toEqual([1, 4]);
    expect(rows.map((r) => r.captured_at)).toEqual([
      "2026-10-31T23:00:00.000Z",
      "2026-11-05T17:00:00.000Z",
    ]);

    expect(canConfirmImport(undoTimeExclusion(excluded))).toBe(false);
  });

  it("an exclusion for another parse or zone does not unlock this one", () => {
    const state = reduceParseResult(startParsingState(), parsed());
    expect(rowsToPersist(state.parsed, { sourceTimeZone: CHICAGO, rowNumbers: [2] })).toEqual([]);
    expect(rowsToPersist(state.parsed, { sourceTimeZone: CHICAGO, rowNumbers: [2, 3, 4] })).toEqual(
      [],
    );
    expect(
      rowsToPersist(state.parsed, { sourceTimeZone: "America/New_York", rowNumbers: [2, 3] }),
    ).toEqual([]);
    // Changing the zone clears the choice; a fresh parse starts with none.
    const excluded = excludeUnresolvedTimeRows(state);
    expect(reopenTimeZoneChoice(excluded).timeExclusion).toBeNull();
    expect(reduceParseResult(excluded, parsed()).timeExclusion).toBeNull();
  });

  it("cannot exclude rows that only need a time zone", () => {
    const state = reduceParseResult(startParsingState(), parseEnvironmentCSVText(FOLD_FILE));
    expect(state.phase).toBe("time_confirm");
    expect(excludeUnresolvedTimeRows(state).timeExclusion).toBeNull();
  });

  it("the write boundary still receives only verified rows", async () => {
    const insertSensorReadings = vi.fn(async (rows: unknown[]) => ({
      error: null,
      insertedCount: rows.length,
    }));
    const excluded = excludeUnresolvedTimeRows(reduceParseResult(startParsingState(), parsed()));
    const res = await persistCsvEnvironmentRows(
      rowsToPersist(excluded.parsed, excluded.timeExclusion),
      SCOPE,
      { insertSensorReadings } as InsertClient,
    );
    expect(res.error).toBeNull();
    const sent = insertSensorReadings.mock.calls.flatMap(
      (c) => c[0] as Array<{ captured_at: string }>,
    );
    expect(new Set(sent.map((s) => s.captured_at))).toEqual(
      new Set(["2026-10-31T23:00:00.000Z", "2026-11-05T17:00:00.000Z"]),
    );
  });

  it("completion copy states the left-out count separately from duplicates", () => {
    expect(buildCsvImportDoneMessage(10, 0, 2, 12)).toBe(
      "Imported 10 CSV reading(s). From 2 sensor row(s). Left out 12 rows whose time was unclear around a clock change, as you chose.",
    );
    expect(buildCsvImportDoneMessage(10, 0, 10)).toBe("Imported 10 CSV reading(s).");
  });
});

function makeFile(text: string) {
  return new File([text], "synthetic.csv", { type: "text/csv" });
}

describe("EnvironmentCsvImportModal — soil and DST exclusion", () => {
  it("imports a soil-only file after the zone step and labels soil meaning", async () => {
    const onConfirm = vi.fn(async () => ({ insertedCount: 6, error: null }));
    render(<EnvironmentCsvImportModal open onOpenChange={() => {}} onConfirm={onConfirm} />);
    const input = screen.getByTestId("csv-import-file-input") as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [makeFile(SOIL_FILE)] });
    fireEvent.change(input);
    await screen.findByTestId("csv-import-time-confirm");
    fireEvent.change(screen.getByLabelText("Source time zone"), { target: { value: CHICAGO } });
    fireEvent.click(screen.getByTestId("csv-import-time-continue"));
    await screen.findByTestId("csv-import-preview");
    expect(screen.getByTestId("csv-import-soil-meaning").textContent).toBe(
      "Soil moisture is the controller’s own reading, not a calibrated water-content value; soil EC is saved as mS/cm, which the file doesn’t state.",
    );
    expect(screen.getByTestId("csv-import-row-preview").textContent).toContain(
      "soil moisture 68.1% (uncalibrated)",
    );
    fireEvent.click(screen.getByTestId("csv-import-confirm"));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
  });

  it("offers an explicit leave-out choice for fold rows, with undo", async () => {
    const onConfirm = vi.fn(async () => ({ insertedCount: 10, error: null }));
    render(<EnvironmentCsvImportModal open onOpenChange={() => {}} onConfirm={onConfirm} />);
    const input = screen.getByTestId("csv-import-file-input") as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [makeFile(FOLD_FILE)] });
    fireEvent.change(input);
    await screen.findByTestId("csv-import-time-confirm");
    fireEvent.change(screen.getByLabelText("Source time zone"), { target: { value: CHICAGO } });
    fireEvent.click(screen.getByTestId("csv-import-time-continue"));
    await screen.findByTestId("csv-import-time-blocked");
    const confirm = () => screen.getByTestId("csv-import-confirm") as HTMLButtonElement;
    expect(confirm().disabled).toBe(true);

    const leaveOut = screen.getByTestId("csv-import-time-exclude");
    expect(leaveOut.textContent).toBe("Leave out these 2 rows and import the other 2");
    fireEvent.click(leaveOut);
    expect(screen.getByTestId("csv-import-time-excluded").textContent).toContain(
      "2 rows will be left out and not saved (rows 2, 3).",
    );
    expect(confirm().disabled).toBe(false);

    fireEvent.click(screen.getByTestId("csv-import-time-exclude-undo"));
    expect(confirm().disabled).toBe(true);
    fireEvent.click(screen.getByTestId("csv-import-time-exclude"));
    fireEvent.click(confirm());
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    const [[sent]] = onConfirm.mock.calls as unknown as [[Array<{ rowNumber: number }>]];
    expect(sent.map((r) => r.rowNumber)).toEqual([1, 4]);
    expect((await screen.findByTestId("csv-import-done")).textContent).toContain(
      "Left out 2 rows whose time was unclear around a clock change",
    );
  });
});
