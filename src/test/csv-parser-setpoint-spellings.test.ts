/**
 * Abbreviated setpoint and wanted-value spellings are never saved as readings
 * (independent review of #2908 at 360ab4dd: P2 and P3). Each case puts the
 * wanted value before the real reading, the order that used to save it.
 */
import { describe, expect, it } from "vitest";
import { parseEnvironmentCSVText } from "@/lib/csvParser";

const TS = "2026-11-01T12:00:00Z";

function parse(headers: string[], values: string[]) {
  return parseEnvironmentCSVText(`timestamp,${headers.join(",")}\n${TS},${values.join(",")}`, {
    sourceTimeZone: "UTC",
  });
}

type Field = "soil_temp_c" | "soil_moisture_pct" | "humidity_pct" | "co2_ppm";

describe("CSV setpoint spellings are never readings", () => {
  it.each<[string, string, string, Field, number]>([
    ["Soil Temp Set Pt (C)", "30", "soil_temp_c", "soil_temp_c", 20],
    ["soil_moisture_set", "45", "soil_moisture_pct", "soil_moisture_pct", 30],
    ["CO2 SetPt", "1200", "co2", "co2_ppm", 800],
    ["humidity_setpt", "70", "humidity", "humidity_pct", 50],
    ["Humidity Set Pt", "70", "humidity", "humidity_pct", 50],
    ["Humidity S.P.", "70", "humidity", "humidity_pct", 50],
    ["rh_set", "70", "humidity", "humidity_pct", 50],
    ["Humidity Set", "70", "humidity", "humidity_pct", 50],
    ["Humidity Setting", "70", "humidity", "humidity_pct", 50],
    ["humidity_tgt", "70", "humidity", "humidity_pct", 50],
    ["humidity_desired", "70", "humidity", "humidity_pct", 50],
    ["humidity_ideal", "70", "humidity", "humidity_pct", 50],
  ])("%s before the reading is never saved", (target, tv, observed, field, ov) => {
    const r = parse(["temperature_c", target, observed], ["24", tv, String(ov)]);
    expect(r.validRows[0][field]).toBe(ov);
    expect(r.unsupportedColumns).toContain(target);
    expect(r.unsupportedColumns).not.toContain(observed);
  });

  it("an air temperature setpoint never wins the °C preference", () => {
    const r = parse(["temp_setpt_c", "temperature_f"], ["30", "75"]);
    // 75 °F from the real reading, not the 30 °C setpoint.
    expect(r.validRows[0].temperature_c).toBeCloseTo(23.89, 2);
    expect(r.unsupportedColumns).toContain("temp_setpt_c");
  });

  // Fails safe by design: an "SP1"-style column is ambiguous, so it is set
  // aside (listed as not imported) rather than risk saving a setpoint.
  it.each(["sp1_humidity", "Humidity SP1"])("ambiguous %s is set aside, not misread", (h) => {
    const r = parse(["temperature_c", h], ["24", "70"]);
    expect(r.unsupportedColumns).toContain(h);
    expect(r.validRows[0].humidity_pct ?? null).toBeNull();
  });

  it.each([
    "Humidity (%)",
    "RH",
    "Indoor Humidity(%)",
    "Sensor Humidity",
    "Space Humidity",
    "Average Humidity",
    "RH Sensor 2",
  ])("reading header %s still imports", (h) => {
    const r = parse(["temperature_c", h], ["24", "50"]);
    expect(r.validRows[0].humidity_pct).toBe(50);
    expect(r.unsupportedColumns).toEqual([]);
  });

  it.each(["CO2 Level", "Respiration CO2"])("reading header %s still imports", (h) => {
    const r = parse(["temperature_c", h], ["24", "800"]);
    expect(r.validRows[0].co2_ppm).toBe(800);
    expect(r.unsupportedColumns).toEqual([]);
  });

  it("Dew Point is not mistaken for a setpoint", () => {
    const r = parse(["temperature_c", "Dew Point"], ["24", "12"]);
    expect(r.unsupportedColumns).not.toContain("Dew Point");
  });
});
