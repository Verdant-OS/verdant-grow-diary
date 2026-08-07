/**
 * actionQueueEvidenceSnapshotRules — project sanitized sensor metrics off
 * originating_timeline_events for Action Queue evidence quality chips.
 *
 * Pure. No I/O. No React. No Supabase.
 *
 * Fail closed:
 *  - Only allowlisted numeric metric keys are kept.
 *  - Forbidden payload/secret keys never appear (caller must not put them
 *    on refs; adapter drops whole refs that include them).
 *  - Missing / non-sensor refs → null snapshot (quality unavailable).
 *  - Always historical evidence — never invents current-room support.
 */

import type { ManualSensorSnapshotInput } from "@/lib/manualSensorSnapshotQualityRules";
import type { OriginatingTimelineEventRef } from "@/lib/originatingTimelineEventRules";

/** Allowlisted metric keys stored on a sensor_snapshot timeline ref. */
export const SANITIZED_REF_METRIC_KEYS = [
  "temperature_c",
  "humidity_pct",
  "vpd_kpa",
  "soil_temp_c",
  "soil_moisture_pct",
  "soil_ec_mscm",
  "ph",
] as const;

export type SanitizedRefMetricKey = (typeof SANITIZED_REF_METRIC_KEYS)[number];

export type SanitizedRefMetrics = Partial<Record<SanitizedRefMetricKey, number>>;

const METRIC_KEY_SET = new Set<string>(SANITIZED_REF_METRIC_KEYS);

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/**
 * Strip hostile/unknown keys; keep only finite allowlisted metrics.
 */
export function sanitizeRefMetrics(raw: unknown): SanitizedRefMetrics | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const out: SanitizedRefMetrics = {};
  let any = false;
  for (const key of SANITIZED_REF_METRIC_KEYS) {
    if (isFiniteNumber(obj[key])) {
      out[key] = obj[key];
      any = true;
    }
  }
  // Reject objects that only had unknown keys (any=false).
  if (!any) return null;
  // If object carried non-allowlisted keys, ignore them (do not reject entire
  // metrics bag — writers may add future keys we don't understand yet).
  void METRIC_KEY_SET;
  return out;
}

/**
 * Map a grower SensorSnapshot (temp/rh/vpd in °C / % / kPa) into allowlisted
 * metrics for a sensor_snapshot evidence ref.
 */
export function sanitizedMetricsFromSensorSnapshot(
  snapshot:
    | {
        temp?: number | null;
        rh?: number | null;
        vpd?: number | null;
        soil?: number | null;
        soil_ec?: number | null;
        soil_temp?: number | null;
        ph?: number | null;
      }
    | null
    | undefined,
): SanitizedRefMetrics | null {
  if (!snapshot) return null;
  return sanitizeRefMetrics({
    temperature_c: snapshot.temp,
    humidity_pct: snapshot.rh,
    vpd_kpa: snapshot.vpd,
    soil_moisture_pct: snapshot.soil,
    soil_ec_mscm: snapshot.soil_ec,
    soil_temp_c: snapshot.soil_temp,
    ph: snapshot.ph ?? undefined,
  });
}

/**
 * Pick the best sensor_snapshot ref with metrics and project ManualSensorSnapshotInput.
 * Prefers trusted sources (live/manual/csv), then first with metrics.
 */
export function extractManualSnapshotFromTimelineEvents(
  events: readonly OriginatingTimelineEventRef[] | null | undefined,
): ManualSensorSnapshotInput | null {
  if (!Array.isArray(events) || events.length === 0) return null;

  const sensorRefs = events.filter(
    (e) =>
      (e.type === "sensor_snapshot" || e.type === "sensor_reading") &&
      e.sanitized_metrics &&
      Object.keys(e.sanitized_metrics).length > 0,
  );
  if (sensorRefs.length === 0) return null;

  const trusted = new Set(["live", "manual", "csv"]);
  const ordered = [...sensorRefs].sort((a, b) => {
    const at = trusted.has(a.source ?? "") ? 0 : 1;
    const bt = trusted.has(b.source ?? "") ? 0 : 1;
    if (at !== bt) return at - bt;
    const ao = a.occurred_at ?? "";
    const bo = b.occurred_at ?? "";
    if (ao !== bo) return ao < bo ? 1 : -1; // newest first
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  const pick = ordered[0]!;
  const m = pick.sanitized_metrics!;
  return {
    source: pick.source ?? "unknown",
    captured_at: pick.occurred_at ?? null,
    temperature_c: m.temperature_c ?? null,
    humidity_pct: m.humidity_pct ?? null,
    vpd_kpa: m.vpd_kpa ?? null,
    soil_temp_c: m.soil_temp_c ?? null,
    soil_moisture_pct: m.soil_moisture_pct ?? null,
    soil_ec_mscm: m.soil_ec_mscm ?? null,
    ph: m.ph ?? null,
  };
}
