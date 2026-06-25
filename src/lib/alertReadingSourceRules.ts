/**
 * alertReadingSourceRules — pure helper that derives the underlying
 * sensor reading source for an alert, when discoverable. Returns null
 * when no signal is available so the UI can omit the badge instead of
 * defaulting to a misleading "Unknown" chip.
 *
 * Sources of truth (in priority order):
 *   1. `alert.source` exactly matches a SensorReadingSource enum value
 *      ("live" | "manual" | "csv" | "demo" | "stale" | "invalid").
 *   2. `alert.reason` contains a `[source:<value>]` lineage tag with one
 *      of the recognised values.
 *
 * Hard constraints:
 *   - Pure. No I/O. No React. No timers.
 *   - Never invents a source. Unknown stays unknown (returns null).
 *   - Manual is never promoted to live (the matcher is exact).
 */
import type { SensorReadingSource } from "@/mock";

const SENSOR_READING_SOURCES: ReadonlySet<SensorReadingSource> = new Set([
  "live",
  "manual",
  "csv",
  "demo",
  "stale",
  "invalid",
]);

interface AlertLikeForSource {
  source?: string | null;
  reason?: string | null;
}

const SOURCE_TAG_RE = /\[source:([a-z]+)\]/i;

export function deriveAlertReadingSource(
  alert: AlertLikeForSource | null | undefined,
): SensorReadingSource | null {
  if (!alert) return null;
  const direct = (alert.source ?? "").trim().toLowerCase();
  if (SENSOR_READING_SOURCES.has(direct as SensorReadingSource)) {
    return direct as SensorReadingSource;
  }
  const reason = alert.reason ?? "";
  const m = reason.match(SOURCE_TAG_RE);
  if (m) {
    const tagged = m[1].toLowerCase();
    if (SENSOR_READING_SOURCES.has(tagged as SensorReadingSource)) {
      return tagged as SensorReadingSource;
    }
  }
  return null;
}
