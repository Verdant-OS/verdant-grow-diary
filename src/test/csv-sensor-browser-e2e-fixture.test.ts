import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildCsvInsertRows,
  normalizeAcInfinityRows,
  parseCsv,
  planColumns,
} from "@/lib/csvSensorImportRules";

const FIXTURE_PATH = resolve(__dirname, "../../fixtures/sensor-csv/browser-e2e-clean-20260725.csv");

describe("browser E2E sensor CSV fixture", () => {
  const csv = readFileSync(FIXTURE_PATH, "utf8");
  const parsed = parseCsv(csv);
  const normalized = normalizeAcInfinityRows(parsed, planColumns(parsed.headers));

  it("normalizes two deterministic historical rows without skips", () => {
    expect(normalized.rows).toHaveLength(2);
    expect(normalized.skipped).toEqual([]);
    expect(normalized.unsupportedMetrics).toEqual([]);
    expect(normalized.metricsDetected).toEqual([
      "temperature_c",
      "humidity_pct",
      "vpd_kpa",
      "co2_ppm",
    ]);
    expect(normalized.dateRange).toEqual({
      from: "2026-07-24T14:00:00.000Z",
      to: "2026-07-24T14:05:00.000Z",
    });
  });

  it("builds source-labeled historical inserts and never presents them as live", () => {
    const inserts = buildCsvInsertRows({
      tentId: "8bcd822a-fc9a-4507-adf6-96b00472badd",
      growId: "c69e6d31-0027-44a4-ac07-25e13472de36",
      sourceApp: "ac_infinity",
      importBatchId: "browser-e2e-clean-20260725",
      rows: normalized.rows,
    });

    expect(inserts).toHaveLength(8);
    expect(new Set(inserts.map((row) => row.source))).toEqual(new Set(["csv_import_ac_infinity"]));
    expect(inserts.every((row) => row.raw_payload.csv_import)).toBe(true);
    expect(inserts.every((row) => row.source !== "live")).toBe(true);
  });
});
