/**
 * sensorIngestAuditReportCsvExport — pure CSV builder for the operator
 * sensor ingest audit report.
 *
 * Hard constraints:
 *   - No I/O. No Supabase. No fetch.
 *   - Exports accepted persisted readings only. Rejected ingest attempts
 *     are NOT included (they are not persisted).
 *   - Raw payload is omitted entirely by default.
 *   - device_station_display_id is the safe/redacted display only —
 *     never MAC / IP / passkey / token / private IP.
 *   - Missing VPD exports blank, never 0.
 *   - Escapes commas / quotes / newlines per RFC 4180.
 *   - Includes a header line indicating rejected ingest attempts are
 *     not persisted, so downstream readers cannot misinterpret omissions.
 */
import type { SensorIngestAuditRow } from "@/lib/sensorIngestAuditReportRules";
import { REJECTED_NOT_PERSISTED_NOTE } from "@/lib/sensorIngestAuditReportRules";

export const AUDIT_CSV_FILENAME = "verdant-sensor-ingest-audit.csv" as const;
export const AUDIT_CSV_REJECTED_HEADER = `# ${REJECTED_NOT_PERSISTED_NOTE}` as const;

export const AUDIT_CSV_COLUMNS = [
  "captured_at",
  "accepted",
  "reason",
  "source",
  "provider",
  "transport",
  "tent_id",
  "plant_id",
  "metric_summary",
  "vpd_kpa",
  "soil_moisture_pct",
  "humidity_pct",
  "air_temperature",
  "freshness_state",
  "confidence",
  "device_station_display_id",
] as const;

function csvEscape(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (s === "") return "";
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function num(v: number | null | undefined): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "";
  return String(v);
}

function vpdNum(v: number | null | undefined): string {
  // VPD must be blank when missing/invalid, never 0.
  if (typeof v !== "number" || !Number.isFinite(v) || v === 0) return "";
  return String(v);
}

export interface BuildAuditCsvOptions {
  /** Filename override; otherwise AUDIT_CSV_FILENAME. */
  filename?: string;
}

export interface BuildAuditCsvResult {
  filename: string;
  csv: string;
}

export function buildSensorIngestAuditCsv(
  rows: SensorIngestAuditRow[],
  options: BuildAuditCsvOptions = {},
): BuildAuditCsvResult {
  const lines: string[] = [];
  lines.push(AUDIT_CSV_REJECTED_HEADER);
  lines.push(AUDIT_CSV_COLUMNS.join(","));
  for (const r of rows) {
    if (!r.accepted) continue; // never include rejected in the export
    lines.push(
      [
        csvEscape(r.capturedAt),
        csvEscape(r.accepted ? "yes" : "no"),
        csvEscape(r.reason),
        csvEscape(r.source),
        csvEscape(r.provider ?? ""),
        csvEscape(r.transport ?? ""),
        csvEscape(r.tentId ?? ""),
        csvEscape(r.plantId ?? ""),
        csvEscape(r.metricSummary),
        csvEscape(vpdNum(r.vpdKpa)),
        csvEscape(num(r.soilMoisturePct)),
        csvEscape(num(r.humidityPct)),
        csvEscape(num(r.airTemperatureC)),
        csvEscape(r.freshness),
        csvEscape(num(r.confidence)),
        csvEscape(r.deviceStationDisplayId ?? ""),
      ].join(","),
    );
  }
  return {
    filename: options.filename ?? AUDIT_CSV_FILENAME,
    csv: `${lines.join("\n")}\n`,
  };
}
