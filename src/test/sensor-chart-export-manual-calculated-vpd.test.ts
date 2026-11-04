/**
 * Issue #2797: the VPD chart export dropped manual temperature/humidity points
 * (they are calculated chart points) and no export ever carried a calculated
 * VPD. "VPD (kPa)" stays observed-only; "Calculated VPD (kPa)" holds the value
 * derived from temperature and humidity.
 */
import { describe, expect, it } from "vitest";
import { buildSensorReadingsCsv, SensorCalculatedVpdExport } from "@/lib/sensorChartExport";
import { LatestVpdReadingSelection } from "@/lib/latestVpdReadingSelection";
import { calculateVPD } from "@/lib/sensors/calculateVPD";
import type { SensorReading } from "@/mock";

const TENT = "11111111-1111-4111-8111-111111111111";
const EXPORT_AT = Date.parse("2026-11-03T12:00:00.000Z");

function row(
  partial: Partial<SensorReading> & Pick<SensorReading, "source" | "capturedAt">,
): SensorReading {
  return {
    tentId: TENT,
    status: "usable",
    ts: partial.capturedAt,
    temp: 24,
    rh: 50,
    vpd: 0,
    co2: 0,
    soil: 0,
    observedMetrics: ["temp", "rh"],
    ...partial,
  };
}

const csvRows = [
  row({
    source: "csv",
    status: "stale",
    capturedAt: "2026-10-20T12:00:00.000Z",
    vpd: 0.84,
    observedMetrics: ["temp", "rh", "vpd"],
  }),
  row({
    source: "csv",
    status: "stale",
    capturedAt: "2026-10-21T12:00:00.000Z",
    vpd: 0.9,
    observedMetrics: ["temp", "rh", "vpd"],
  }),
];

const manualRows = [
  row({ source: "manual", capturedAt: "2026-11-03T11:00:00.000Z", temp: 23.89, rh: 57 }),
  row({ source: "manual", capturedAt: "2026-11-03T11:30:00.000Z", temp: 22.22, rh: 60 }),
];

function parse(csv: string) {
  const [header, ...lines] = csv.split("\n");
  const columns = header.split(",");
  const index = (name: string) => columns.indexOf(name);
  return {
    columns,
    index,
    rows: lines.map((line) => line.split(",")),
  };
}

describe("VPD export with manual temperature/humidity points (#2797)", () => {
  const series = LatestVpdReadingSelection.historyForChart(csvRows, manualRows);
  const parsed = parse(buildSensorReadingsCsv(series, EXPORT_AT));
  const source = parsed.index("Source");
  const vpd = parsed.index("VPD (kPa)");
  const calculated = parsed.index("Calculated VPD (kPa)");

  it("places the calculated column right after the observed VPD column", () => {
    expect(vpd).toBeGreaterThan(-1);
    expect(calculated).toBe(vpd + 1);
  });

  it("exports the manual rows with their real source and a blank observed VPD", () => {
    const manual = parsed.rows.filter((cells) => cells[source] === "manual");
    expect(manual).toHaveLength(2);
    for (const cells of manual) expect(cells[vpd]).toBe("");
  });

  it("fills the calculated VPD for each manual row from temperature and humidity", () => {
    const manual = parsed.rows.filter((cells) => cells[source] === "manual");
    const values = manual
      .map((cells) => [Number(cells[parsed.index("Temperature (°C)")]), cells[calculated]] as const)
      .sort((a, b) => b[0] - a[0]);
    expect(values[0][0]).toBeCloseTo(23.89, 2);
    expect(Number(values[0][1])).toBeCloseTo(calculateVPD(23.89, 57)!, 2);
    expect(Number(values[1][1])).toBeCloseTo(calculateVPD(22.22, 60)!, 2);
    for (const [, value] of values) expect(value).not.toBe("");
  });

  it("keeps recorded csv rows observed, with supplied status and no calculated value", () => {
    const recorded = parsed.rows.filter((cells) => cells[source] === "csv");
    expect(recorded).toHaveLength(2);
    expect(recorded.map((cells) => cells[vpd]).sort()).toEqual(["0.84", "0.9"]);
    for (const cells of recorded) {
      expect(cells[calculated]).toBe("");
      expect(cells[parsed.index("Status")]).toBe("stale");
    }
  });
});

describe("temperature/humidity export calculated column (#2797)", () => {
  it("fills the calculated column for a row without an observed VPD", () => {
    const parsed = parse(buildSensorReadingsCsv(manualRows, EXPORT_AT));
    const vpd = parsed.index("VPD (kPa)");
    const calculated = parsed.index("Calculated VPD (kPa)");
    expect(parsed.rows).toHaveLength(2);
    for (const cells of parsed.rows) {
      expect(cells[vpd]).toBe("");
      expect(cells[calculated]).not.toBe("");
    }
  });

  it("uses the stored Celsius value in the Fahrenheit export too", () => {
    const parsed = parse(buildSensorReadingsCsv([manualRows[0]], EXPORT_AT, "F"));
    expect(parsed.columns).toContain("Temperature (°F)");
    const cells = parsed.rows[0];
    expect(Number(cells[parsed.index("Calculated VPD (kPa)")])).toBeCloseTo(
      calculateVPD(23.89, 57)!,
      2,
    );
  });

  it("leaves the calculated value blank when VPD was observed or an input is missing", () => {
    expect(SensorCalculatedVpdExport.kpa(csvRows[0])).toBeNull();
    expect(
      SensorCalculatedVpdExport.kpa(
        row({
          source: "manual",
          capturedAt: "2026-11-03T11:00:00.000Z",
          observedMetrics: ["temp"],
        }),
      ),
    ).toBeNull();
  });
});
