/**
 * timelineSnapshotSummaryViewModel — pure presenter helper that turns a
 * generic, sanitized sensor snapshot input into a compact summary suitable
 * for the Quick Log timeline.
 *
 * Hard constraints (tests + static safety):
 *  - Pure: no I/O, no Supabase, no React, no timers, no globals, no model
 *    calls, no Action Queue writes, no automation, no device control.
 *  - Never invents readings. Missing metrics stay missing.
 *  - Never re-labels a snapshot. `manual`/`csv`/`demo`/`stale`/`invalid`
 *    can NEVER resolve to "Live."
 *  - Demo data is always non-healthy regardless of input.
 *  - Stale / invalid snapshots are always marked not-trustworthy.
 *  - Strips raw_payload, private IDs, vendor metadata beyond the optional
 *    vendor hint (e.g. "ecowitt") used by the existing source-label rule
 *    to promote a `live` reading's badge wording.
 *
 * This helper is the single boundary the timeline presenter should use
 * when a snapshot of any provenance becomes available. It does not wire
 * any new write/read path — wiring lives in callers.
 */

import {
  resolveSensorSourceLabel,
  type ResolvedSourceLabel,
} from "@/lib/sensorSourceLabelRules";
import {
  evaluateManualSensorSnapshotQuality,
  type ManualSensorSnapshotInput,
  type ManualSensorSnapshotQuality,
} from "@/lib/manualSensorSnapshotQualityRules";
import type { SensorReadingSource } from "@/mock";
import {
  SENSOR_FIELD_LABELS,
  type SensorFieldKey,
} from "@/constants/sensorFields";

/** Canonical metric keys allowed in a timeline snapshot summary. */
export type TimelineSnapshotMetricKey = SensorFieldKey;

const METRIC_UNIT: Record<TimelineSnapshotMetricKey, string> = {
  air_temp_c: "°C",
  humidity_pct: "%",
  vpd_kpa: "kPa",
  co2_ppm: "ppm",
  soil_moisture_pct: "%",
  soil_temp_c: "°C",
  soil_ec_mscm: "mS/cm",
  reservoir_ph: "pH",
  reservoir_ec_mscm: "mS/cm",
  ppfd: "µmol·m⁻²·s⁻¹",
};

/**
 * Stable rendering order — most loop-relevant first (air/VPD, then root
 * zone, then enrichment, then reservoir). Mobile cards rely on this order
 * to keep the first row meaningful when wrapped.
 */
const METRIC_ORDER: ReadonlyArray<TimelineSnapshotMetricKey> = [
  "air_temp_c",
  "humidity_pct",
  "vpd_kpa",
  "soil_moisture_pct",
  "soil_temp_c",
  "soil_ec_mscm",
  "co2_ppm",
  "ppfd",
  "reservoir_ec_mscm",
  "reservoir_ph",
];

/** Quality-rule field names → timeline metric keys (for warnings/invalid). */
const QUALITY_FIELD_TO_METRIC: Readonly<
  Record<string, TimelineSnapshotMetricKey>
> = {
  temperature_c: "air_temp_c",
  humidity_pct: "humidity_pct",
  vpd_kpa: "vpd_kpa",
  soil_temp_c: "soil_temp_c",
  soil_moisture_pct: "soil_moisture_pct",
  soil_ec_mscm: "soil_ec_mscm",
  ph: "reservoir_ph",
};

/** Timeline metric key → quality-rule field name (for input forwarding). */
const METRIC_TO_QUALITY_FIELD: Partial<
  Record<TimelineSnapshotMetricKey, keyof ManualSensorSnapshotInput>
> = {
  air_temp_c: "temperature_c",
  humidity_pct: "humidity_pct",
  vpd_kpa: "vpd_kpa",
  soil_temp_c: "soil_temp_c",
  soil_moisture_pct: "soil_moisture_pct",
  soil_ec_mscm: "soil_ec_mscm",
  reservoir_ph: "ph",
};

export interface TimelineSnapshotInput {
  readonly source: SensorReadingSource | null | undefined;
  readonly capturedAt?: string | number | Date | null;
  /**
   * Optional hardware vendor lineage tag — only used to re-label a
   * `live` badge (e.g. "Ecowitt"). Demo/manual/csv/stale/invalid are
   * never re-labeled regardless of vendor.
   */
  readonly vendor?: string | null;
  readonly metrics?: Partial<Record<TimelineSnapshotMetricKey, number | null | undefined>>;
}

export interface TimelineSnapshotMetricCell {
  readonly key: TimelineSnapshotMetricKey;
  readonly label: string;
  readonly value: number;
  readonly unit: string;
  /** True when this metric tripped a quality-rule check (suspicious). */
  readonly suspicious: boolean;
}

export type TimelineSnapshotSeverity = "ok" | "warning" | "invalid";

