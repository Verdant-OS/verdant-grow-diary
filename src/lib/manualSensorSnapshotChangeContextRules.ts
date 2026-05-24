/**
 * Manual Sensor Snapshot — change context rules.
 *
 * Pure helpers that turn a list of manual `sensor_readings` rows (long
 * format, one metric per row) into a compact "what moved since the last
 * manual snapshot" summary for the grow-room UI.
 *
 * Scope:
 *  - Pure. No React, no I/O, no DB client. Read-only derivation.
 *  - Compares the latest manual snapshot for a tent against the previous
 *    manual snapshot for the SAME tent.
 *  - Never claims a plant is healthy/unhealthy. Never writes anything.
 *  - Missing or invalid values are omitted — never guessed.
 *  - Deterministic metric order regardless of input ordering.
 *  - Supports advisory-only metric keys (soil EC mS/cm, reservoir pH) so
 *    future / pen-entered snapshots benefit without a schema change.
 */

export type ChangeContextMetric =
  | "temperature_c"
  | "humidity_pct"
  | "vpd_kpa"
  | "co2_ppm"
  | "soil_moisture_pct"
  | "soil_ec_ms_cm"
  | "reservoir_ph";

export interface ChangeContextReading {
  ts: string | number | Date | null | undefined;
  metric: string;
  value: number | null | undefined;
  source?: string | null;
  tent_id?: string | null;
}

export interface ChangeContextSnapshot {
  ts: string;
  metrics: Partial<Record<ChangeContextMetric, number>>;
}

export interface ChangeContextDelta {
  key: ChangeContextMetric;
  /** Grow-room friendly label, e.g. "Temp", "RH". */
  label: string;
  /** Delta in display units (e.g. °F for temperature). */
  delta: number;
  /** Pre-formatted display string, e.g. "+2.1°F". */
  formatted: string;
  /** Direction: "up" | "down" | "flat". */
  direction: "up" | "down" | "flat";
}

export interface ChangeContextResult {
  /** True when the tent has no prior manual snapshot to compare against. */
  firstSnapshot: boolean;
  /** Empty when first snapshot OR when nothing comparable changed. */
  deltas: ChangeContextDelta[];
}

const DISPLAY_ORDER: ChangeContextMetric[] = [
  "temperature_c",
  "humidity_pct",
  "vpd_kpa",
  "co2_ppm",
  "soil_moisture_pct",
  "soil_ec_ms_cm",
  "reservoir_ph",
];

const KNOWN_METRICS: ReadonlySet<string> = new Set(DISPLAY_ORDER);

function toFiniteNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function toValidTimestamp(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const t = v instanceof Date ? v.getTime() : new Date(String(v)).getTime();
  if (!Number.isFinite(t)) return null;
  // Reject obviously bogus / far-future timestamps (> 1 year ahead).
  const cap = Date.now() + 365 * 24 * 60 * 60 * 1000;
  if (t > cap) return null;
  return t;
}

function celsiusToFahrenheit(c: number): number {
  return c * (9 / 5) + 32;
}

/**
 * Group long-format manual readings into snapshots keyed by `ts`. Only
 * rows with source = "manual" are considered. Returns latest-first.
 */
