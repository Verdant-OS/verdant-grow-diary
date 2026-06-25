/**
 * sensorSnapshotDetailsDrawerCsvExport — pure CSV builder for the
 * operator-only SensorSnapshot details drawer download.
 *
 * Hard constraints:
 *   - No I/O. No Supabase. No fetch.
 *   - Accepts already-filtered rows only. The caller decides what rows are
 *     currently shown on the Sensors page.
 *   - Raw payload keys are omitted from generic object rows.
 *   - Missing values export blank, never fake zeroes.
 */

export type SensorSnapshotDrawerCsvRow = Record<string, string | number | boolean | null | undefined>;

export interface SensorSnapshotDrawerCsvSnapshot {
  snapshotId: string;
  capturedAt: string | null;
  source: string | null;
  provider: string | null;
  transport: string | null;
  tentId: string | null;
  plantId: string | null;
  vpdKpa: number | null;
  soilMoisturePct: number | null;
  humidityPct: number | null;
  airTemperatureC: number | null;
  confidence: number | null;
  staleOrInvalid: boolean;
}

export interface SensorSnapshotDrawerCsvInput {
  snapshot: SensorSnapshotDrawerCsvSnapshot;
  environmentCheckRows?: SensorSnapshotDrawerCsvRow[];
  ingestAuditRows?: SensorSnapshotDrawerCsvRow[];
}

export const SNAPSHOT_DRAWER_CSV_FILENAME = "verdant-sensor-snapshot-details.csv" as const;

const BLOCKED_COLUMNS = new Set([
  "raw_payload",
  "rawPayload",
  "payload",
  "passkey",
  "password",
  "secret",
  "token",
  "authorization",
  "mac",
  "ip",
]);

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function safeColumns(rows: SensorSnapshotDrawerCsvRow[]): string[] {
  const columns = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!BLOCKED_COLUMNS.has(key)) columns.add(key);
    }
  }
  return [...columns].sort();
}

function sectionRows(section: string, rows: SensorSnapshotDrawerCsvRow[]): string[] {
  if (rows.length === 0) return [`# ${section}: no rows supplied`];
  const columns = safeColumns(rows);
  const out = [`# ${section}`, ["section", ...columns].map(csvEscape).join(",")];
  for (const row of rows) {
    out.push([section, ...columns.map((key) => row[key])].map(csvEscape).join(","));
  }
  return out;
}

function snapshotRows(snapshot: SensorSnapshotDrawerCsvSnapshot): string[] {
  const row: SensorSnapshotDrawerCsvRow = {
    snapshot_id_present: snapshot.snapshotId ? true : false,
    captured_at: snapshot.capturedAt,
    source: snapshot.source,
    provider: snapshot.provider,
    transport: snapshot.transport,
    tent_present: snapshot.tentId ? true : false,
    plant_present: snapshot.plantId ? true : false,
    vpd_kpa: snapshot.vpdKpa === 0 ? null : snapshot.vpdKpa,
    soil_moisture_pct: snapshot.soilMoisturePct,
    humidity_pct: snapshot.humidityPct,
    air_temperature_c: snapshot.airTemperatureC,
    confidence: snapshot.confidence,
    stale_or_invalid: snapshot.staleOrInvalid,
  };
  return sectionRows("snapshot", [row]);
}

export function buildSensorSnapshotDetailsDrawerCsv(input: SensorSnapshotDrawerCsvInput): string {
  return [
    "# Verdant sensor snapshot details export",
    "# Raw payloads and unsafe identifiers are omitted.",
    ...snapshotRows(input.snapshot),
    ...sectionRows("environment_check", input.environmentCheckRows ?? []),
    ...sectionRows("ingest_audit", input.ingestAuditRows ?? []),
  ].join("\n");
}
