/**
 * A target, setpoint or goal column says what the grower wants, not what a
 * sensor measured. CSV import must never save one as a reading, whatever its
 * position in the file (regression for the #2902 soil mapping, 2026-11-05).
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
  "soil_temp_c" | "soil_moisture_pct" | "soil_ec" | "humidity_pct" | "vpd_kpa" | "co2_ppm";

const CASES: Array<{
  label: string;
  field: Field;
  observed: [string, string];
  target: [string, string];
  /** Air metrics need a companion column so the file has a reading at all. */
  companion?: [string, string];
}> = [
  {
    label: "soil temperature",
    field: "soil_temp_c",
    observed: ["soil_temp_c", "20"],
    target: ["soil_temp_target_c", "30"],
  },
  {
    label: "soil moisture",
    field: "soil_moisture_pct",
    observed: ["soil_moisture_pct", "30"],
    target: ["soil_moisture_target_pct", "45"],
  },
  {
    label: "soil EC",
    field: "soil_ec",
    observed: ["soil_ec", "1.4"],
    target: ["soil_ec_setpoint", "2.2"],
  },
  {
    label: "air humidity",
    field: "humidity_pct",
    observed: ["humidity", "50"],
    target: ["humidity_target", "60"],
    companion: ["temperature_c", "24"],
  },
  {
    label: "air VPD",
    field: "vpd_kpa",
    observed: ["vpd", "0.9"],
    target: ["vpd_target", "1.2"],
    companion: ["temperature_c", "24"],
  },
  {
    label: "air CO₂",
    field: "co2_ppm",
    observed: ["co2", "800"],
    target: ["co2_setpoint", "1200"],
    companion: ["temperature_c", "24"],
  },
];

describe("CSV target/setpoint columns are never readings", () => {
  for (const c of CASES) {
    const extra = c.companion ? [c.companion] : [];
    const observedValue = Number(c.observed[1]);

    it(`${c.label}: target before observation saves the observation`, () => {
      const cols = [...extra, c.target, c.observed];
      const r = parse(
        cols.map((x) => x[0]),
        cols.map((x) => x[1]),
      );
      expect(r.validRows).toHaveLength(1);
      expect(r.validRows[0][c.field]).toBe(observedValue);
      expect(r.unsupportedColumns).toContain(c.target[0]);
      expect(r.unsupportedColumns).not.toContain(c.observed[0]);
    });

    it(`${c.label}: observation before target saves the observation`, () => {
      const cols = [...extra, c.observed, c.target];
      const r = parse(
        cols.map((x) => x[0]),
        cols.map((x) => x[1]),
      );
      expect(r.validRows).toHaveLength(1);
      expect(r.validRows[0][c.field]).toBe(observedValue);
      expect(r.unsupportedColumns).toContain(c.target[0]);
    });

    it(`${c.label}: a target-only column saves no reading for that metric`, () => {
      const cols = [...extra, c.target];
      const r = parse(
        cols.map((x) => x[0]),
        cols.map((x) => x[1]),
      );
      for (const row of r.validRows) expect(row[c.field] ?? null).toBeNull();
      expect(r.unsupportedColumns).toContain(c.target[0]);
    });
  }

  it("a soil target-only file is refused, never saved as a reading", () => {
    const r = parse(["soil_temp_target_c"], ["30"]);
    expect(r.validRows).toHaveLength(0);
    expect(r.errors.length).toBeGreaterThan(0);
  });

  it("an air target-only file does not claim to be soil-only", () => {
    const r = parse(["humidity_target"], ["60"]);
    expect(r.validRows).toHaveLength(0);
    expect(r.errors.map((e) => e.message).join(" ")).not.toMatch(/soil readings only/);
  });

  it.each(["Set Point Humidity", "rh_sp", "CO2 Goal", "Target VPD (kPa)"])(
    "header %s is treated as a target",
    (h) => {
      const r = parse(["temperature_c", h], ["24", "1"]);
      expect(r.unsupportedColumns).toContain(h);
      expect(r.validRows[0].humidity_pct ?? null).toBeNull();
      expect(r.validRows[0].vpd_kpa ?? null).toBeNull();
      expect(r.validRows[0].co2_ppm ?? null).toBeNull();
    },
  );

  it("ordinary readings with similar letters are still imported", () => {
    const r = parse(["temperature_c", "humidity_pct", "co2_ppm"], ["24", "50", "800"]);
    expect(r.validRows[0]).toMatchObject({ humidity_pct: 50, co2_ppm: 800 });
    expect(r.unsupportedColumns).toEqual([]);
  });
});
