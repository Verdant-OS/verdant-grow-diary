import { describe, it, expect } from "vitest";
import {
  buildSensorIngestAuditCsv,
  AUDIT_CSV_FILENAME,
} from "@/lib/sensorIngestAuditReportCsvExport";
import type { SensorIngestAuditRow } from "@/lib/sensorIngestAuditReportRules";

function makeRow(over: Partial<SensorIngestAuditRow> = {}): SensorIngestAuditRow {
  return {
    id: "r1",
    capturedAt: "2026-06-19T12:00:00Z",
    acceptedAtMs: Date.parse("2026-06-19T12:00:00Z"),
    accepted: true,
    reason: "Persisted accepted reading",
    source: "live",
    provider: "ecowitt",
    transport: "mqtt",
    tentId: "t1",
    plantId: "p1",
    metricSummary: "temp_c=22",
    vpdKpa: 1.2,
    soilMoisturePct: 35,
    humidityPct: 55,
    airTemperatureC: 22,
    freshness: "fresh",
    confidence: 0.9,
    rawPayloadRedacted: "{}",
    deviceStationDisplayId: "Greenhouse A",
    ...over,
  };
}

describe("sensorIngestAuditReportCsvExport", () => {
  it("includes header note + columns + accepted rows", () => {
    const { csv, filename } = buildSensorIngestAuditCsv([makeRow()]);
    expect(filename).toBe(AUDIT_CSV_FILENAME);
    expect(csv).toMatch(/Rejected ingest attempts are not persisted/);
    expect(csv.split("\n")[1]).toBe(
      "captured_at,accepted,reason,source,provider,transport,tent_id,plant_id,metric_summary,vpd_kpa,soil_moisture_pct,humidity_pct,air_temperature,freshness_state,confidence,device_station_display_id",
    );
    expect(csv).toMatch(/Greenhouse A/);
  });

  it("omits rejected ingest attempts", () => {
    const { csv } = buildSensorIngestAuditCsv([
      makeRow({ id: "r1", accepted: true }),
      makeRow({ id: "r2", accepted: false }),
    ]);
    const lines = csv.split("\n").filter(Boolean);
    // header note + header columns + 1 row
    expect(lines).toHaveLength(3);
  });

  it("missing VPD exports blank, not 0", () => {
    const { csv } = buildSensorIngestAuditCsv([makeRow({ vpdKpa: 0 })]);
    const row = csv.split("\n")[2];
    const cols = row.split(",");
    // vpd_kpa is column index 9
    expect(cols[9]).toBe("");
  });

  it("escapes commas, quotes, and newlines", () => {
    const { csv } = buildSensorIngestAuditCsv([
      makeRow({
        reason: 'has, comma "and quote"',
        metricSummary: "line1\nline2",
        deviceStationDisplayId: "Has, comma",
      }),
    ]);
    expect(csv).toMatch(/"has, comma ""and quote"""/);
    expect(csv).toMatch(/"line1\nline2"/);
    expect(csv).toMatch(/"Has, comma"/);
  });

  it("blanks out missing device display id", () => {
    const { csv } = buildSensorIngestAuditCsv([makeRow({ deviceStationDisplayId: null })]);
    const cols = csv.split("\n")[2].split(",");
    expect(cols[cols.length - 1]).toBe("");
  });

  it("never includes a raw_payload column", () => {
    const { csv } = buildSensorIngestAuditCsv([
      makeRow({ rawPayloadRedacted: "SECRET_BLOB_VAL" }),
    ]);
    expect(csv).not.toContain("raw_payload");
    expect(csv).not.toContain("SECRET_BLOB_VAL");
  });
});
