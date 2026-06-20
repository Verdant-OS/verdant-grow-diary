/**
 * csv-parser.test — covers parser contract: header detection, unit handling,
 * VPD derivation, validation, error codes, raw preservation, source tag.
 */
import { describe, it, expect } from "vitest";
import {
  parseEnvironmentCSV,
  parseEnvironmentCSVText,
  computeVpdKpa,
  CSV_SOURCE_TAG,
  MAX_CSV_BYTES,
  renormalizeWithUnit,
} from "@/lib/csvParser";

function makeFile(text: string, name = "export.csv", size?: number): File {
  const file = new File([text], name, { type: "text/csv" });
  if (size != null) {
    Object.defineProperty(file, "size", { value: size });
  }
  return file;
}

describe("csvParser — dynamic header detection", () => {
  it("detects Date + Time columns and combines them (test 2)", () => {
    const csv =
      "Date,Time,Temp(°F),Humidity\n2026-06-01,10:00,77,55\n2026-06-01,11:00,78,54\n";
    const r = parseEnvironmentCSVText(csv);
    expect(r.errors).toEqual([]);
    expect(r.detectedColumns.date).toBe("Date");
    expect(r.detectedColumns.time).toBe("Time");
    expect(r.validRows).toHaveLength(2);
    expect(r.validRows[0].captured_at).toMatch(/2026-06-01T10:00/);
  });

  it("detects Timestamp column (test 3)", () => {
    const csv = "Timestamp,Temperature,RH\n2026-06-01T10:00:00Z,25,55\n";
    const r = parseEnvironmentCSVText(csv);
    expect(r.detectedColumns.timestamp).toBe("Timestamp");
    expect(r.validRows[0].temperature_c).toBeCloseTo(25, 5);
  });

  it("detects Temp/RH columns by multiple names (test 4)", () => {
    const cases = [
      "Date,Air Temp,Relative Humidity\n2026-06-01,25,50\n",
      "Date,temp_c,RH\n2026-06-01,25,50\n",
      "Date,temp_f,humidity\n2026-06-01,77,50\n",
    ];
    for (const csv of cases) {
      const r = parseEnvironmentCSVText(csv);
      expect(r.errors).toEqual([]);
      expect(r.detectedColumns.temperature).not.toBeNull();
      expect(r.detectedColumns.humidity).not.toBeNull();
    }
  });

  it("detects Spider Farmer columns including vpd, co2, and ppfd", () => {
    const csv =
      "\uFEFFdeviceSerialnum,temperature(°C),humidity,vpd,temperature(°F),co2,Timestamp,ppfd\n" +
      "80F1B2B452B8,25.7,52.4,1.57,78.3,775,2026-05-31 19:00:00,925\n";
    const r = parseEnvironmentCSVText(csv);
    expect(r.errors).toEqual([]);
    expect(r.detectedColumns.temperature).toBe("temperature(°C)");
    expect(r.detectedColumns.humidity).toBe("humidity");
    expect(r.detectedColumns.vpd).toBe("vpd");
    expect(r.detectedColumns.co2).toBe("co2");
    expect(r.detectedColumns.ppfd).toBe("ppfd");
    expect(r.validRows).toHaveLength(1);
    expect(r.validRows[0]).toMatchObject({
      temperature_c: 25.7,
      humidity_pct: 52.4,
      vpd_kpa: 1.57,
      co2_ppm: 775,
      ppfd: 925,
      raw_temperature: 25.7,
      raw_temp_unit: "C",
      vpd_source: "csv",
      source_tag: "csv",
    });
    expect(r.validRows[0].captured_at).toBe("2026-05-31T19:00:00.000Z");
    expect(r.validRows[0].raw_payload.deviceSerialnum).toBe("80F1B2B452B8");
  });
});

describe("csvParser — unit normalization", () => {
  it("converts Fahrenheit to Celsius when header says °F (test 5)", () => {
    const csv = "Timestamp,Temp(°F),RH\n2026-06-01T10:00:00Z,77,50\n";
    const r = parseEnvironmentCSVText(csv);
    expect(r.validRows[0].temperature_c).toBeCloseTo(25, 1);
    expect(r.validRows[0].raw_temperature).toBe(77);
    expect(r.validRows[0].raw_temp_unit).toBe("F");
  });

  it("keeps Celsius as Celsius when header says °C (test 6)", () => {
    const csv = "Timestamp,Temp(°C),RH\n2026-06-01T10:00:00Z,25,50\n";
    const r = parseEnvironmentCSVText(csv);
    expect(r.validRows[0].temperature_c).toBe(25);
    expect(r.validRows[0].raw_temp_unit).toBe("C");
  });

  it("infers Fahrenheit when temp > 45 and header is neutral (test 7)", () => {
    const csv = "Timestamp,Temperature,RH\n2026-06-01T10:00:00Z,77,50\n2026-06-01T11:00:00Z,80,50\n";
    const r = parseEnvironmentCSVText(csv);
    expect(r.validRows[0].raw_temp_unit).toBe("F");
    expect(r.validRows[0].temperature_c).toBeCloseTo(25, 0);
    expect(r.isAmbiguous).toBe(false);
  });

  it("flags ambiguous range when values 0–45 with neutral header (test 8)", () => {
    const csv = "Timestamp,Temperature,RH\n2026-06-01T10:00:00Z,25,50\n";
    const r = parseEnvironmentCSVText(csv);
    expect(r.isAmbiguous).toBe(true);
    const renorm = renormalizeWithUnit(r, "F");
    expect(renorm.isAmbiguous).toBe(false);
    expect(renorm.validRows[0].raw_temp_unit).toBe("F");
    expect(renorm.validRows[0].temperature_c).toBeCloseTo((25 - 32) * (5 / 9), 3);
  });
});

