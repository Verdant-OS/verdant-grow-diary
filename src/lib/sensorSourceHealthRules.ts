/**
 * Pure helpers for Sensor Source Health card.
 *
 * Groups sensor_readings rows by source label, computes last-received
 * timestamps, relative age, and active/stale status per source.
 *
 * Presenter only — read-only derivations. No I/O, no writes, no alerts,
 * no Action Queue, no device control.
 */

/** Stale threshold: 30 minutes in milliseconds. */
export const STALE_THRESHOLD_MS = 30 * 60 * 1000;

export type SourceStatus = "active" | "stale" | "no_recent_data";

export interface SensorSourceSummary {
  /** The source label (e.g. "manual", "webhook_generic", "esp32_dht22"). */
  sourceLabel: string;
  /** ISO timestamp of the most recent reading from this source. */
  lastReceivedAt: string;
  /** Milliseconds elapsed since lastReceivedAt relative to `now`. */
  ageMs: number;
  /** Distinct metric names seen from this source. */
  metrics: string[];
  /** Computed status based on age vs threshold. */
  status: SourceStatus;
}

export interface SensorReadingInput {
  source?: string | null;
  ts?: string | null;
  metric?: string | null;
}

/**
 * Parse a timestamp string to epoch ms.
 * Returns null for missing/invalid/non-finite values.
 */
export function parseTimestamp(ts: string | null | undefined): number | null {
  if (!ts) return null;
  const t = new Date(ts).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * Determine source status from age in milliseconds.
 */
export function computeSourceStatus(
  ageMs: number | null,
  thresholdMs: number = STALE_THRESHOLD_MS,
): SourceStatus {
  if (ageMs === null) return "no_recent_data";
  return ageMs > thresholdMs ? "stale" : "active";
}

/**
 * Group sensor readings by source label and compute per-source health summary.
 *
 * @param readings - Array of sensor reading rows (only source, ts, metric used).
 * @param now - Reference timestamp in ms (defaults to Date.now()).
 * @returns Sorted array of SensorSourceSummary.
 */
export function groupReadingsBySource(
  readings: SensorReadingInput[],
  now: number = Date.now(),
): SensorSourceSummary[] {
  if (!readings || readings.length === 0) return [];

  const map = new Map<string, { latestMs: number; latestIso: string; metrics: Set<string> }>();

  for (const r of readings) {
    const source = r.source || "unknown";
    const tsMs = parseTimestamp(r.ts);
    if (tsMs === null) continue;

    const existing = map.get(source);
    if (!existing) {
      map.set(source, {
        latestMs: tsMs,
        latestIso: r.ts!,
        metrics: new Set(r.metric ? [r.metric] : []),
      });
    } else {
      if (tsMs > existing.latestMs) {
        existing.latestMs = tsMs;
        existing.latestIso = r.ts!;
      }
      if (r.metric) existing.metrics.add(r.metric);
    }
  }

  const summaries: SensorSourceSummary[] = [];
  for (const [sourceLabel, entry] of map) {
    const ageMs = now - entry.latestMs;
    summaries.push({
      sourceLabel,
      lastReceivedAt: entry.latestIso,
      ageMs,
      metrics: [...entry.metrics].sort(),
      status: computeSourceStatus(ageMs),
    });
  }

  return sortSourceSummaries(summaries);
}

/**
 * Deterministic sort: active first, then stale, then no_recent_data.
 * Within the same status, sort by source label lexically.
 */
export function sortSourceSummaries(summaries: SensorSourceSummary[]): SensorSourceSummary[] {
  const statusOrder: Record<SourceStatus, number> = {
    active: 0,
    stale: 1,
    no_recent_data: 2,
  };
  return [...summaries].sort((a, b) => {
    const so = statusOrder[a.status] - statusOrder[b.status];
    if (so !== 0) return so;
    return a.sourceLabel.localeCompare(b.sourceLabel);
  });
}
