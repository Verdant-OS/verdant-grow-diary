/**
 * CSV metric identity (CSV QA handoff 2026-11-03, finding F2).
 *
 * Soil columns must never be read as air temperature or air humidity, and
 * column order must not change what a file means. Fixtures reproduce the
 * Spider Farmer device and soil-sensor export schemas from the handoff, with
 * neutral QA identifiers.
 */
import { describe, expect, it } from "vitest";
import {
  CSV_SOIL_ONLY_MESSAGE,
  parseEnvironmentCSVText,
  type ParseEnvironmentCsvResult,
} from "@/lib/csvParser";

type Table = { header: string[]; rows: string[][] };

const SOIL_TABLE: Table = {
  header: [
    "deviceSerialnum",
    "roomId",
    "sensorId",
    "temperature(°C)",
    "humidity",
    "vpd",
    "temperature(°F)",
    "co2",
    "Timestamp",
    "temperature_soil_f(°F)",
    "temperature_soil(°C)",
    "humidity_soil",
    "ec_soil",
  ],
  rows: [
    [
      "qa-device",
      "qa-room",
      "qa-soil-sensor",
      "",
      "",
      "",
      "",
      "",
      "2026-11-03T10:20:00-06:00",
      "78.6",
      "25.9",
      "79.6",
      "1.13",
    ],
    [
      "qa-device",
      "qa-room",
      "qa-soil-sensor",
      "",
      "",
      "",
      "",
      "",
      "2026-11-03T10:25:00-06:00",
      "78.4",
      "25.8",
      "79.5",
      "1.13",
    ],
    [
      "qa-device",
      "qa-room",
      "qa-soil-sensor",
      "",
      "",
      "",
      "",
      "",
      "2026-11-03T10:30:00-06:00",
      "78.1",
      "25.6",
      "79.4",
      "1.11",
    ],
    [
      "qa-device",
      "qa-room",
      "qa-soil-sensor",
      "",
      "",
      "",
      "",
      "",
      "2026-11-03T10:35:00-06:00",
      "77.9",
      "25.5",
      "79.3",
      "1.12",
    ],
  ],
};

const DEVICE_TABLE: Table = {
  header: [
    "deviceSerialnum",
    "temperature(°C)",
    "humidity",
    "vpd",
    "temperature(°F)",
    "co2",
    "Timestamp",
    "temperature_soil_f(°F)",
    "temperature_soil(°C)",
    "humidity_soil",
    "ec_soil",
    "ppfd",
  ],
  rows: [
    [
      "qa-device",
      "25.5",
      "65.3",
      "1.13",
      "77.9",
      "587",
      "2026-10-19T23:00:00-05:00",
      "71.8",
      "22.1",
      "52",
      "0.51",
      "973",
    ],
    [
      "qa-device",
      "25.4",
      "62.9",
      "1.2",
      "77.7",
      "579",
      "2026-10-19T23:15:00-05:00",
      "71.8",
      "22.1",
      "51.3",
      "0.51",
      "973",
    ],
  ],
};

function toCsv(t: Table): string {
  return [t.header, ...t.rows].map((r) => r.join(",")).join("\n") + "\n";
}

/** Reorder columns (header and every row together) by a permutation of indexes. */
function permute(t: Table, order: readonly number[]): Table {
  return {
    header: order.map((i) => t.header[i]),
    rows: t.rows.map((r) => order.map((i) => r[i])),
  };
}

function moveToFront(t: Table, column: string): Table {
  const idx = t.header.indexOf(column);
  const order = [idx, ...t.header.map((_, i) => i).filter((i) => i !== idx)];
  return permute(t, order);
}

function rotations(n: number): number[][] {
  const base = Array.from({ length: n }, (_, i) => i);
  return base.map((k) => [...base.slice(k), ...base.slice(0, k)]);
}

/** Order-free view of a parse result: what a grower would get from it. */
function meaning(r: ParseEnvironmentCsvResult) {
  return {
    errors: r.errors,
    unsupportedColumns: [...(r.unsupportedColumns ?? [])].sort(),
    rows: r.validRows.map((v) => ({
      captured_at: v.captured_at,
      temperature_c: v.temperature_c,
      humidity_pct: v.humidity_pct,
      vpd_kpa: v.vpd_kpa,
      co2_ppm: v.co2_ppm,
      ppfd: v.ppfd,
      soil_temp_c: v.soil_temp_c,
      soil_moisture_pct: v.soil_moisture_pct,
      soil_ec: v.soil_ec,
    })),
  };
}

