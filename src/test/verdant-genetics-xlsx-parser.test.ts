import { describe, it, expect } from "vitest";
import {
  parseVerdantGeneticsXlsx,
  VERDANT_GENETICS_SOURCE_APP,
  VERDANT_GENETICS_SOURCE_TAG,
  type CellGrid,
} from "@/lib/verdantGeneticsXlsxParser";

/**
 * Verdant Genetics XLSX fixture builder.
 *
 * Mirrors the observed multi-tent export shape:
 *   row 1 = sensor group / location (merged across each group's columns)
 *   row 2 = metric label
 *   row 3+ = readings (timestamp in column 0)
 *
 * Default fixture covers 55 readings on 4-hour intervals from
 * 2026-06-04T03:00:00Z through 2026-06-13T03:00:00Z, across the same
 * groups documented in the task: Flower Tent, Pressure, Flower Tent
 * (secondary block), Seedling Tent, Vegetation Tent, Vegetation Soil,
 * Flower Soil 1, Flower Soil 2, Soil Temperature Flower, Battery.
 */
function buildFixture(opts?: {
  rows?: number;
  startIso?: string;
  intervalHours?: number;
  seedlingHighRhRows?: number[];
  suspiciousSoilZero?: number;
  suspiciousSoilFull?: number;
  blankCellsAt?: Array<{ row: number; col: number }>;
}): CellGrid {
  const rows = opts?.rows ?? 55;
  const startMs = Date.parse(opts?.startIso ?? "2026-06-04T03:00:00Z");
  const intervalMs = (opts?.intervalHours ?? 4) * 60 * 60 * 1000;

  // Column layout (group, metric, unit hint)
  const cols: Array<{ group: string; label: string }> = [
    { group: "", label: "Timestamp" },
    { group: "Flower Tent", label: "Temperature °F" },
    { group: "Flower Tent", label: "Humidity %" },
    { group: "Pressure", label: "Pressure inHg" }, // unsupported
    { group: "Flower Tent", label: "Temperature °F" }, // secondary block
    { group: "Flower Tent", label: "Humidity %" },
    { group: "Seedling Tent", label: "Temperature °F" },
    { group: "Seedling Tent", label: "Humidity %" },
    { group: "Vegetation Tent", label: "Temperature °F" },
    { group: "Vegetation Tent", label: "Humidity %" },
    { group: "Vegetation Soil", label: "Soil Moisture %" },
    { group: "Vegetation Soil", label: "AD" }, // preserved only
    { group: "Flower Soil 1", label: "Soil Moisture %" },
    { group: "Flower Soil 2", label: "Soil Moisture %" },
    { group: "Soil Temperature Flower", label: "Soil Temp °F" }, // unsupported (no soil_temp_c metric in scope)
    { group: "Battery", label: "Battery Voltage" }, // preserved only
  ];

  const headerGroup: string[] = [];
  const headerMetric: string[] = [];
  // Forward-fill: a real XLSX would have merged cells; we emit the group
  // only on its first column and leave the rest blank to exercise the
  // forward-fill code path.
  let prevGroup = "";
  for (const c of cols) {
    if (c.group !== prevGroup) {
      headerGroup.push(c.group);
      prevGroup = c.group;
    } else {
      headerGroup.push("");
    }
    headerMetric.push(c.label);
  }

  const grid: unknown[][] = [headerGroup, headerMetric];

  for (let r = 0; r < rows; r++) {
    const ts = new Date(startMs + r * intervalMs).toISOString();
    // Deterministic, realistic values.
    const flowerF = 78 + (r % 5); // 78..82°F
    const flowerRh = 55 + (r % 7); // 55..61%
    const seedlingF = 75 + (r % 3);
    const seedlingRh = opts?.seedlingHighRhRows?.includes(r)
      ? 94 + (r % 4)
      : 60 + (r % 8);
    const vegF = 76 + (r % 4);
    const vegRh = 58 + (r % 6);
    const vegSoil = r === opts?.suspiciousSoilZero ? 0
      : r === opts?.suspiciousSoilFull ? 100
      : 45 + (r % 10);
    const flowerSoil1 = 40 + (r % 12);
    const flowerSoil2 = 42 + (r % 11);
    const soilTempF = 70 + (r % 4);
    const batteryV = 3.2 + (r % 3) * 0.1;
    const adRaw = 1024 + (r % 50);
    const pressure = 29.8 + (r % 3) * 0.05;

    const row: unknown[] = [
      ts,
      flowerF,
      flowerRh,
      pressure,
      flowerF,
      flowerRh,
      seedlingF,
      seedlingRh,
      vegF,
      vegRh,
      vegSoil,
      adRaw,
      flowerSoil1,
      flowerSoil2,
      soilTempF,
      batteryV,
    ];
    grid.push(row);
  }

  // Apply blank/`-` cells.
  for (const cell of opts?.blankCellsAt ?? []) {
    if (grid[cell.row]) grid[cell.row][cell.col] = "-";
  }
  return grid as CellGrid;
}

