import type { SensorSourceSummaryReading } from "@/lib/sensorSourceSummaryRules";

interface DiaryRow {
  entry_at: string;
  details: unknown;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** One source observation per diary row; never counts a legacy echo twice. */
export function buildPlantSensorSourceReadings(
  rows: ReadonlyArray<DiaryRow | null> | null | undefined,
): SensorSourceSummaryReading[] {
  const out: SensorSourceSummaryReading[] = [];
  for (const row of rows ?? []) {
    if (!row) continue;
    const details = record(row.details);
    if (!details) continue;
    const canonical = record(details.manual_sensor_snapshot);
    const snap = canonical ?? record(details.sensor_snapshot) ?? record(details.sensor);
    if (!snap) continue;
    const source = typeof snap.source === "string" && snap.source.trim() ? snap.source : null;
    const ts = typeof snap.ts === "string" && snap.ts ? snap.ts : null;
    out.push({
      // Dedicated manual snapshots require their explicit source. Only the
      // existing legacy grower-entry shape keeps its historical manual default.
      source: source ?? (canonical ? "invalid" : "manual"),
      captured_at: ts ?? row.entry_at ?? null,
      ts: row.entry_at,
    });
  }
  return out;
}