describe("csvParser — soil columns never become air metrics (F2)", () => {
  // Founder decision 2026-11-05: Spider Farmer soil columns import as soil
  // metrics (soil_temp_c, soil_moisture_pct, ec). They still never become air.
  it("imports the soil-only export as soil metrics only, in its original column order", () => {
    const r = parseEnvironmentCSVText(toCsv(SOIL_TABLE));
    expect(r.errors).toEqual([]);
    expect(r.unsupportedColumns).toEqual([]);
    expect(r.validRows.map((v) => [v.soil_temp_c, v.soil_moisture_pct, v.soil_ec])).toEqual([
      [25.9, 79.6, 1.13],
      [25.8, 79.5, 1.13],
      [25.6, 79.4, 1.11],
      [25.5, 79.3, 1.12],
    ]);
    for (const v of r.validRows) {
      expect(v).toMatchObject({
        temperature_c: null,
        humidity_pct: null,
        vpd_kpa: null,
        co2_ppm: null,
      });
    }
    expect(CSV_SOIL_ONLY_MESSAGE).toContain("soil");
  });

  it("gives the same result when soil Celsius is moved to the first column", () => {
    const original = parseEnvironmentCSVText(toCsv(SOIL_TABLE));
    const moved = parseEnvironmentCSVText(toCsv(moveToFront(SOIL_TABLE, "temperature_soil(°C)")));
    expect(moved.validRows.every((v) => v.temperature_c === null)).toBe(true);
    expect(meaning(moved)).toEqual(meaning(original));
  });

  it("does not accept Timestamp + soil Celsius as generic temperature", () => {
    const csv =
      "Timestamp,temperature_soil(°C)\n" +
      "2026-11-03T10:20:00-06:00,25.9\n" +
      "2026-11-03T10:25:00-06:00,25.8\n";
    const r = parseEnvironmentCSVText(csv);
    expect(r.detectedColumns.temperature).toBeNull();
    expect(r.errors).toEqual([]);
    expect(r.unsupportedColumns).toEqual([]);
    expect(r.validRows.map((v) => [v.temperature_c, v.soil_temp_c])).toEqual([
      [null, 25.9],
      [null, 25.8],
    ]);
  });

  it("is order-independent across every rotation and the reverse of the soil schema", () => {
    const n = SOIL_TABLE.header.length;
    const orders = [...rotations(n), Array.from({ length: n }, (_, i) => n - 1 - i)];
    const expected = meaning(parseEnvironmentCSVText(toCsv(SOIL_TABLE)));
    for (const order of orders) {
      const got = meaning(parseEnvironmentCSVText(toCsv(permute(SOIL_TABLE, order))));
      expect(got).toEqual(expected);
    }
  });
});

describe("csvParser — device export keeps air metrics regardless of order (F2)", () => {
  it("maps air temperature, RH, VPD, CO₂ and PPFD, and soil to soil metrics only", () => {
    const r = parseEnvironmentCSVText(toCsv(DEVICE_TABLE));
    expect(r.errors).toEqual([]);
    expect(r.detectedColumns.temperature).toBe("temperature(°C)");
    expect(r.detectedColumns.humidity).toBe("humidity");
    expect(r.validRows[0]).toMatchObject({
      captured_at: "2026-10-20T04:00:00.000Z",
      temperature_c: 25.5,
      humidity_pct: 65.3,
      vpd_kpa: 1.13,
      co2_ppm: 587,
      ppfd: 973,
    });
    expect(r.unsupportedColumns).toEqual([]);
    expect(r.validRows[0].soil_temp_c).not.toBeNull();
    expect(r.validRows[0].humidity_pct).not.toBe(r.validRows[0].soil_moisture_pct);
  });

  it("produces identical air readings for every rotation and the reverse of the device schema", () => {
    const n = DEVICE_TABLE.header.length;
    const orders = [...rotations(n), Array.from({ length: n }, (_, i) => n - 1 - i)];
    const expected = meaning(parseEnvironmentCSVText(toCsv(DEVICE_TABLE)));
    expect(expected.rows).toHaveLength(2);
    for (const order of orders) {
      const got = meaning(parseEnvironmentCSVText(toCsv(permute(DEVICE_TABLE, order))));
      expect(got).toEqual(expected);
    }
  });

  it("never reads humidity_soil as air RH when it precedes humidity", () => {
    const r = parseEnvironmentCSVText(toCsv(moveToFront(DEVICE_TABLE, "humidity_soil")));
    expect(r.detectedColumns.humidity).toBe("humidity");
    expect(r.validRows.map((v) => v.humidity_pct)).toEqual([65.3, 62.9]);
  });
});

describe("csvParser — word-bounded metric headers", () => {
  it("does not treat a header that merely contains 'par' as PPFD", () => {
    const csv = "Timestamp,temperature(°C),compare_note\n2026-11-03T10:20:00Z,25.0,7\n";
    const r = parseEnvironmentCSVText(csv);
    expect(r.detectedColumns.ppfd).toBeNull();
    expect(r.validRows[0].ppfd).toBeNull();
  });

  it("still recognizes PAR, ppfd and photosynthetic headers", () => {
    for (const h of ["PAR", "ppfd", "PPFD (µmol/m²/s)", "Photosynthetic photon flux"]) {
      const r = parseEnvironmentCSVText(`Timestamp,${h}\n2026-11-03T10:20:00Z,900\n`);
      expect(r.detectedColumns.ppfd, h).toBe(h);
      expect(r.validRows[0].ppfd, h).toBe(900);
    }
  });

  it("reports no unsupported columns for an air-only file", () => {
    const r = parseEnvironmentCSVText("Timestamp,temperature(°C)\n2026-11-03T16:20:00Z,26.2\n");
    expect(r.unsupportedColumns).toEqual([]);
    expect(r.validRows[0].temperature_c).toBe(26.2);
  });
});
