import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import { buildCsvTimelineContext } from "@/lib/environmentCsvTimelineContextViewModel";
import TimelineCsvContextPanel from "@/components/TimelineCsvContextPanel";
import ImportedSensorHistoryPanel from "@/components/ImportedSensorHistoryPanel";
import { EnvironmentCsvImportModal } from "@/components/EnvironmentCsvImportModal";
import { CsvTimelineSnapshotList } from "@/lib/environmentCsvTimelineContextViewModel";
import {
  IMPORTED_CALCULATED_VPD_LABEL,
  buildImportedSensorHistoryViewModel,
} from "@/lib/importedSensorHistoryViewModel";
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
  // Matthew 2026-11-03: Timeline keeps the base chips, one owner per snapshot.
  // Unlinked readings are no longer rendered as Timeline cards.
  it("shows one chip per distinct reading when several entries share it", async () => {
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
    render(
      <MemoryRouter>
        <TimelineCsvContextPanel growId="grow-1" entries={entries} />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getAllByText(/78\.0 °F/).length).toBe(1));
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
        (81 + index - 32) * (5 / 9),
      ),
    );
    const rows = [metricRow(olderAt, "temperature_c", (70 - 32) * (5 / 9)), ...newer];
    read.mockResolvedValue({ data: rows, error: null });
    render(
      <MemoryRouter>
        <TimelineCsvContextPanel
          growId="grow-1"
          entries={[{ id: "older-entry", tent_id: "tent-1", entry_at: olderAt }]}
        />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByTestId("csv-timeline-chip-older-entry")).toBeTruthy());
    expect(screen.getByTestId("csv-timeline-chip-older-entry").textContent).toContain("70.0 °F");
    expect(screen.queryByText(/81\.0 °F/)).toBeNull();
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
      <MemoryRouter>
        <TimelineCsvContextPanel
          growId="grow-1"
          entries={[{ id: "near-entry", tent_id: "tent-1", entry_at: entryAt }]}
        />
      </MemoryRouter>,
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

  it("labels calculated VPD and leaves unknown metric keys unchanged", () => {
    const vm = buildImportedSensorHistoryViewModel({
      readings: [
        {
          tent_id: "t",
          source: "csv",
          metric: "vpd_kpa",
          value: 1.1,
          captured_at: "2026-11-02T15:00:00.000Z",
          vpd_source: "derived",
        },
        {
          tent_id: "t",
          source: "csv",
          metric: "leaf_temp_c",
          value: 22,
          captured_at: "2026-11-02T15:00:00.000Z",
        },
      ],
      temperatureUnit: "fahrenheit",
    });
    expect(vm.recentRows.map((row) => row.metricLabel).sort()).toEqual([
      IMPORTED_CALCULATED_VPD_LABEL,
      "leaf_temp_c",
    ]);
    expect(vm.metricOptions.map((option) => option.label)).toContain(IMPORTED_CALCULATED_VPD_LABEL);
    expect(vm.recentRows.map((row) => row.metricLabel)).not.toContain("leaf temp c");
    const derivedRow = {
      tent_id: "t",
      source: "csv",
      metric: "vpd_kpa",
      value: 1.1,
      captured_at: "2026-11-02T15:00:00.000Z",
      raw_payload: { vpd_source: "derived" },
    };
    render(
      <MemoryRouter>
        <ImportedSensorHistoryPanel tentId="t" readings={[derivedRow]} />
      </MemoryRouter>,
    );
    expect(screen.getAllByText(IMPORTED_CALCULATED_VPD_LABEL).length).toBeGreaterThan(0);
    expect(screen.queryByText("VPD (1)")).toBeNull();
  });

  it("breaks an equal-distance snapshot tie toward the earlier timestamp", () => {
    const entryAt = "2026-11-02T12:00:00.000Z";
    const earlier = new Date(Date.parse(entryAt) - 10 * 60_000).toISOString();
    const later = new Date(Date.parse(entryAt) + 10 * 60_000).toISOString();
    const rows = [
      metricRow(later, "temperature_c", (70 - 32) * (5 / 9)),
      metricRow(earlier, "temperature_c", (60 - 32) * (5 / 9)),
    ];
    const diary = [
      { id: "b-entry", grow_id: "grow-1", tent_id: "tent-1", occurred_at: entryAt },
      { id: "a-entry", grow_id: "grow-1", tent_id: "tent-1", occurred_at: entryAt },
    ];
    const matched = buildCsvTimelineContext({
      sensorReadings: rows,
      growId: "grow-1",
      tentId: "tent-1",
      diaryEntries: diary,
    });
    expect(matched.every((entry) => entry.snapshot?.capturedAt === earlier)).toBe(true);
    read.mockResolvedValue({ data: rows, error: null });
    render(
      <MemoryRouter>
        <TimelineCsvContextPanel
          growId="grow-1"
          entries={diary.map((entry) => ({
            id: entry.id,
            tent_id: entry.tent_id,
            entry_at: entry.occurred_at,
          }))}
        />
      </MemoryRouter>,
    );
    return waitFor(() => {
      expect(screen.getByTestId("csv-timeline-chip-a-entry").textContent).toContain("60.0 °F");
      expect(screen.queryByTestId("csv-timeline-chip-b-entry")).toBeNull();
    });
  });

  it("counts a sensor row only after its insert batch is acknowledged", async () => {
    const parsed = parseEnvironmentCSVText(
      "Timestamp,Temp(°F)\n2026-11-02T15:00:00Z,75.2\n2026-11-02T16:00:00Z,76.1\n",
    );
    let calls = 0;
    const res = await persistCsvEnvironmentRows(
      parsed.validRows,
      { user_id: "u", grow_id: "g", tent_id: "t" },
      {
        insertSensorReadings: async () => {
          calls += 1;
          if (calls === 1) return { error: null, insertedCount: 1 };
          return { error: { message: "rejected", code: "23502" }, insertedCount: 0 };
        },
      },
      1,
    );
    expect(res.insertedCount).toBe(1);
    expect(res.partialWrite).toBe(true);
    expect(res.contributedSensorRowCount).toBe(1);
  });
});
