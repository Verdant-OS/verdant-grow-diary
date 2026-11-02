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
import { buildSensorReadingInserts } from "@/lib/environmentCsvImportPersistence";
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
      }),
    ).toHaveLength(4);
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
    const confirm = vi.fn().mockResolvedValue({ insertedCount: 9, error: null });
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