export interface TimelineSnapshotSummary {
  /** Canonical source enum, never re-labeled. */
  readonly source: SensorReadingSource | "unknown";
  /** Resolved user-facing source label (e.g. "Manual", "Live", "Ecowitt"). */
  readonly sourceLabel: string;
  readonly sourceResolved: ResolvedSourceLabel;
  /** ISO timestamp if parseable; otherwise null. Never invented. */
  readonly capturedAtIso: string | null;
  /** True only when source/quality both say the snapshot is trustworthy. */
  readonly trustworthy: boolean;
  readonly severity: TimelineSnapshotSeverity;
  /** Underlying quality classification. */
  readonly quality: ManualSensorSnapshotQuality;
  /** Ordered, present-only metrics with units. */
  readonly metrics: ReadonlyArray<TimelineSnapshotMetricCell>;
  /** Human-readable warnings from the quality rules, deduplicated. */
  readonly warnings: ReadonlyArray<string>;
}

function normalizeIso(v: TimelineSnapshotInput["capturedAt"]): string | null {
  if (v == null) return null;
  if (v instanceof Date) {
    const t = v.getTime();
    return Number.isFinite(t) ? new Date(t).toISOString() : null;
  }
  if (typeof v === "number") {
    return Number.isFinite(v) ? new Date(v).toISOString() : null;
  }
  if (typeof v === "string") {
    const t = Date.parse(v);
    return Number.isFinite(t) ? new Date(t).toISOString() : null;
  }
  return null;
}

function normalizeSourceEnum(
  s: SensorReadingSource | null | undefined,
): SensorReadingSource | "unknown" {
  if (
    s === "live" ||
    s === "manual" ||
    s === "csv" ||
    s === "demo" ||
    s === "stale" ||
    s === "invalid"
  ) {
    return s;
  }
  return "unknown";
}

/**
 * Build a sanitized compact summary for the timeline.
 *
 * Strict allow-list: only well-known numeric metrics are forwarded; raw
 * payloads, vendor metadata, tokens, filenames, private IDs are never
 * read. Vendor hint is forwarded only to the existing label rule, which
 * never promotes non-live sources.
 */
export function buildTimelineSnapshotSummary(
  input: TimelineSnapshotInput | null | undefined,
): TimelineSnapshotSummary {
  const source = normalizeSourceEnum(input?.source ?? null);
  const sourceResolved = resolveSensorSourceLabel({
    source: source === "unknown" ? null : source,
    vendor: input?.vendor ?? null,
  });
  const capturedAtIso = normalizeIso(input?.capturedAt ?? null);

  const cells: TimelineSnapshotMetricCell[] = [];
  const qualityFields: Partial<ManualSensorSnapshotInput> = {};

  for (const key of METRIC_ORDER) {
    const raw = input?.metrics?.[key];
    if (typeof raw !== "number" || !Number.isFinite(raw)) continue;
    const qField = METRIC_TO_QUALITY_FIELD[key];
    if (qField) {
      (qualityFields as Record<string, number>)[qField] = raw;
    }
  }

  const quality = evaluateManualSensorSnapshotQuality(
    {
      source: source === "unknown" ? null : source,
      captured_at: capturedAtIso,
      ...qualityFields,
    },
    { mode: "historical" },
  );

  const suspiciousMetrics = new Set<TimelineSnapshotMetricKey>();
  for (const f of quality.invalidFields) {
    const mapped = QUALITY_FIELD_TO_METRIC[f];
    if (mapped) suspiciousMetrics.add(mapped);
  }

  for (const key of METRIC_ORDER) {
    const raw = input?.metrics?.[key];
    if (typeof raw !== "number" || !Number.isFinite(raw)) continue;
    cells.push({
      key,
      label: SENSOR_FIELD_LABELS[key],
      value: raw,
      unit: METRIC_UNIT[key],
      suspicious: suspiciousMetrics.has(key),
    });
  }

  // Severity:
  //  - invalid quality OR source === "invalid" → invalid
  //  - source === "stale" OR source === "demo" OR quality === "needs_review"
  //    OR quality === "missing" → warning
  //  - otherwise → ok
  let severity: TimelineSnapshotSeverity;
  if (quality.quality === "invalid" || source === "invalid") {
    severity = "invalid";
  } else if (
    source === "stale" ||
    source === "demo" ||
    quality.quality === "needs_review" ||
    quality.quality === "missing"
  ) {
    severity = "warning";
  } else {
    severity = "ok";
  }

  // Trustworthy ONLY when:
  //  - source is live or manual (csv/demo/stale/invalid/unknown are not)
  //  - severity is ok
  const trustworthy =
    severity === "ok" && (source === "live" || source === "manual");

  // Dedup warnings into stable order.
  const seen = new Set<string>();
  const warnings: string[] = [];
  for (const w of quality.reasons) {
    if (!seen.has(w)) {
      seen.add(w);
      warnings.push(w);
    }
  }

  return {
    source,
    sourceLabel: sourceResolved.label,
    sourceResolved,
    capturedAtIso,
    trustworthy,
    severity,
    quality,
    metrics: Object.freeze(cells),
    warnings: Object.freeze(warnings),
  };
}

/**
 * Helper: is there any usable metric in the summary? Used by presenters
 * to decide whether to render the metric grid or fall through to the
 * neutral "No sensor snapshot attached" empty state.
 */
export function timelineSnapshotHasAnyMetric(
  summary: TimelineSnapshotSummary,
): boolean {
  return summary.metrics.length > 0;
}
