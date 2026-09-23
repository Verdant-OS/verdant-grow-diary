import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import {
  buildCsvTimelineContext,
  CSV_SNAPSHOT_TITLE,
  CSV_SOURCE_LABEL,
  CSV_DERIVED_VPD_LABEL,
  CSV_SUPPLIED_VPD_LABEL,
  CSV_UNKNOWN_VPD_LABEL,
} from "@/lib/environmentCsvTimelineContextViewModel";
import { CsvTimelineEnvironmentChip } from "@/components/CsvTimelineEnvironmentChip";
import { parseEnvironmentCSVText } from "@/lib/csvParser";
import { buildSensorReadingInserts } from "@/lib/environmentCsvImportPersistence";

const TENT_A = "tent-a";
const TENT_B = "tent-b";
const GROW_A = "grow-a";

describe("CSV timeline VPD origin", () => {
  const capturedAt = "2026-06-01T10:00:00.000Z";
  const entry = { id: "origin-entry", grow_id: GROW_A, tent_id: TENT_A, occurred_at: capturedAt };

  function snapshotFor(rows: Parameters<typeof buildCsvTimelineContext>[0]["sensorReadings"]) {
    return buildCsvTimelineContext({
      diaryEntries: [entry],
      sensorReadings: rows,
      growId: GROW_A,
      tentId: TENT_A,
    })[0].snapshot!;
  }

  it.each([
    { value: "1.70", origin: "csv", label: "CSV VPD" },
    { value: "", origin: "derived", label: "Derived VPD" },
  ])("keeps parser/mapper $origin and renders $label", ({ value, origin, label }) => {
    const parsed = parseEnvironmentCSVText(
      ["Timestamp,Temp(°C),RH,VPD", `${capturedAt},25,55,${value}`].join("\n"),
    );
    expect(parsed.validRows).toHaveLength(1);
    expect(parsed.validRows[0].vpd_source).toBe(origin);
    const rows = buildSensorReadingInserts(parsed.validRows, {
      user_id: "user-a",
      grow_id: GROW_A,
      tent_id: TENT_A,
    });
    const vpd = rows.find((row) => row.metric === "vpd_kpa")!;
    expect(vpd.raw_payload.vpd_source).toBe(origin);
    const before = JSON.stringify(rows);
    const snapshot = snapshotFor(rows);
    expect(snapshot.derivedVpdKpa).toBe(vpd.value);
    expect(snapshot.derivedVpdLabel).toBe(label);
    expect(snapshot.sourceLabel).toBe("CSV");
    expect(snapshot.capturedAt).toBe(capturedAt);
    render(<CsvTimelineEnvironmentChip diaryEntryId="origin" snapshot={snapshot} />);
    const chip = screen.getByTestId("csv-timeline-chip-origin");
    expect(chip.textContent).toContain(`${label}: ${vpd.value.toFixed(2)} kPa`);
    expect(chip.textContent).not.toContain(origin === "csv" ? "Derived VPD" : "CSV VPD");
    expect(chip.textContent?.toLowerCase()).not.toContain("live");
    expect(JSON.stringify(rows)).toBe(before);
  });

  it("uses the VPD metric's origin rather than another metric's metadata", () => {
    const snapshot = snapshotFor([
      {
        ...csvRow("temperature_c", 25, capturedAt),
        raw_payload: { grow_id: GROW_A, vpd_source: "csv" },
      },
      {
        ...csvRow("vpd_kpa", 1.42, capturedAt),
        raw_payload: { grow_id: GROW_A, vpd_source: "derived" },
      },
    ]);
    expect(snapshot.derivedVpdKpa).toBe(1.42);
    expect(snapshot.derivedVpdLabel).toBe("Derived VPD");
  });

  it.each(["csv", "derived"])(
    "keeps the label paired with the selected first VPD row (%s)",
    (origin) => {
      const rows = [
        {
          ...csvRow("vpd_kpa", 1.7, capturedAt),
          raw_payload: { grow_id: GROW_A, vpd_source: origin },
        },
        {
          ...csvRow("vpd_kpa", 1.42, capturedAt),
          raw_payload: { grow_id: GROW_A, vpd_source: origin === "csv" ? "derived" : "csv" },
        },
      ];
      const snapshot = snapshotFor(rows);
      expect(snapshot.derivedVpdKpa).toBe(1.7);
      expect(snapshot.derivedVpdLabel).toBe(origin === "csv" ? "CSV VPD" : "Derived VPD");
    },
  );

  it("ignores a closer CSV VPD from another tent or grow", () => {
    const rows = [
      {
        ...csvRow("vpd_kpa", 9, capturedAt, TENT_B),
        raw_payload: { grow_id: GROW_A, vpd_source: "csv" },
      },
      {
        ...csvRow("vpd_kpa", 8, capturedAt),
        raw_payload: { grow_id: "other-grow", vpd_source: "csv" },
      },
      {
        ...csvRow("vpd_kpa", 1.42, "2026-06-01T10:10:00Z"),
        raw_payload: { grow_id: GROW_A, vpd_source: "derived" },
      },
    ];
    const snapshot = snapshotFor(rows);
    expect(snapshot.derivedVpdKpa).toBe(1.42);
    expect(snapshot.derivedVpdLabel).toBe("Derived VPD");
    expect(snapshot.capturedAt).toBe("2026-06-01T10:10:00.000Z");
  });

  it("does not render a non-finite VPD even with CSV origin", () => {
    const snapshot = snapshotFor([
      {
        ...csvRow("vpd_kpa", Number.NaN, capturedAt),
        raw_payload: { grow_id: GROW_A, vpd_source: "csv" },
      },
    ]);
    expect(snapshot.derivedVpdKpa).toBeNull();
    const { container } = render(
      <CsvTimelineEnvironmentChip diaryEntryId="invalid-vpd" snapshot={snapshot} />,
    );
    expect(container.textContent).not.toContain("VPD");
    expect(container.textContent).not.toContain("NaN");
  });

  it("keeps provenance neutral when the matched group has no vpd_kpa row", () => {
    const snapshot = snapshotFor([
      csvRow("temperature_c", 25, capturedAt),
      csvRow("humidity_pct", 55, capturedAt),
    ]);
    expect(snapshot.derivedVpdKpa).toBeNull();
    expect(snapshot.derivedVpdLabel).toBe(CSV_UNKNOWN_VPD_LABEL);
  });

  it.each([
    { vpd_source: "CSV", why: "case-sensitive token" },
    { vpd_source: "live", why: "never relabel live telemetry as CSV VPD" },
    { vpd_source: undefined, why: "missing vpd_source metadata" },
  ])("keeps VPD neutral for invalid vpd_source ($why)", ({ vpd_source }) => {
    const snapshot = snapshotFor([
      {
        ...csvRow("vpd_kpa", 1.42, capturedAt),
        raw_payload: { grow_id: GROW_A, ...(vpd_source !== undefined ? { vpd_source } : {}) },
      },
    ]);
    expect(snapshot.derivedVpdKpa).toBe(1.42);
    expect(snapshot.derivedVpdLabel).toBe(CSV_UNKNOWN_VPD_LABEL);
  });

  it.each([null, "not-an-object", ["array"]])(
    "keeps VPD neutral when vpd_kpa raw_payload is %j",
    (raw_payload) => {
      const snapshot = snapshotFor([
        {
          ...csvRow("vpd_kpa", 1.42, capturedAt),
          raw_payload,
        },
      ]);
      expect(snapshot.derivedVpdLabel).toBe(CSV_UNKNOWN_VPD_LABEL);
    },
  );
});

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
    const entry = {
      id: "d1",
      grow_id: GROW_A,
      tent_id: TENT_A,
      occurred_at: "2026-06-01T10:00:00Z",
    };
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
    expect(out[0].snapshot!.derivedVpdLabel).toBe(CSV_UNKNOWN_VPD_LABEL);
    expect(out[0].matchAgeMinutes).toBe(20);
  });

  it("does not link reading outside window (test 34)", () => {
    const entry = {
      id: "d1",
      grow_id: GROW_A,
      tent_id: TENT_A,
      occurred_at: "2026-06-01T10:00:00Z",
    };
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
    const entry = {
      id: "d1",
      grow_id: GROW_A,
      tent_id: TENT_A,
      occurred_at: "2026-06-01T10:00:00Z",
    };
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
    const entry = {
      id: "d1",
      grow_id: GROW_A,
      tent_id: TENT_A,
      occurred_at: "2026-06-01T10:00:00Z",
    };
    const rows = [
      {
        tent_id: TENT_A,
        source: "ecowitt",
        metric: "temperature_c",
        value: 22,
        captured_at: "2026-06-01T10:05:00Z",
        raw_payload: { grow_id: GROW_A },
      },
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
    expect(screen.getByTestId("csv-timeline-chip-source-d1").textContent).toBe(CSV_SOURCE_LABEL);
    expect(screen.getByText(/Derived VPD/)).toBeTruthy();
  });

  it("chip renders supplied CSV VPD label from snapshot (not Derived VPD)", () => {
    render(
      <CsvTimelineEnvironmentChip
        diaryEntryId="supplied"
        snapshot={{
          capturedAt: "2026-06-01T10:00:00Z",
          temperatureC: 25,
          humidityPct: 55,
          derivedVpdKpa: 1.7,
          sourceLabel: CSV_SOURCE_LABEL,
          title: CSV_SNAPSHOT_TITLE,
          derivedVpdLabel: CSV_SUPPLIED_VPD_LABEL,
        }}
      />,
    );
    expect(screen.getByText(/CSV VPD/)).toBeTruthy();
    expect(screen.queryByText(/Derived VPD/)).toBeNull();
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
    const { container } = render(<CsvTimelineEnvironmentChip diaryEntryId="d1" snapshot={null} />);
    expect(container.firstChild).toBeNull();
  });
});