describe("csvParser — raw preservation + VPD", () => {
  it("preserves raw temperature and unit (test 9)", () => {
    const csv = "Timestamp,Temp(°F),RH\n2026-06-01T10:00:00Z,77,50\n";
    const r = parseEnvironmentCSVText(csv);
    expect(r.validRows[0].raw_temperature).toBe(77);
    expect(r.validRows[0].raw_temp_unit).toBe("F");
    expect(r.validRows[0].raw_payload["Temp(°F)"]).toBe("77");
  });

  it("computes VPD when temp+RH valid (test 10)", () => {
    const csv = "Timestamp,Temp(°C),RH\n2026-06-01T10:00:00Z,25,50\n";
    const r = parseEnvironmentCSVText(csv);
    expect(r.validRows[0].vpd_kpa).toBeCloseTo(computeVpdKpa(25, 50), 3);
    expect(r.validRows[0].vpd_kpa).toBeGreaterThan(1.5);
    expect(r.validRows[0].vpd_kpa!).toBeLessThan(1.7);
    expect(r.validRows[0].vpd_source).toBe("derived");
  });

  it("uses CSV VPD when provided instead of overwriting it", () => {
    const csv = "Timestamp,Temp(°C),RH,VPD\n2026-06-01T10:00:00Z,25,50,1.23\n";
    const r = parseEnvironmentCSVText(csv);
    expect(r.validRows[0].vpd_kpa).toBe(1.23);
    expect(r.validRows[0].vpd_source).toBe("csv");
  });

  it("vpd_kpa is null when temp or RH missing and no CSV VPD exists (test 11)", () => {
    const csv = "Timestamp,Temp(°C),RH\n2026-06-01T10:00:00Z,25,\n2026-06-01T11:00:00Z,,50\n";
    const r = parseEnvironmentCSVText(csv);
    expect(r.validRows).toHaveLength(2);
    expect(r.validRows.every((row) => row.vpd_kpa === null)).toBe(true);
  });
});

describe("csvParser — row validation", () => {
  it("skips invalid timestamp rows (test 12)", () => {
    const csv = "Timestamp,Temp(°C),RH\nnot-a-date,25,50\n2026-06-01T10:00:00Z,25,50\n";
    const r = parseEnvironmentCSVText(csv);
    expect(r.validRows).toHaveLength(1);
    expect(r.skippedRows[0].reason).toBe("invalid_timestamp");
  });

  it("skips invalid humidity rows (test 13)", () => {
    const csv = "Timestamp,Temp(°C),RH\n2026-06-01T10:00:00Z,25,250\n2026-06-01T11:00:00Z,25,abc\n";
    const r = parseEnvironmentCSVText(csv);
    expect(r.skippedRows.every((s) => s.reason === "invalid_humidity")).toBe(true);
    expect(r.skippedRows).toHaveLength(2);
  });

  it("parses quoted CSV values (test 14)", () => {
    const csv = 'Timestamp,Temp(°C),RH\n"2026-06-01T10:00:00Z","25","50"\n';
    const r = parseEnvironmentCSVText(csv);
    expect(r.validRows).toHaveLength(1);
    expect(r.validRows[0].temperature_c).toBe(25);
  });
});

describe("csvParser — file-level errors", () => {
  it("wrong file type (test 15)", async () => {
    const f = makeFile("hi", "notes.txt");
    const r = await parseEnvironmentCSV(f);
    expect(r.errors[0].code).toBe("wrong_file_type");
  });

  it("empty file (test 16)", async () => {
    const r = await parseEnvironmentCSV(makeFile("", "x.csv"));
    expect(r.errors[0].code).toBe("empty_file");
  });

  it("no recognizable sensor data (test 17)", async () => {
    const r = await parseEnvironmentCSV(
      makeFile("foo,bar\nabc,def\n", "x.csv"),
    );
    expect(r.errors[0].code).toBe("no_sensor_data");
  });

  it("file too large (test 18)", async () => {
    const r = await parseEnvironmentCSV(
      makeFile("x", "big.csv", MAX_CSV_BYTES + 1),
    );
    expect(r.errors[0].code).toBe("file_too_large");
  });
});

describe("csvParser — source tag hardcoded", () => {
  it("every parsed row uses source_tag csv", () => {
    const csv = "Timestamp,Temp(°C),RH\n2026-06-01T10:00:00Z,25,50\n";
    const r = parseEnvironmentCSVText(csv);
    expect(r.validRows.every((row) => row.source_tag === CSV_SOURCE_TAG)).toBe(true);
    expect(CSV_SOURCE_TAG).toBe("csv");
  });
});
