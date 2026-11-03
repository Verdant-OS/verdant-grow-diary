import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import TimelineCsvContextPanel from "@/components/TimelineCsvContextPanel";
import ImportedSensorHistoryPanel from "@/components/ImportedSensorHistoryPanel";
import { EnvironmentCsvImportModal } from "@/components/EnvironmentCsvImportModal";
import { CsvTimelineSnapshotList } from "@/lib/environmentCsvTimelineContextViewModel";
import { buildImportedSensorHistoryViewModel } from "@/lib/importedSensorHistoryViewModel";
import { formatCsvPreviewRow } from "@/lib/environmentCsvPreviewCopyRules";
import { buildCsvImportDoneMessage } from "@/lib/environmentCsvImportViewModel";
import {
  buildSensorReadingInserts,
  persistCsvEnvironmentRows,
} from "@/lib/environmentCsvImportPersistence";
import { dedupeKeyOf } from "@/lib/csv-import/sensorReadingsBatchInsert";
import { parseEnvironmentCSVText } from "@/lib/csvParser";
import { CsvImportVendorIdentity } from "@/lib/csvImportVendorIdentity";

const read = vi.hoisted(() => vi.fn());

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        in: () => chain,
        order: () => chain,
        limit: () => read(),
      };
      return chain;
    },
  },
}));

vi.mock("@/hooks/useTemperatureUnitPreference", () => ({
  useTemperatureUnitPreference: () => "fahrenheit",
}));

const october = "2026-10-28T12:30:00.000Z";
const today = ["2026-11-02T15:00:00.000Z", "2026-11-02T16:00:00.000Z", "2026-11-02T17:00:00.000Z"];
const temps = [75.2, 76.1, 77.0];

function metricRow(
  capturedAt: string,
  metric: string,
  value: number,
  extra: Record<string, unknown> = {},
) {
  return {
    tent_id: "tent-1",
    source: "csv",
    metric,
    value,
    captured_at: capturedAt,
    raw_payload: { grow_id: "grow-1", source_tag: "csv", ...extra },
  };
}

