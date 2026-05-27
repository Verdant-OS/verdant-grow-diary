/**
 * Pure presenter helpers for the Tent Detail "Sensor Source Health" card.
 *
 * Derives per-source last-received timestamp from existing sensor_readings
 * rows and marks any source not seen for >30 min as stale.
 *
 * No I/O, no React, no Supabase. Deterministic. No schema changes, no alerts.
 */
import { STALE_THRESHOLD_MS } from "@/lib/sensorSnapshot";
import { formatSensorSourceLabel } from "@/lib/manualSensorSourceLabel";

export interface SourceHealthEntry {
  /** Raw source value from the DB (e.g. "manual", "pi_bridge"). */
  source: string;
  /** Human-readable label for display. */
  label: string;
  /** ISO timestamp of the most recent reading from this source. */
  lastSeenAt: string;
  /** Whether `lastSeenAt` is older than the stale threshold. */
  stale: boolean;
}

export interface SensorSourceHealthView {
  /** Sorted list (freshest first) of per-source health entries. */
  sources: SourceHealthEntry[];
  /** True when at least one source exists (i.e. there are readings). */
  hasSources: boolean;
}

interface ReadingLike {
  ts: string;
  source?: string | null;
}

/**
 * Build the source health view from a list of sensor_readings rows
 * (already scoped to a single tent by the caller).
 *
 * @param rows - sensor_readings rows, typically ordered desc by `ts`.
 * @param now  - current time in ms (injectable for testing).
 */
export function buildSensorSourceHealthView(
  rows: ReadingLike[] | null | undefined,
  now: number = Date.now(),
): SensorSourceHealthView {
  if (!rows || rows.length === 0) {
    return { sources: [], hasSources: false };
  }

  // Collect the latest ts per unique source value.
  const latestBySource = new Map<string, string>();

  for (const r of rows) {
    const src = r.source ?? "unavailable";
    const existing = latestBySource.get(src);
    if (!existing || r.ts > existing) {
      latestBySource.set(src, r.ts);
    }
  }

  const entries: SourceHealthEntry[] = [];
  for (const [source, lastSeenAt] of latestBySource) {
    const t = new Date(lastSeenAt).getTime();
    const stale = Number.isFinite(t) ? now - t > STALE_THRESHOLD_MS : false;
    entries.push({
      source,
      label: formatSensorSourceLabel({ source }),
      lastSeenAt,
      stale,
    });
  }

  // Sort freshest first.
  entries.sort((a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime());

  return { sources: entries, hasSources: true };
}