describe("CSV timeline VPD label contract", () => {
  it("exports distinct supplied vs derived labels and maps csv vpd_source to supplied", () => {
    expect(CSV_SUPPLIED_VPD_LABEL).toBe("CSV VPD");
    expect(CSV_DERIVED_VPD_LABEL).toBe("Derived VPD");
    expect(CSV_UNKNOWN_VPD_LABEL).toBe("VPD");
    expect(CSV_SUPPLIED_VPD_LABEL).not.toBe(CSV_DERIVED_VPD_LABEL);
    expect(CSV_SUPPLIED_VPD_LABEL).not.toBe(CSV_UNKNOWN_VPD_LABEL);

    const snapshot = buildCsvTimelineContext({
      diaryEntries: [
        { id: "contract", grow_id: GROW_A, tent_id: TENT_A, occurred_at: "2026-06-01T10:00:00Z" },
      ],
      sensorReadings: [
        {
          ...csvRow("vpd_kpa", 1.7, "2026-06-01T10:00:00Z"),
          raw_payload: { grow_id: GROW_A, vpd_source: "csv" },
        },
      ],
      growId: GROW_A,
      tentId: TENT_A,
    })[0].snapshot!;

    expect(snapshot.derivedVpdLabel).toBe(CSV_SUPPLIED_VPD_LABEL);
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
      expect(src).not.toMatch(new RegExp("switch" + "bot", "i"));
      expect(src).not.toMatch(/device.?control/i);
      expect(src).not.toMatch(/automation/i);
      // "Live" must not appear except inside a comment forbidding it
      const noComments = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(noComments.toLowerCase()).not.toMatch(/"live"|'live'|live vpd/);
    }
  });
});