export function groupManualReadingsToSnapshots(
  rows: ReadonlyArray<ChangeContextReading>,
  opts: { tentId?: string | null } = {},
): ChangeContextSnapshot[] {
  const buckets = new Map<string, ChangeContextSnapshot>();
  for (const r of rows) {
    if (r.source !== "manual") continue;
    if (opts.tentId && r.tent_id && r.tent_id !== opts.tentId) continue;
    if (!KNOWN_METRICS.has(r.metric)) continue;
    const t = toValidTimestamp(r.ts);
    if (t === null) continue;
    const v = toFiniteNumber(r.value);
    if (v === null) continue;
    const key = new Date(t).toISOString();
    const snap = buckets.get(key) ?? { ts: key, metrics: {} };
    // First-write-wins per metric per snapshot — sensor_readings stores
    // one row per metric so duplicates would only come from upstream noise.
    if (snap.metrics[r.metric as ChangeContextMetric] === undefined) {
      snap.metrics[r.metric as ChangeContextMetric] = v;
    }
    buckets.set(key, snap);
  }
  return [...buckets.values()].sort(
    (a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime(),
  );
}

function formatDelta(key: ChangeContextMetric, latest: number, previous: number): ChangeContextDelta | null {
  let delta: number;
  let label: string;
  let formatted: string;
  switch (key) {
    case "temperature_c": {
      // Stored in °C, displayed in °F to match the rest of the grow UI.
      const dF = celsiusToFahrenheit(latest) - celsiusToFahrenheit(previous);
      delta = Math.round(dF * 10) / 10;
      label = "Temp";
      formatted = `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}°F`;
      break;
    }
    case "humidity_pct": {
      delta = Math.round((latest - previous) * 10) / 10;
      label = "RH";
      formatted = `${delta >= 0 ? "+" : ""}${delta.toFixed(0)}%`;
      break;
    }
    case "vpd_kpa": {
      delta = Math.round((latest - previous) * 100) / 100;
      label = "VPD";
      formatted = `${delta >= 0 ? "+" : ""}${delta.toFixed(2)} kPa`;
      break;
    }
    case "co2_ppm": {
      delta = Math.round(latest - previous);
      label = "CO₂";
      formatted = `${delta >= 0 ? "+" : ""}${delta} ppm`;
      break;
    }
    case "soil_moisture_pct": {
      delta = Math.round((latest - previous) * 10) / 10;
      label = "Soil";
      formatted = `${delta >= 0 ? "+" : ""}${delta.toFixed(0)}%`;
      break;
    }
    case "soil_ec_ms_cm": {
      delta = Math.round((latest - previous) * 100) / 100;
      label = "Soil EC";
      formatted = `${delta >= 0 ? "+" : ""}${delta.toFixed(2)} mS/cm`;
      break;
    }
    case "reservoir_ph": {
      delta = Math.round((latest - previous) * 100) / 100;
      label = "pH";
      formatted = `${delta >= 0 ? "+" : ""}${delta.toFixed(2)}`;
      break;
    }
  }
  if (!Number.isFinite(delta)) return null;
  const direction: ChangeContextDelta["direction"] =
    delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  return { key, label, delta, formatted, direction };
}

/**
 * Build the change-context summary between the latest snapshot and the
 * previous one. Either argument may be null. Returns `firstSnapshot=true`
 * when no comparable previous snapshot is available.
 */
export function buildManualSnapshotChangeContext(input: {
  latest: ChangeContextSnapshot | null | undefined;
  previous: ChangeContextSnapshot | null | undefined;
}): ChangeContextResult {
  const { latest, previous } = input;
  if (!latest) return { firstSnapshot: true, deltas: [] };
  if (!previous) return { firstSnapshot: true, deltas: [] };

  const deltas: ChangeContextDelta[] = [];
  for (const key of DISPLAY_ORDER) {
    const a = latest.metrics[key];
    const b = previous.metrics[key];
    if (a === undefined || b === undefined) continue;
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    const d = formatDelta(key, a, b);
    if (d) deltas.push(d);
  }
  return { firstSnapshot: false, deltas };
}

/**
 * Convenience: derive the change context directly from a list of long-form
 * sensor reading rows for a given tent.
 */
export function deriveChangeContextFromReadings(
  rows: ReadonlyArray<ChangeContextReading>,
  opts: { tentId?: string | null } = {},
): ChangeContextResult {
  const snapshots = groupManualReadingsToSnapshots(rows, opts);
  return buildManualSnapshotChangeContext({
    latest: snapshots[0] ?? null,
    previous: snapshots[1] ?? null,
  });
}