describe("CSV import display #2736–#2739", () => {
  it("shows one card per distinct reading, including today's import", async () => {
    const rows = [
      ...Array.from({ length: 4 }, () => metricRow(october, "temperature_c", 25.5555555556)),
      ...today.map((capturedAt, index) =>
        metricRow(capturedAt, "temperature_c", (temps[index] - 32) * (5 / 9)),
      ),
    ];
    read.mockResolvedValue({ data: rows, error: null });
    const entries = Array.from({ length: 4 }, (_, index) => ({
      id: `diary-${index}`,
      tent_id: "tent-1",
      entry_at: october,
    }));
    render(<TimelineCsvContextPanel growId="grow-1" entries={entries} />);
    await waitFor(() => expect(screen.getAllByText(/78\.0 °F/).length).toBe(1));
    expect(screen.getByText(/75\.2 °F/)).toBeTruthy();
    expect(screen.getByText(/76\.1 °F/)).toBeTruthy();
    expect(screen.getByText(/77\.0 °F/)).toBeTruthy();
    expect(
      CsvTimelineSnapshotList.distinct({
        sensorReadings: rows,
        growId: "grow-1",
        tentId: "tent-1",
        diaryEntries: entries.map((entry) => ({
          id: entry.id,
          grow_id: "grow-1",
          tent_id: entry.tent_id,
          occurred_at: entry.entry_at,
        })),
      }),
    ).toHaveLength(4);
  });

  it("keeps an older diary entry's chip after a larger newer import", async () => {
    const olderAt = "2026-09-01T12:00:00.000Z";
    const newer = Array.from({ length: 13 }, (_, index) =>
      metricRow(
        new Date(Date.parse("2026-11-02T00:00:00.000Z") + index * 3_600_000).toISOString(),
        "temperature_c",
        (80 - 32) * (5 / 9),
      ),
    );
    const rows = [metricRow(olderAt, "temperature_c", (70 - 32) * (5 / 9)), ...newer];
    read.mockResolvedValue({ data: rows, error: null });
    render(
      <TimelineCsvContextPanel
        growId="grow-1"
        entries={[{ id: "older-entry", tent_id: "tent-1", entry_at: olderAt }]}
      />,
    );
    await waitFor(() => expect(screen.getByTestId("csv-timeline-chip-older-entry")).toBeTruthy());
    expect(screen.getByTestId("csv-timeline-chip-older-entry").textContent).toContain("70.0 °F");
    expect(screen.getAllByText(/80\.0 °F/).length).toBe(12);
    expect(screen.getByTestId("timeline-csv-more-readings").textContent).toBe(
      "1 more CSV readings in Sensors",
    );
  });

  it("pins a diary chip to the nearest CSV reading inside 45 minutes", async () => {
    const entryAt = "2026-11-02T12:00:00.000Z";
    const farther = new Date(Date.parse(entryAt) + 40 * 60_000).toISOString();
    const nearer = new Date(Date.parse(entryAt) + 5 * 60_000).toISOString();
    read.mockResolvedValue({
      data: [
        metricRow(farther, "temperature_c", (80 - 32) * (5 / 9)),
        metricRow(nearer, "temperature_c", (72 - 32) * (5 / 9)),
      ],
      error: null,
    });
    render(
      <TimelineCsvContextPanel
        growId="grow-1"
        entries={[{ id: "near-entry", tent_id: "tent-1", entry_at: entryAt }]}
      />,
    );
    await waitFor(() => expect(screen.getByTestId("csv-timeline-chip-near-entry")).toBeTruthy());
    expect(screen.getByTestId("csv-timeline-chip-near-entry").textContent).toContain("72.0 °F");
    expect(screen.getByTestId("csv-timeline-chip-near-entry").textContent).not.toContain("80.0 °F");
  });

  it("names the vendor on imported history and keeps the stored source csv", () => {
    const parsed = parseEnvironmentCSVText("Timestamp,Temp(°F),RH\n2026-11-02T15:00:00Z,75.2,55\n");
    const stamped = {
      ...parsed.validRows[0],
      source_app: "ac_infinity" as const,
      import_file_name: "AC Infinity.csv",
    };
    const inserts = buildSensorReadingInserts([stamped], {
      user_id: "u",
      grow_id: "g",
      tent_id: "t",
    });
    expect(inserts.every((row) => row.source === "csv")).toBe(true);
    expect(inserts[0].raw_payload.source_app).toBe("ac_infinity");
    expect(inserts.every((row) => !("import_file_name" in row.raw_payload))).toBe(true);
    expect(CsvImportVendorIdentity.detect("not-ac-infinity.csv", [])).toBeNull();
    expect(CsvImportVendorIdentity.detect("AC Infinity.csv", [])).toBe("ac_infinity");
    render(
      <MemoryRouter>
        <ImportedSensorHistoryPanel
          tentId="t"
          readings={inserts.map((row) => ({
            tent_id: row.tent_id,
            source: row.source,
            metric: row.metric,
            value: row.value,
            captured_at: row.captured_at,
            raw_payload: row.raw_payload,
          }))}
        />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("imported-history-source-badge")).toHaveTextContent(
      "Source: CSV · AC Infinity",
    );
    expect(CsvImportVendorIdentity.badgeForRows(inserts)).toBe("CSV · AC Infinity");
  });

  it("does not count a fully duplicate sensor row in From N", async () => {
    const parsed = parseEnvironmentCSVText(
      "Timestamp,Temp(°F),RH\n2026-11-02T15:00:00Z,75.2,55\n2026-11-02T16:00:00Z,76.1,56\n",
    );
    const scope = { user_id: "u", grow_id: "g", tent_id: "t" };
    const existing = new Set(
      buildSensorReadingInserts([parsed.validRows[0]], scope)
        .map((row) => dedupeKeyOf(row))
        .filter((key): key is string => key != null),
    );
    const res = await persistCsvEnvironmentRows(parsed.validRows, scope, {
      insertSensorReadings: async (batch) => ({ error: null, insertedCount: batch.length }),
      fetchExistingSensorReadingKeys: async () => existing,
    });
    expect(res.contributedSensorRowCount).toBe(1);
    expect(parsed.validRows).toHaveLength(2);
    const message = buildCsvImportDoneMessage(
      res.insertedCount,
      res.duplicateCount,
      res.contributedSensorRowCount,
    );
    expect(message).toContain("From 1 sensor row(s).");
    expect(message).not.toContain("From 2");
  });

  it("previews a Fahrenheit file in °F", () => {
    const parsed = parseEnvironmentCSVText("Timestamp,Temp(°F),RH\n2026-11-02T15:00:00Z,75.2,60\n");
    const copy = formatCsvPreviewRow(parsed.validRows[0]);
    expect(copy).toContain("75.2°F");
    expect(copy).not.toContain("°C");
    expect(parsed.validRows[0].temperature_c).toBeCloseTo(24, 0);
  });

  it("labels humidity and VPD for growers", () => {
    const vm = buildImportedSensorHistoryViewModel({
      readings: [
        {
          tent_id: "t",
          source: "csv",
          metric: "humidity_pct",
          value: 55,
          captured_at: "2026-11-02T15:00:00.000Z",
        },
        {
          tent_id: "t",
          source: "csv",
          metric: "vpd_kpa",
          value: 1.2,
          captured_at: "2026-11-02T15:00:00.000Z",
        },
      ],
      temperatureUnit: "fahrenheit",
    });
    expect(vm.recentRows.map((row) => row.metricLabel)).toEqual(["Humidity", "VPD"]);
    expect(vm.metricOptions.map((option) => option.label)).toContain("Humidity");
    expect(vm.metricOptions.map((option) => option.label)).toContain("VPD");
  });

  it("counts stored readings and the sensor rows they came from", async () => {
    expect(buildCsvImportDoneMessage(9, 0, 3)).toBe(
      "Imported 9 CSV reading(s). From 3 sensor row(s).",
    );
    const confirm = vi.fn().mockResolvedValue({
      insertedCount: 9,
      contributedSensorRowCount: 1,
      error: null,
    });
    render(
      <MemoryRouter>
        <EnvironmentCsvImportModal open onOpenChange={() => {}} onConfirm={confirm} />
      </MemoryRouter>,
    );
    const csv = ["Timestamp,Temp(°C),RH", "2026-11-02T15:00:00Z,24,60"].join("\n");
    fireEvent.change(screen.getByTestId("csv-import-file-input"), {
      target: { files: [new File([csv], "room.csv", { type: "text/csv" })] },
    });
    await screen.findByTestId("csv-import-preview");
    expect(screen.getByTestId("csv-import-valid-count")).toHaveTextContent("1");
    fireEvent.click(screen.getByTestId("csv-import-confirm"));
    expect(await screen.findByTestId("csv-import-done")).toHaveTextContent(
      "Imported 9 CSV reading(s). From 1 sensor row(s).",
    );
  });
});
