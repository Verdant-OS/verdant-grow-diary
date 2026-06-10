/**
 * quickLogSnapshotMetricNormalizer — shared read-side normalizer for
 * Quick Log v1 sensor snapshot metric keys.
 *
 * Why this exists:
 *   The Quick Log writer now produces "clean" metric keys (`temperature`,
 *   `humidity`, `vpd`, …) via `get_latest_tent_sensor_snapshot`. Older
 *   companion rows persisted "legacy" keys (`temperature_c`, `humidity_pct`,
 *   `vpd_kpa`, …) that mirror `sensor_readings.metric`. Read paths must
 *   render BOTH consistently.
 *
 * Hard rules:
 *   - Pure: no I/O, no React, no Supabase, no time.
 *   - Never invents readings. Non-finite / null / non-numeric values are
 *     dropped.
 *   - Never relabels source/captured_at — this module only touches metric
 *     keys; provenance is the caller's responsibility.
 *   - When both a legacy and clean key are present, the clean key wins.
 *   - Empty / all-null metric maps return `{}` so the snapshot layer above
 *     can treat them as "no usable snapshot".
 */

/** Canonical clean metric keys surfaced to all read paths. */
export const QUICK_LOG_CANONICAL_METRICS = [
  "temperature",
  "humidity",
  "vpd",
  "co2",
  "soil_temp",
  "soil_moisture",
  "soil_ec",
  "ph",
  "ppfd",
] as const;

export type QuickLogCanonicalMetric =
  (typeof QUICK_LOG_CANONICAL_METRICS)[number];

/**
 * Legacy → canonical mapping. Mirrors `sensor_readings.metric` values that
 * were embedded in earlier Quick Log companion snapshots.
 */
const LEGACY_TO_CANONICAL: Readonly<Record<string, QuickLogCanonicalMetric>> = {
  temperature_c: "temperature",
  humidity_pct: "humidity",
  vpd_kpa: "vpd",
  co2_ppm: "co2",
  soil_temp_c: "soil_temp",
  soil_moisture_pct: "soil_moisture",
  // sensor_readings uses `ec` for soil EC; the clean RPC surfaces `soil_ec`.
  ec: "soil_ec",
  soil_ec_ms_cm: "soil_ec",
};

function finiteNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim().length > 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Normalize a raw metric map (accepting both legacy and clean keys) into
 * a canonical-keyed map of finite numbers. Clean keys win on conflict.
 *
 * Unknown keys pass through unchanged (so future metrics don't silently
 * disappear), but only when their value is a finite number.
 */
export function normalizeQuickLogSnapshotMetrics(
  raw: unknown,
): Record<string, number> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const input = raw as Record<string, unknown>;
  const out: Record<string, number> = {};

  // First pass: legacy keys. Clean keys overwrite in the second pass.
  for (const [k, v] of Object.entries(input)) {
    const canonical = LEGACY_TO_CANONICAL[k];
    if (!canonical) continue;
    const n = finiteNumber(v);
    if (n !== null) out[canonical] = n;
  }

  // Second pass: clean / canonical keys + unknown passthrough.
  for (const [k, v] of Object.entries(input)) {
    if (k in LEGACY_TO_CANONICAL) continue;
    const n = finiteNumber(v);
    if (n !== null) out[k] = n;
  }

  return out;
}
