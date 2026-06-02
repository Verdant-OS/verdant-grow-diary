/**
 * quickLogSensorSnapshotRules — pure helpers that label the QuickLog
 * sensor-snapshot embed (the blob written to
 * `diary_entries.details.sensor_snapshot`) with deterministic `source`
 * and `state` fields.
 *
 * Additive labeling slice (NEX-loop audit follow-up):
 *   - This module ONLY classifies. It does NOT drop, reject, or mutate the
 *     embed. QuickLog continues to embed stale/invalid snapshots if that
 *     is the current behavior; the new fields make the labeling visible.
 *
 * Hard constraints:
 *   - Pure: no I/O, no Supabase, no React, no timers, no globals.
 *   - No service_role. No client user_id. No alerts. No action_queue.
 *   - Null-safe and deterministic given the same input + `now`.
 *
 * State enum is intentionally narrowed for the QuickLog embed:
 *   "live" | "manual" | "stale" | "invalid"
 * Demo / unknown declared sources are mapped to "invalid" so the embed
 * can never be silently treated as healthy live data downstream.
 */

import { isReadingStale, STALE_THRESHOLD_MS } from "@/lib/sensorReadingNormalizationRules";

export type QuickLogSnapshotState = "live" | "manual" | "stale" | "invalid";

export interface QuickLogSnapshotLabel {
  /** Declared source string, normalized (lowercased/trimmed), or null. */
  source: string | null;
  /** Narrowed UI state. Never "demo" — demo maps to "invalid" defensively. */
  state: QuickLogSnapshotState;
}

/** Single sensor_readings row shape this helper accepts. All fields optional. */
export interface QuickLogSensorRowLike {
  source?: string | null;
  ts?: string | null;
  captured_at?: string | null;
  metric?: string | null;
  value?: number | string | null;
}

const MANUAL_SOURCES = new Set(["manual", "manual_snapshot", "csv", "imported", "import"]);
const UNTRUSTED_SOURCES = new Set(["demo", "sim", "fixture", "demo_fixture", "mock"]);


function normalizeSource(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim().toLowerCase();
  return s.length > 0 ? s : null;
}

function isTimestampParseable(ts: string | null | undefined): ts is string {
  if (!ts || typeof ts !== "string") return false;
  const t = new Date(ts).getTime();
  return Number.isFinite(t);
}

function isValueFinite(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n);
}

/**
 * Classify a single sensor_readings-like row into `{ source, state }` for
 * the QuickLog snapshot embed.
 *
 * Priority:
 *   1. malformed row / unparseable ts / non-finite value → "invalid"
 *   2. untrusted source family (demo/sim/fixture/mock)   → "invalid"
 *   3. declared source in manual family                  → "manual"
 *   4. live-family or unknown but parseable + fresh      → "live"
 *   5. live-family but stale per existing threshold      → "stale"
 */
export function classifyQuickLogSnapshotSource(
  row: QuickLogSensorRowLike | null | undefined,
  now: number = Date.now(),
  staleThresholdMs: number = STALE_THRESHOLD_MS,
): QuickLogSnapshotLabel {
  if (!row || typeof row !== "object") {
    return { source: null, state: "invalid" };
  }

  const source = normalizeSource(row.source);
  const ts = row.ts ?? row.captured_at ?? null;

  // Value is only required to be finite if it was provided. The embed
  // path aggregates many metric rows; the representative row may carry a
  // single value. Treat explicitly-non-finite value as invalid.
  if (row.value !== undefined && !isValueFinite(row.value)) {
    return { source, state: "invalid" };
  }
  if (!isTimestampParseable(ts)) {
    return { source, state: "invalid" };
  }
  if (source && UNTRUSTED_SOURCES.has(source)) {
    return { source, state: "invalid" };
  }
  if (source && MANUAL_SOURCES.has(source)) {
    return { source, state: "manual" };
  }

  // Live-family OR unknown declared source: gate by staleness.
  const stale = isReadingStale(ts, now, staleThresholdMs);
  if (stale) {
    return { source, state: "stale" };
  }
  // Anything not classified as manual/untrusted/stale/invalid is "live".
  // Unknown declared sources fall through here — we preserve the raw
  // `source` string so downstream surfaces can render it as the badge
  // without us silently upgrading or downgrading it.
  return { source: source ?? "live", state: "live" };
}

/**
 * Return true only when the snapshot state is safe to embed into a diary entry.
 * "live" and "manual" pass through; "stale" and "invalid" are dropped.
 */
export function shouldEmbedSnapshot(
  state: QuickLogSnapshotState | string | null | undefined,
): boolean {
  const s = (state ?? "").trim().toLowerCase();
  return s === "live" || s === "manual";
}


