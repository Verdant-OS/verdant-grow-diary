/**
 * CSV import observation-time integrity (P0).
 *
 * Unzoned clock times are never assigned UTC (or any zone) implicitly. They
 * stay unresolved, and the file is not write-eligible, until the grower names
 * the source time zone. DST folds and gaps stay unresolved even then.
 *
 * Fixtures are SYNTHETIC, shaped like a Spider Farmer device export. They are
 * not real observations or hardware identifiers. Expected instants are literal
 * and must hold under any host TZ (run with TZ=UTC and TZ=America/Los_Angeles).
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { interpretCsvTimestamp, isValidIanaTimeZone } from "@/lib/csvTimestampRules";
import { parseEnvironmentCSVText, type ParsedEnvironmentRow } from "@/lib/csvParser";
import {
  buildTimePreview,
  canConfirmImport,
  reduceParseResult,
  rowsToPersist,
  startParsingState,
} from "@/lib/environmentCsvImportViewModel";
import {
  CSV_TIME_UNRESOLVED_COPY,
  findRowsWithUnverifiedTime,
  persistCsvEnvironmentRows,
  type InsertClient,
} from "@/lib/environmentCsvImportPersistence";
import { EnvironmentCsvImportModal } from "@/components/EnvironmentCsvImportModal";

const CHICAGO = "America/Chicago";
const HEADER =
  "deviceSerialnum,temperature(°C),humidity,vpd,temperature(°F),co2,Timestamp,temperature_soil_f(°F),temperature_soil(°C),humidity_soil,ec_soil,ppfd";
const row = (ts: string, ppfd = "0") =>
  `SYNTHETIC-ALPHA,25.0,60,1.27,77.0,420,${ts},71.6,22.0,45,0.50,${ppfd}`;
const FIXTURE_A = [
  HEADER,
  row("2026-09-03 23:00:00"),
  row("2026-11-01 01:30:00"),
  row("2026-11-04 19:55:00", "500"),
].join("\n");
const FIXTURE_NO_FOLD = [HEADER, row("2026-09-03 23:00:00"), row("2026-11-04 19:55:00")].join("\n");

const SCOPE = { user_id: "u-1", grow_id: "g-1", tent_id: "t-1" };

function fakeClient() {
  const insertSensorReadings = vi.fn(async (rows: unknown[]) => ({
    error: null,
    insertedCount: rows.length,
  }));
  return { client: { insertSensorReadings } as InsertClient, insertSensorReadings };
}

describe("csvTimestampRules", () => {
  it("converts explicitly chosen America/Chicago wall times with date-aware offsets", () => {
    expect(interpretCsvTimestamp("2026-09-03 23:00:00", CHICAGO)).toMatchObject({
      kind: "resolved",
      iso: "2026-09-04T04:00:00.000Z",
      basis: "source_time_zone",
      zone: CHICAGO,
      offset: "-05:00",
    });
    expect(interpretCsvTimestamp("2026-11-04 19:55:00", CHICAGO)).toMatchObject({
      kind: "resolved",
      iso: "2026-11-05T01:55:00.000Z",
      offset: "-06:00",
    });
  });

  it("never assigns a zone to a wall time on its own", () => {
    expect(interpretCsvTimestamp("2026-09-03 23:00:00", null)).toEqual({ kind: "needs_zone" });
    expect(interpretCsvTimestamp("2026-06-01", null)).toEqual({ kind: "needs_zone" });
    expect(interpretCsvTimestamp("03/04/2026 10:00", null)).toEqual({ kind: "needs_zone" });
  });

  it("keeps a DST fold unresolved with both candidates and no default", () => {
    expect(interpretCsvTimestamp("2026-11-01 01:30:00", CHICAGO)).toEqual({
      kind: "ambiguous",
      zone: CHICAGO,
      candidates: ["2026-11-01T06:30:00.000Z", "2026-11-01T07:30:00.000Z"],
    });
  });

  it("keeps a DST gap unresolved instead of rolling it forward", () => {
    expect(interpretCsvTimestamp("2026-03-08 02:30:00", CHICAGO)).toEqual({
      kind: "nonexistent",
      zone: CHICAGO,
    });
  });

  it("treats explicit offsets as instants and never shifts them again", () => {
    const a = interpretCsvTimestamp("2026-11-01T01:30:00-05:00", CHICAGO);
    const b = interpretCsvTimestamp("2026-11-01T01:30:00-06:00", CHICAGO);
    expect(a).toMatchObject({ kind: "resolved", iso: "2026-11-01T06:30:00.000Z" });
    expect(b).toMatchObject({ kind: "resolved", iso: "2026-11-01T07:30:00.000Z" });
    for (const zone of [null, CHICAGO, "Asia/Tokyo"]) {
      expect(interpretCsvTimestamp("2026-11-05T17:00:00Z", zone)).toMatchObject({
        kind: "resolved",
        iso: "2026-11-05T17:00:00.000Z",
        basis: "explicit_offset",
        zone: null,
      });
    }
  });

  it("rejects impossible calendar values without rollover", () => {
    for (const bad of [
      "2026-02-30 12:00:00",
      "2026-13-01 00:00:00",
      "2026-01-01 25:00:00",
      "2026-01-01 10:60:00",
      "2026-01-01T10:00:00+15:00",
      "",
      "Tue Jun 01 2026",
      "yesterday",
    ]) {
      expect(interpretCsvTimestamp(bad, CHICAGO)).toEqual({ kind: "invalid" });
    }
  });

  it("reads slashed dates month-first, deterministically, never by host locale", () => {
    expect(interpretCsvTimestamp("03/04/2026", "UTC")).toMatchObject({
      iso: "2026-03-04T00:00:00.000Z",
    });
    expect(interpretCsvTimestamp("13/04/2026", "UTC")).toEqual({ kind: "invalid" });
  });

  it("validates zone names", () => {
    expect(isValidIanaTimeZone(CHICAGO)).toBe(true);
    expect(isValidIanaTimeZone("Mars/Olympus")).toBe(false);
    expect(isValidIanaTimeZone("")).toBe(false);
    expect(interpretCsvTimestamp("2026-09-03 23:00:00", "Mars/Olympus")).toEqual({
      kind: "invalid",
    });
  });
});

describe("csvParser — source time zone", () => {
  it("without a zone: no write-eligible rows, no error, every row explained", () => {
    const r = parseEnvironmentCSVText(FIXTURE_A);
    expect(r.errors).toEqual([]);
    expect(r.validRows).toEqual([]);
    expect(r.unresolvedTimeRows).toEqual([
      { rowNumber: 1, sourceText: "2026-09-03 23:00:00", reason: "needs_source_time_zone" },
      { rowNumber: 2, sourceText: "2026-11-01 01:30:00", reason: "needs_source_time_zone" },
      { rowNumber: 3, sourceText: "2026-11-04 19:55:00", reason: "needs_source_time_zone" },
    ]);
    // Recognized soil columns now import as soil metrics (founder decision 2026-11-05).
    expect(r.unsupportedColumns).toEqual([]);
  });

  it("with America/Chicago: exact instants, provenance kept, the fold stays unresolved", () => {
    const r = parseEnvironmentCSVText(FIXTURE_A, { sourceTimeZone: CHICAGO });
    expect(r.validRows.map((v) => v.captured_at)).toEqual([
      "2026-09-04T04:00:00.000Z",
      "2026-11-05T01:55:00.000Z",
    ]);
    expect(r.validRows[0].time_provenance).toEqual({
      source_text: "2026-09-03 23:00:00",
      basis: "source_time_zone",
      source_time_zone: CHICAGO,
      utc_offset: "-05:00",
    });
    expect(r.validRows[1].time_provenance?.utc_offset).toBe("-06:00");
    expect(r.validRows[0].raw_payload.Timestamp).toBe("2026-09-03 23:00:00");
    expect(r.unresolvedTimeRows).toEqual([
      { rowNumber: 2, sourceText: "2026-11-01 01:30:00", reason: "ambiguous_local_time" },
    ]);
    // Units and nulls are unchanged by the time decision.
    expect(r.validRows[0]).toMatchObject({ temperature_c: 25, ppfd: 0, vpd_source: "csv" });
    expect(r.validRows[1].ppfd).toBe(500);
  });

  it("keeps explicit-offset rows and holds naive rows in the same file", () => {
    const csv = [
      "Timestamp,Temp(°C),RH",
      "2026-11-01T01:30:00-05:00,25,50",
      "2026-11-01T01:30:00-06:00,25,50",
      "2026-11-01 03:00:00,25,50",
    ].join("\n");
    const r = parseEnvironmentCSVText(csv);
    expect(r.validRows.map((v) => v.captured_at)).toEqual([
      "2026-11-01T06:30:00.000Z",
      "2026-11-01T07:30:00.000Z",
    ]);
    expect(r.unresolvedTimeRows?.map((u) => u.rowNumber)).toEqual([3]);
  });

  it("does not fill a source gap: two observations days apart stay two rows", () => {
    const csv = [
      "Timestamp,Temp(°C),RH",
      "2026-10-14 02:05:00,25,50",
      "2026-10-21 04:50:00,25,50",
    ].join("\n");
    const r = parseEnvironmentCSVText(csv, { sourceTimeZone: CHICAGO });
    expect(r.validRows).toHaveLength(2);
    expect(r.skippedRows).toEqual([]);
  });

  it("refuses an unknown zone as a file-level error", () => {
    const r = parseEnvironmentCSVText(FIXTURE_A, { sourceTimeZone: "Mars/Olympus" });
    expect(r.errors.map((e) => e.code)).toEqual(["invalid_time_zone"]);
    expect(r.validRows).toEqual([]);
  });

  it("still reports invalid timestamps as skipped rows", () => {
    const r = parseEnvironmentCSVText(
      ["Timestamp,Temp(°C),RH", "2026-02-30 12:00:00,25,50", "2026-06-01T10:00:00Z,25,50"].join(
        "\n",
      ),
    );
    expect(r.skippedRows).toEqual([{ rowNumber: 1, reason: "invalid_timestamp" }]);
    expect(r.validRows).toHaveLength(1);
  });
});

describe("view model — time gate", () => {
  it("asks for a zone first and exposes nothing to persist", () => {
    const state = reduceParseResult(startParsingState(), parseEnvironmentCSVText(FIXTURE_A));
    expect(state.phase).toBe("time_confirm");
    expect(canConfirmImport(state)).toBe(false);
    expect(rowsToPersist(state.parsed)).toEqual([]);
  });

  it("blocks the whole file while a fold remains, with exact counts", () => {
    const state = reduceParseResult(
      startParsingState(),
      parseEnvironmentCSVText(FIXTURE_A, { sourceTimeZone: CHICAGO }),
    );
    expect(state.phase).toBe("preview");
    expect(canConfirmImport(state)).toBe(false);
    expect(rowsToPersist(state.parsed)).toEqual([]);
    const tp = buildTimePreview(state.parsed);
    expect(tp).toMatchObject({ unresolvedCount: 1, ambiguousCount: 1, nonexistentCount: 0 });
    expect(tp.unresolvedExamples.map((u) => u.rowNumber)).toEqual([2]);
  });

  it("opens Confirm only when every time is established; samples show both offsets", () => {
    const state = reduceParseResult(
      startParsingState(),
      parseEnvironmentCSVText(FIXTURE_NO_FOLD, { sourceTimeZone: CHICAGO }),
    );
    expect(canConfirmImport(state)).toBe(true);
    expect(rowsToPersist(state.parsed)).toHaveLength(2);
    expect(buildTimePreview(state.parsed).samples).toEqual([
      {
        rowNumber: 1,
        sourceText: "2026-09-03 23:00:00",
        zoneLabel: CHICAGO,
        utcOffset: "-05:00",
        observedAt: "2026-09-04T04:00:00.000Z",
      },
      {
        rowNumber: 2,
        sourceText: "2026-11-04 19:55:00",
        zoneLabel: CHICAGO,
        utcOffset: "-06:00",
        observedAt: "2026-11-05T01:55:00.000Z",
      },
    ]);
  });
});

describe("persistence — write-boundary time check", () => {
  const good = () =>
    parseEnvironmentCSVText(FIXTURE_NO_FOLD, { sourceTimeZone: CHICAGO }).validRows;

  it("inserts verified rows and carries time provenance into raw_payload", async () => {
    const { client, insertSensorReadings } = fakeClient();
    const res = await persistCsvEnvironmentRows(good(), SCOPE, client);
    expect(res.error).toBeNull();
    const sent = insertSensorReadings.mock.calls[0][0] as Array<{
      captured_at: string;
      raw_payload: { time_provenance?: unknown };
    }>;
    expect(sent[0].captured_at).toBe("2026-09-04T04:00:00.000Z");
    expect(sent[0].raw_payload.time_provenance).toMatchObject({
      source_time_zone: CHICAGO,
      utc_offset: "-05:00",
    });
  });

  it("refuses a row whose instant does not match its own provenance", async () => {
    const [first, second] = good();
    const shifted: ParsedEnvironmentRow = { ...first, captured_at: "2026-09-03T23:00:00.000Z" };
    const rezoned: ParsedEnvironmentRow = {
      ...second,
      time_provenance: { ...second.time_provenance!, source_time_zone: "Asia/Tokyo" },
    };
    expect(findRowsWithUnverifiedTime([shifted, rezoned, first])).toEqual([0, 1]);
    const { client, insertSensorReadings } = fakeClient();
    const res = await persistCsvEnvironmentRows([shifted, second], SCOPE, client);
    expect(insertSensorReadings).not.toHaveBeenCalled();
    expect(res).toMatchObject({ insertedCount: 0, partialWrite: false });
    expect(res.error).toBe(CSV_TIME_UNRESOLVED_COPY);
  });

  it("refuses a non-canonical or missing instant and an unknown basis", () => {
    const [first] = good();
    expect(
      findRowsWithUnverifiedTime([
        { ...first, captured_at: "2026-09-03 23:00:00" },
        { ...first, captured_at: "" },
        {
          ...first,
          time_provenance: { ...first.time_provenance!, basis: "guess" as never },
        },
        {
          ...first,
          time_provenance: { ...first.time_provenance!, source_time_zone: null },
        },
      ]),
    ).toEqual([0, 1, 2, 3]);
  });
});

function makeFile(text: string) {
  const f = new File([text], "synthetic.csv", { type: "text/csv" });
  Object.defineProperty(f, "text", { value: async () => text });
  return f;
}

async function upload(text: string) {
  const input = screen.getByTestId("csv-import-file-input") as HTMLInputElement;
  Object.defineProperty(input, "files", { value: [makeFile(text)] });
  fireEvent.change(input);
}

describe("EnvironmentCsvImportModal — source time zone step", () => {
  it("asks for the zone, then previews exact instants; cancel never inserts", async () => {
    const onConfirm = vi.fn(async () => ({ insertedCount: 2, error: null }));
    render(<EnvironmentCsvImportModal open onOpenChange={() => {}} onConfirm={onConfirm} />);
    await upload(FIXTURE_NO_FOLD);
    await screen.findByTestId("csv-import-time-confirm");
    expect(screen.queryByTestId("csv-import-confirm")).toBeNull();
    expect(screen.getByTestId("csv-import-time-example").textContent).toContain(
      "2026-09-03 23:00:00",
    );
    const cont = screen.getByTestId("csv-import-time-continue") as HTMLButtonElement;
    expect(cont.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("Source time zone"), { target: { value: CHICAGO } });
    fireEvent.click(cont);
    await screen.findByTestId("csv-import-preview");
    const samples = screen.getByTestId("csv-import-time-samples").textContent ?? "";
    expect(samples).toContain(
      "2026-09-03 23:00:00 (America/Chicago, UTC-05:00) → 2026-09-04T04:00:00.000Z",
    );
    expect(samples).toContain(
      "2026-11-04 19:55:00 (America/Chicago, UTC-06:00) → 2026-11-05T01:55:00.000Z",
    );

    fireEvent.click(screen.getByTestId("csv-import-cancel"));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("blocks Confirm for a DST fold and says why, without calling onConfirm", async () => {
    const onConfirm = vi.fn(async () => ({ insertedCount: 0, error: null }));
    render(<EnvironmentCsvImportModal open onOpenChange={() => {}} onConfirm={onConfirm} />);
    await upload(FIXTURE_A);
    await screen.findByTestId("csv-import-time-confirm");
    fireEvent.change(screen.getByLabelText("Source time zone"), { target: { value: CHICAGO } });
    fireEvent.click(screen.getByTestId("csv-import-time-continue"));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("happened twice in America/Chicago");
    expect(alert.textContent).toContain("Row 2: 2026-11-01 01:30:00");
    expect(alert.textContent).toContain("Nothing has been saved");
    const confirm = screen.getByTestId("csv-import-confirm") as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.click(confirm);
    await waitFor(() => expect(onConfirm).not.toHaveBeenCalled());

    fireEvent.click(screen.getByTestId("csv-import-time-change"));
    expect(screen.getByTestId("csv-import-time-confirm")).toBeTruthy();
  });

  it("goes straight to preview when the file carries its own offsets", async () => {
    const onConfirm = vi.fn(async () => ({ insertedCount: 1, error: null }));
    render(<EnvironmentCsvImportModal open onOpenChange={() => {}} onConfirm={onConfirm} />);
    await upload("Timestamp,Temp(°C),RH\n2026-11-05T11:00:00-06:00,25,50\n");
    await screen.findByTestId("csv-import-preview");
    expect(screen.getByTestId("csv-import-time-preview").textContent).toContain(
      "2026-11-05T11:00:00-06:00 (offset in file, UTC-06:00) → 2026-11-05T17:00:00.000Z",
    );
    fireEvent.click(screen.getByTestId("csv-import-confirm"));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
  });
});

describe("EnvironmentCsvImportModal — soil disclosure", () => {
  // Only soil columns Verdant does not recognize (here: ph_soil) are still unsupported.
  const SOIL_ONLY =
    "deviceSerialnum,roomId,sensorId,temperature(°C),humidity,vpd,co2,Timestamp,ph_soil\n" +
    "SYNTHETIC-BRAVO,10000,SYNTHETIC-SOIL,,,,,2026-11-05T11:00:00-06:00,6.2\n";

  it("shows the soil-only reason for unrecognized soil columns, not the generic copy", async () => {
    const onConfirm = vi.fn(async () => ({ insertedCount: 0, error: null }));
    render(<EnvironmentCsvImportModal open onOpenChange={() => {}} onConfirm={onConfirm} />);
    await upload(SOIL_ONLY);
    const err = await screen.findByTestId("csv-import-error");
    expect(err.textContent).toContain("This file has soil readings only.");
    expect(err.textContent).not.toContain("We couldn’t read sensor data");
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("lists soil columns that won't be imported before Confirm in a mixed file", async () => {
    render(
      <EnvironmentCsvImportModal
        open
        onOpenChange={() => {}}
        onConfirm={async () => ({ insertedCount: 0, error: null })}
      />,
    );
    await upload(
      `${HEADER},ph_soil\nSYNTHETIC-ALPHA,25.0,60,1.27,77.0,420,2026-11-05T11:00:00-06:00,71.6,22.0,45,0.50,0,6.2\n`,
    );
    const note = await screen.findByTestId("csv-import-unsupported-columns");
    expect(note.textContent).toContain("Not imported: ph_soil.");
    expect(note.textContent).not.toContain("humidity_soil");
  });
});