describe("verdantGeneticsXlsxParser — preview adapter", () => {
  it("parses the multi-row header fixture and detects all expected groups", () => {
    const grid = buildFixture();
    const res = parseVerdantGeneticsXlsx(grid);
    const groups = new Set(res.summary.detected_groups);
    for (const g of [
      "Flower Tent",
      "Seedling Tent",
      "Vegetation Tent",
      "Vegetation Soil",
      "Flower Soil 1",
      "Flower Soil 2",
    ]) {
      expect(groups.has(g)).toBe(true);
    }
  });

  it("produces 55 timestamped reading groups across the expected window", () => {
    const res = parseVerdantGeneticsXlsx(buildFixture());
    expect(res.summary.reading_group_count).toBe(55);
    expect(res.summary.date_range).toEqual({
      start: "2026-06-04T03:00:00.000Z",
      end: "2026-06-13T03:00:00.000Z",
    });
  });

  it("maps Flower Tent temperature → temperature_c with °F→°C conversion", () => {
    const res = parseVerdantGeneticsXlsx(buildFixture());
    const tempRow = res.rows.find(
      (r) => r.sensor_group === "Flower Tent" && r.metric === "temperature_c",
    );
    expect(tempRow).toBeDefined();
    // 78°F → ~25.555°C
    expect(tempRow!.value).toBeGreaterThan(25.4);
    expect(tempRow!.value).toBeLessThan(28.5);
    expect(tempRow!.raw_payload.original_unit).toBe("F");
    expect(tempRow!.raw_payload.original_value).toBe(78);
    expect(tempRow!.raw_payload.source_app).toBe(VERDANT_GENETICS_SOURCE_APP);
    expect(tempRow!.raw_payload.sensor_group).toBe("Flower Tent");
    expect(tempRow!.raw_payload.original_metric_label).toMatch(/Temperature/);
  });

  it("maps Flower Tent humidity → humidity_pct", () => {
    const res = parseVerdantGeneticsXlsx(buildFixture());
    const rh = res.rows.find(
      (r) => r.sensor_group === "Flower Tent" && r.metric === "humidity_pct",
    );
    expect(rh).toBeDefined();
    expect(rh!.value).toBeGreaterThanOrEqual(55);
    expect(rh!.value).toBeLessThanOrEqual(61);
  });

  it("calculates VPD from temp + RH and tags it as calculated", () => {
    const res = parseVerdantGeneticsXlsx(buildFixture());
    const vpd = res.rows.find(
      (r) => r.sensor_group === "Flower Tent" && r.metric === "vpd_kpa",
    );
    expect(vpd).toBeDefined();
    expect(vpd!.calculated).toBe(true);
    expect(vpd!.raw_payload.calculated).toBe(true);
    expect(vpd!.value).toBeGreaterThan(0.5);
    expect(vpd!.value).toBeLessThan(2.5);
  });

  it("maps soil moisture columns → soil_moisture_pct", () => {
    const res = parseVerdantGeneticsXlsx(buildFixture());
    const groups = new Set(
      res.rows
        .filter((r) => r.metric === "soil_moisture_pct")
        .map((r) => r.sensor_group),
    );
    expect(groups.has("Vegetation Soil")).toBe(true);
    expect(groups.has("Flower Soil 1")).toBe(true);
    expect(groups.has("Flower Soil 2")).toBe(true);
  });

  it("does not emit metrics for `-` cells", () => {
    const grid = buildFixture({
      blankCellsAt: [
        { row: 2, col: 1 }, // Flower Tent temp on first data row
        { row: 2, col: 2 }, // Flower Tent humidity on first data row
      ],
    });
    const res = parseVerdantGeneticsXlsx(grid);
    const firstTs = "2026-06-04T03:00:00.000Z";
    const flowerAtFirst = res.rows.filter(
      (r) =>
        r.sensor_group === "Flower Tent" &&
        r.captured_at === firstTs &&
        (r.metric === "temperature_c" || r.metric === "humidity_pct"),
    );
    // Secondary Flower Tent block (cols 4/5) still has values, but col 1/2
    // blanks must not emit duplicates from those cells.
    // We assert no duplicate metric (max 1 row per metric for the group).
    const temps = flowerAtFirst.filter((r) => r.metric === "temperature_c");
    const rhs = flowerAtFirst.filter((r) => r.metric === "humidity_pct");
    expect(temps.length).toBeLessThanOrEqual(1);
    expect(rhs.length).toBeLessThanOrEqual(1);
  });

  it("flags soil moisture 0/100 as suspicious", () => {
    const grid = buildFixture({
      suspiciousSoilZero: 1,
      suspiciousSoilFull: 2,
    });
    const res = parseVerdantGeneticsXlsx(grid);
    const kinds = res.suspicious.map((s) => s.kind);
    expect(kinds).toContain("soil_moisture_stuck_zero");
    expect(kinds).toContain("soil_moisture_stuck_full");
  });

  it("flags Seedling Tent RH 94–97% as high-RH watch items", () => {
    const grid = buildFixture({ seedlingHighRhRows: [3, 7, 11] });
    const res = parseVerdantGeneticsXlsx(grid);
    const highRh = res.suspicious.filter(
      (s) => s.kind === "high_rh_watch" && s.sensor_group === "Seedling Tent",
    );
    expect(highRh.length).toBeGreaterThanOrEqual(3);
    for (const s of highRh) {
      expect(s.value!).toBeGreaterThanOrEqual(94);
      expect(s.value!).toBeLessThanOrEqual(97);
    }
  });

  it("emits source = 'csv' on every row and never 'live'", () => {
    const res = parseVerdantGeneticsXlsx(buildFixture());
    expect(res.rows.length).toBeGreaterThan(0);
    for (const row of res.rows) {
      expect(row.source).toBe(VERDANT_GENETICS_SOURCE_TAG);
      expect(row.source).toBe("csv");
      expect(row.raw_payload.csv_import).toBe(true);
      expect(row.raw_payload.source_app).toBe("verdant_genetics_xlsx");
    }
    expect(res.summary.recommended_source).toBe("csv");
  });

  it("preserves sensor group + original metric label in raw payload", () => {
    const res = parseVerdantGeneticsXlsx(buildFixture());
    for (const row of res.rows.slice(0, 20)) {
      expect(row.raw_payload.sensor_group).toBe(row.sensor_group);
      expect(typeof row.raw_payload.original_metric_label).toBe("string");
      expect(row.raw_payload.original_metric_label.length).toBeGreaterThan(0);
    }
  });

  it("rejects unsupported and preserve-only columns into rejected[]", () => {
    const res = parseVerdantGeneticsXlsx(buildFixture());
    const reasons = new Set(res.rejected.map((r) => r.reason));
    expect(reasons.has("battery_preserved_in_raw")).toBe(true);
    expect(reasons.has("ad_preserved_in_raw")).toBe(true);
    expect(reasons.has("unsupported_metric")).toBe(true); // Pressure, Soil Temp °F
    expect(res.summary.rejected_metric_count).toBe(res.rejected.length);
  });

  it("preserves battery voltage in raw payload extras only", () => {
    const res = parseVerdantGeneticsXlsx(buildFixture());
    // Battery is its own group, so it won't fold into another group's row.
    // Confirm no metric row was emitted for the Battery group.
    const batteryMetricRows = res.rows.filter(
      (r) => r.sensor_group === "Battery",
    );
    expect(batteryMetricRows.length).toBe(0);
    // And confirm the Battery column is rejected as battery_preserved_in_raw.
    expect(
      res.rejected.some((r) => r.reason === "battery_preserved_in_raw"),
    ).toBe(true);
  });

  it("returns row-per-metric shape compatible with future sensor_readings inserts", () => {
    const res = parseVerdantGeneticsXlsx(buildFixture());
    for (const row of res.rows.slice(0, 5)) {
      expect(row).toEqual(
        expect.objectContaining({
          captured_at: expect.any(String),
          sensor_group: expect.any(String),
          metric: expect.stringMatching(
            /^(temperature_c|humidity_pct|vpd_kpa|soil_moisture_pct)$/,
          ),
          value: expect.any(Number),
          calculated: expect.any(Boolean),
          source: "csv",
        }),
      );
    }
  });
});
