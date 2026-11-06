/**
 * A limit, alarm, alert, threshold or trigger column records a configured
 * boundary, not what a sensor measured. CSV import must never save one as a
 * reading, whatever its position in the file (follow-up to #2908, 2026-11-06).
 * Aggregate readings (min, max, avg) stay importable.
 */
import { describe, expect, it } from "vitest";
import { parseEnvironmentCSVText } from "@/lib/csvParser";

const TS = "2026-11-01T12:00:00Z";

function parse(headers: string[], values: string[]) {
  return parseEnvironmentCSVText(`timestamp,${headers.join(",")}\n${TS},${values.join(",")}`, {
    sourceTimeZone: "UTC",
  });
}

type Field =
  | "temperature_c"
  | "humidity_pct"
  | "vpd_kpa"
  | "co2_ppm"
  | "ppfd"
  | "soil_temp_c"
  | "soil_moisture_pct"
  | "soil_ec";

const AIR: [string, string] = ["temperature_c", "24"];

// [limit header, limit value, observed header, field, observed value, companion?]
const CASES: Array<[string, string, string, Field, number, [string, string]?]> = [
  ["temperature_alarm_high_c", "30", "temperature_c", "temperature_c", 24],
  ["humidity_high_limit", "70", "humidity", "humidity_pct", 50, AIR],
  ["Humidity Low Limit", "40", "humidity", "humidity_pct", 50, AIR],
  ["humidity_alarm_high", "70", "humidity", "humidity_pct", 50, AIR],
  ["humidity_threshold", "70", "humidity", "humidity_pct", 50, AIR],
  ["RH Alert (%)", "70", "RH (%)", "humidity_pct", 50, AIR],
  ["vpd_trigger", "1.6", "vpd", "vpd_kpa", 0.9, AIR],
  ["VPD Max Limit (kPa)", "1.6", "VPD (kPa)", "vpd_kpa", 0.9, AIR],
  ["co2_alert", "1500", "co2", "co2_ppm", 800, AIR],
  ["CO2 Alarm Threshold", "1500", "CO2 (ppm)", "co2_ppm", 800, AIR],
  ["ppfd_low_alert", "200", "ppfd", "ppfd", 900, AIR],
  ["PAR Trigger", "200", "PAR", "ppfd", 900, AIR],
  ["soil_temp_alarm_c", "30", "soil_temp_c", "soil_temp_c", 20],
  ["soil_moisture_low_limit", "20", "soil_moisture_pct", "soil_moisture_pct", 35],
  ["soil_ec_high_limit", "3.0", "soil_ec", "soil_ec", 1.4],
  ["Soil EC Threshold", "3.0", "Soil EC", "soil_ec", 1.4],
];

describe("CSV limit, alarm and threshold columns are never readings", () => {
  it.each(CASES)(
    "%s before the reading saves the observation",
    (limit, lv, observed, field, ov, companion) => {
      const cols: [string, string][] = [
        ...(companion ? [companion] : []),
        [limit, lv],
        [observed, String(ov)],
      ];
      const r = parse(
        cols.map((c) => c[0]),
        cols.map((c) => c[1]),
      );
      expect(r.validRows).toHaveLength(1);
      expect(r.validRows[0][field]).toBe(ov);
      expect(r.unsupportedColumns).toContain(limit);
      expect(r.unsupportedColumns).not.toContain(observed);
    },
  );

  it.each(CASES)(
    "%s after the reading saves the observation",
    (limit, lv, observed, field, ov, companion) => {
      const cols: [string, string][] = [
        ...(companion ? [companion] : []),
        [observed, String(ov)],
        [limit, lv],
      ];
      const r = parse(
        cols.map((c) => c[0]),
        cols.map((c) => c[1]),
      );
      expect(r.validRows[0][field]).toBe(ov);
      expect(r.unsupportedColumns).toContain(limit);
    },
  );

  it("an air temperature limit never wins the °C preference", () => {
    const r = parse(["temp_high_limit_c", "temperature_f"], ["30", "75"]);
    // 75 °F from the real reading, not the 30 °C limit.
    expect(r.validRows[0].temperature_c).toBeCloseTo(23.89, 2);
    expect(r.unsupportedColumns).toContain("temp_high_limit_c");
  });

  it("a limit-only column saves no reading for that metric", () => {
    const r = parse(["temperature_c", "humidity_high_limit"], ["24", "70"]);
    expect(r.validRows[0].humidity_pct ?? null).toBeNull();
    expect(r.unsupportedColumns).toEqual(["humidity_high_limit"]);
  });

  it("a soil limit-only file is refused, never saved as a reading", () => {
    const r = parse(["soil_temp_alarm_c"], ["30"]);
    expect(r.validRows).toHaveLength(0);
    expect(r.errors.length).toBeGreaterThan(0);
  });

  // Aggregates may be real readings: they stay importable (acceptance 3).
  it.each<[string, Field, number]>([
    ["humidity_max", "humidity_pct", 70],
    ["humidity_min", "humidity_pct", 40],
    ["humidity_avg", "humidity_pct", 55],
    ["Max Humidity", "humidity_pct", 70],
    ["Average Humidity", "humidity_pct", 55],
    ["co2_avg", "co2_ppm", 800],
    ["VPD Max (kPa)", "vpd_kpa", 1.2],
    ["PPFD Avg", "ppfd", 900],
  ])("aggregate %s still imports", (h, field, v) => {
    const r = parse(["temperature_c", h], ["24", String(v)]);
    expect(r.validRows[0][field]).toBe(v);
    expect(r.unsupportedColumns).toEqual([]);
  });

  it.each<[string, string]>([
    ["Temp Max (C)", "temperature_c"],
    ["Soil Temp Min (C)", "soil_temp_c"],
  ])("aggregate %s still imports", (h, field) => {
    const r = parse([h], ["22"]);
    expect(r.validRows[0][field as Field]).toBe(22);
    expect(r.unsupportedColumns).toEqual([]);
  });

  // Ordinary reading headers that share letters with the new words.
  it.each<[string, Field, number]>([
    ["Humidity (%)", "humidity_pct", 50],
    ["RH Sensor 2", "humidity_pct", 50],
    ["Indoor Humidity(%)", "humidity_pct", 50],
    ["CO2 Level", "co2_ppm", 800],
    ["VPD (kPa)", "vpd_kpa", 1.1],
    ["PPFD Sensor", "ppfd", 900],
    ["PAR (umol)", "ppfd", 900],
    ["Soil Moisture (%)", "soil_moisture_pct", 35],
    ["Soil EC (mS/cm)", "soil_ec", 1.4],
  ])("reading header %s still imports", (h, field, v) => {
    const r = parse(["temperature_c", h], ["24", String(v)]);
    expect(r.validRows[0][field]).toBe(v);
    expect(r.unsupportedColumns).toEqual([]);
  });

  it.each(["Dew Point", "Light Intensity", "Leaf Temp Delta"])(
    "%s is not mistaken for a limit",
    (h) => {
      const r = parse(["temperature_c", h], ["24", "12"]);
      expect(r.unsupportedColumns).not.toContain(h);
    },
  );
});
