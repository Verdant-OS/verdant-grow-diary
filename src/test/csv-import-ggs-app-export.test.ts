/**
 * Spider Farmer GGS app export dialect (#3096): Time holds a full datetime,
 * Humi / HumiSoil / EcSoil map to air and soil metrics, and a hashed filename
 * still identifies spider_farmer from the header signature.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CsvImportVendorIdentity } from "@/lib/csvImportVendorIdentity";
import {
  CSV_SOURCE_TAG,
  parseEnvironmentCSV,
  parseEnvironmentCSVText,
} from "@/lib/csvParser";
import {
  buildSensorReadingInserts,
  CSV_SENSOR_SOURCE,
  CSV_SOIL_EC_UNIT_ASSUMED,
  CSV_SOIL_MOISTURE_BASIS,
} from "@/lib/environmentCsvImportPersistence";

const ROOT = resolve(__dirname, "../..");
const read = (name: string) => readFileSync(resolve(ROOT, "fixtures/sensor-csv", name), "utf8");

const CHICAGO = { sourceTimeZone: "America/Chicago" } as const;
const SCOPE = { user_id: "u1", grow_id: "g1", tent_id: "t1", plant_id: null };

const AIR = read("ggs_app_export_air_only.csv");
const TENT_A = read("ggs_app_export_air_soil_tent_a.csv");
const TENT_B = read("ggs_app_export_air_soil_tent_b.csv");
const SOIL = read("ggs_app_export_soil_only.csv");

const DIALECT_2902 =
  "deviceSerialnum,temperature(°C),humidity,vpd,temperature(°F),co2,Timestamp,temperature_soil_f(°F),temperature_soil(°C),humidity_soil,ec_soil,ppfd\n" +
  "80F1B2B452B8,25.7,52.4,1.57,78.3,775,2026-05-31 19:00:00,70.0,21.1,68.1,1.20,925\n";

describe("GGS app export CSV", () => {
  it("treats a lone Time datetime as the observation timestamp", () => {
    const unzoned = parseEnvironmentCSVText(AIR);
    expect(unzoned.errors).toEqual([]);
    expect(unzoned.validRows).toEqual([]);
    expect(unzoned.unresolvedTimeRows).toHaveLength(7);
    expect(unzoned.unresolvedTimeRows?.every((row) => row.reason === "needs_source_time_zone")).toBe(
      true,
    );

    const parsed = parseEnvironmentCSVText(AIR, CHICAGO);
    expect(parsed.errors).toEqual([]);
    expect(parsed.validRows[0].captured_at).toBe("2026-11-18T00:12:25.000Z");
    expect(parsed.validRows[0].time_provenance?.source_time_zone).toBe("America/Chicago");
    expect(parsed.validRows.at(-1)?.captured_at).toBe("2026-11-14T00:26:04.000Z");
  });

  it("accepts a T-separated Time cell the same way", () => {
    const csv = "Time,Temp(F),Humi\n2026-11-17T18:12:25,73.76,53.30\n";
    const parsed = parseEnvironmentCSVText(csv, CHICAGO);
    expect(parsed.errors).toEqual([]);
    expect(parsed.validRows[0].captured_at).toBe("2026-11-18T00:12:25.000Z");
  });

  it("keeps Date + Time split files combined", () => {
    const csv = "Date,Time,Temp(°F),Humidity\n2026-06-01,10:00,77,55\n";
    const parsed = parseEnvironmentCSVText(csv, { sourceTimeZone: "UTC" });
    expect(parsed.errors).toEqual([]);
    expect(parsed.detectedColumns.date).toBe("Date");
    expect(parsed.detectedColumns.time).toBe("Time");
    expect(parsed.validRows[0].captured_at).toMatch(/2026-06-01T10:00/);
    expect(parsed.validRows[0].humidity_pct).toBe(55);
  });

  it("maps air columns and converts Temp(F) with header unit", () => {
    const row = parseEnvironmentCSVText(AIR, CHICAGO).validRows[0];
    expect(row.temperature_c).toBeCloseTo(23.2, 5);
    expect(row).toMatchObject({
      humidity_pct: 53.3,
      vpd_kpa: 1.32,
      ppfd: 549,
      co2_ppm: 471,
      soil_temp_c: null,
      soil_moisture_pct: null,
      soil_ec: null,
      raw_temp_unit: "F",
      source_tag: CSV_SOURCE_TAG,
    });
  });

  it("keeps soil metrics off the air fields", () => {
    const parsed = parseEnvironmentCSVText(TENT_A, CHICAGO);
    expect(parsed.errors).toEqual([]);
    const first = parsed.validRows[0];
    expect(first.humidity_pct).toBe(53.3);
    expect(first.soil_moisture_pct).toBe(92);
    expect(first.soil_ec).toBe(1.5);
    expect(first.soil_temp_c).toBe(20.9);
    expect(first.temperature_c).toBeCloseTo(23.2, 5);
    const spike = parsed.validRows[4];
    expect(spike.soil_moisture_pct).toBe(100);
    expect(spike.soil_ec).toBe(2.25);
    expect(spike.humidity_pct).toBe(70.8);
    const low = parsed.validRows[5];
    expect(low.soil_moisture_pct).toBe(0.4);
    expect(low.soil_ec).toBe(0);
  });

  it("imports a soil-only file without relabeling soil as air", () => {
    const parsed = parseEnvironmentCSVText(SOIL, CHICAGO);
    expect(parsed.errors).toEqual([]);
    expect(parsed.validRows).toHaveLength(7);
    expect(parsed.detectedColumns.temperature).toBeNull();
    expect(parsed.detectedColumns.humidity).toBeNull();
    for (const row of parsed.validRows) {
      expect(row.temperature_c).toBeNull();
      expect(row.humidity_pct).toBeNull();
      expect(row.vpd_kpa).toBeNull();
      expect(row.soil_temp_c).not.toBeNull();
      expect(row.soil_moisture_pct).not.toBeNull();
      expect(row.soil_ec).not.toBeNull();
    }
  });

  it("keeps a zero PPFD reading on the tent B export", () => {
    const parsed = parseEnvironmentCSVText(TENT_B, CHICAGO);
    expect(parsed.errors).toEqual([]);
    expect(parsed.validRows.at(-1)?.ppfd).toBe(0);
    expect(parsed.validRows[0].humidity_pct).toBe(52.4);
    expect(parsed.validRows[0].soil_moisture_pct).toBe(42.5);
  });

  it("detects spider_farmer from the header signature when the filename is a hash", async () => {
    const headers = TENT_A.split("\n")[0].split(",");
    expect(CsvImportVendorIdentity.detect("a1b2c3d4e5f67890.csv", headers)).toBe("spider_farmer");
    expect(CsvImportVendorIdentity.detect("a1b2c3d4e5f67890.csv", SOIL.split("\n")[0].split(","))).toBe(
      "spider_farmer",
    );
    expect(CsvImportVendorIdentity.matchesGgsAppExport(["Timestamp", "humidity", "ec_soil"])).toBe(
      false,
    );

    const file = new File([TENT_A], "a1b2c3d4e5f67890.csv", { type: "text/csv" });
    const parsed = await parseEnvironmentCSV(file, CHICAGO);
    expect(parsed.validRows[0].source_app).toBe("spider_farmer");
    expect(parsed.validRows[0].source_tag).toBe("csv");

    const inserts = buildSensorReadingInserts(parsed.validRows, SCOPE);
    const metrics = new Set(inserts.map((insert) => insert.metric));
    expect(metrics).toEqual(
      new Set([
        "temperature_c",
        "humidity_pct",
        "vpd_kpa",
        "co2_ppm",
        "ppfd",
        "soil_temp_c",
        "soil_moisture_pct",
        "ec",
      ]),
    );
    expect(inserts.every((insert) => insert.source === CSV_SENSOR_SOURCE)).toBe(true);
    const moisture = inserts.find((insert) => insert.metric === "soil_moisture_pct");
    const ec = inserts.find((insert) => insert.metric === "ec");
    expect(moisture?.raw_payload.soil_moisture_basis).toBe(CSV_SOIL_MOISTURE_BASIS);
    expect(ec?.raw_payload.ec_unit_assumed).toBe(CSV_SOIL_EC_UNIT_ASSUMED);
    expect(ec?.value).toBe(1.5);
  });

  it("still maps the #2902 Spider Farmer dialect", () => {
    const parsed = parseEnvironmentCSVText(DIALECT_2902, CHICAGO);
    expect(parsed.errors).toEqual([]);
    expect(parsed.detectedColumns.timestamp).toBe("Timestamp");
    expect(parsed.detectedColumns.humidity).toBe("humidity");
    expect(parsed.validRows[0]).toMatchObject({
      temperature_c: 25.7,
      humidity_pct: 52.4,
      soil_moisture_pct: 68.1,
      soil_ec: 1.2,
      ppfd: 925,
      source_tag: "csv",
    });
    expect(parsed.validRows[0].soil_temp_c).toBeCloseTo(21.1, 5);
  });
});
