/**
 * sensorTruthCanon — source-aware current-state freshness for Sensor Truth.
 *
 * Implements docs/data-labeling-spec.md §Staleness thresholds and
 * docs/sensor-truth-rules.md §4:
 *   - Live → stale after 15 minutes
 *   - Manual current-context → stale after 24 hours
 *
 * Pure module: no I/O, no React, no Supabase, no Date.now() inside resolvers
 * when `now` is injected. Never invents readings. Never promotes csv/demo/
 * invalid to live. Bad/unknown provenance uses the strict live window so
 * untrusted data cannot linger as "current".
 *
 * Consuming surfaces should call {@link isCurrentStateStale} when a source
 * label is available. The flat {@link LIVE_CURRENT_STATE_STALE_MS} default is
 * only for callers that have age but no provenance.
 */

import {
  MANUAL_SNAPSHOT_CURRENT_STALE_HOURS,
  SENSOR_FRESH_WINDOW_MINUTES,
  SENSOR_SNAPSHOT_STALE_THRESHOLD_MS,
} from "@/constants/sensorTiming";
import { LIVE_WINDOW_ALIASES } from "@/lib/sensorLiveMembership";

/** Live current-state window (15 minutes). */
export const LIVE_CURRENT_STATE_STALE_MS = SENSOR_SNAPSHOT_STALE_THRESHOLD_MS;

/** Manual current-context window (24 hours). */
export const MANUAL_CURRENT_STATE_STALE_MS = MANUAL_SNAPSHOT_CURRENT_STALE_HOURS * 60 * 60 * 1000;

/** Live window in minutes (for operator-facing copy). */
export const LIVE_CURRENT_STATE_STALE_MINUTES = SENSOR_FRESH_WINDOW_MINUTES;

/** Manual window in hours (for operator-facing copy). */
export const MANUAL_CURRENT_STATE_STALE_HOURS = MANUAL_SNAPSHOT_CURRENT_STALE_HOURS;

/**
 * Grower-facing freshness window label. Source-aware surfaces should prefer
 * per-source copy; this string is the shared short form.
 */
export const CURRENT_STATE_FRESHNESS_WINDOW_LABEL = `${LIVE_CURRENT_STATE_STALE_MINUTES}-minute live / ${MANUAL_CURRENT_STATE_STALE_HOURS}-hour manual`;

export type CurrentStateSourceKind =
  | "live"
  | "manual"
  | "csv"
  | "demo"
  | "stale"
  | "invalid"
  | "diary"
  | "sim"
  | "unverified"
  | "unavailable"
  | "unknown";

const LIVE_ALIASES = LIVE_WINDOW_ALIASES;

const MANUAL_ALIASES = new Set([
  "manual",
  "manual_snapshot",
  "manual_quick_log",
  "diary",
  "quick_log",
  "quicklog",
]);

/**
 * Normalize a raw source string into a coarse kind used for window selection.
 * Classification-only — never upgrades unknown → live.
 */
export function classifyCurrentStateSource(source?: string | null): CurrentStateSourceKind {
  if (source == null) return "unknown";
  const raw = String(source).trim().toLowerCase();
  if (!raw) return "unknown";
  if (raw === "csv" || raw === "imported" || raw === "import") return "csv";
  if (raw === "demo" || raw === "fixture" || raw === "mock" || raw === "sim") {
    return raw === "sim" ? "sim" : "demo";
  }
  if (raw === "stale") return "stale";
  if (raw === "invalid") return "invalid";
  if (raw === "unavailable") return "unavailable";
  if (raw === "unverified" || raw === "unknown")
    return raw === "unverified" ? "unverified" : "unknown";
  if (MANUAL_ALIASES.has(raw)) return raw === "diary" ? "diary" : "manual";
  if (LIVE_ALIASES.has(raw)) return "live";
  // Unrecognized vendor strings are not live proof.
  return "unknown";
}

/**
 * Resolve the current-state stale window for a provenance label.
 *
 *  - live (+ live transport aliases) → 15 minutes
 *  - manual / diary → 24 hours
 *  - csv / demo / sim / stale / invalid / unverified / unknown → live window
 *    (strict; never linger as healthy current state)
 *  - missing source → live window (same strict default)
 */
export function resolveCurrentStateStaleWindowMs(source?: string | null): number {
  const kind = classifyCurrentStateSource(source);
  if (kind === "manual" || kind === "diary") return MANUAL_CURRENT_STATE_STALE_MS;
  return LIVE_CURRENT_STATE_STALE_MS;
}

export interface IsCurrentStateStaleOptions {
  /** Injected clock (ms). Defaults to Date.now() when omitted. */
  now?: number;
  /** Provenance label used to pick the live vs manual window. */
  source?: string | null;
  /**
   * Explicit threshold override. When set, source-based resolution is skipped
   * so callers/tests can pin a window without inventing a source.
   */
  thresholdMs?: number;
}

/**
 * True when `capturedAt` is older than the source-aware current-state window.
 *
 * Missing / unparseable timestamps return false here (callers that need
 * "missing timestamp ⇒ invalid" use the badge / quality resolvers). Future
 * timestamps are never treated as stale by age alone.
 */
export function isCurrentStateStale(
  capturedAt: string | null | undefined,
  options: IsCurrentStateStaleOptions = {},
): boolean {
  if (capturedAt == null || capturedAt === "") return false;
  const t = new Date(capturedAt).getTime();
  if (!Number.isFinite(t)) return false;
  const now = options.now ?? Date.now();
  const threshold =
    typeof options.thresholdMs === "number" &&
    Number.isFinite(options.thresholdMs) &&
    options.thresholdMs >= 0
      ? options.thresholdMs
      : resolveCurrentStateStaleWindowMs(options.source);
  return now - t > threshold;
}

/**
 * Operator-facing age copy for the window that applied to this source.
 * Never claims a single universal minute window when source is known.
 */
export function describeCurrentStateStaleWindow(source?: string | null): string {
  const kind = classifyCurrentStateSource(source);
  if (kind === "manual" || kind === "diary") {
    return `older than ${MANUAL_CURRENT_STATE_STALE_HOURS} hours`;
  }
  return `older than ${LIVE_CURRENT_STATE_STALE_MINUTES} minutes`;
}
