/**
 * quickLogSensorSnapshotValidation — pure validator for sensor snapshot
 * payloads embedded by the Quick Log writer.
 *
 * Hard rules (Verdant sensor-truth):
 *   - Pure: no I/O, no Supabase, no React, no time, no randomness.
 *   - Never invents readings. Absent telemetry → `{ ok: true, snapshot: null }`.
 *   - Invalid telemetry (bad shape, bad date, non-finite metric, unsupported
 *     value type, missing provenance with metrics present) → `{ ok: false }`.
 *   - `source` and `captured_at` are preserved verbatim. We never coerce to
 *     "live" / "manual" / "csv" / "demo".
 *
 * Contract:
 *   - `null` / `undefined` input → no snapshot (absent, not invalid).
 *   - `{ metrics: {} }` with empty object → no snapshot, even if source /
 *     captured_at are supplied. Empty metrics is "absent", not a snapshot.
 *   - Any usable metric requires BOTH a non-empty `source` string AND a
 *     parseable `captured_at` ISO timestamp.
 *   - Metric values may be `number` (finite) or numeric strings that parse
 *     to finite numbers. Booleans, objects, arrays, null, NaN, Infinity,
 *     and unparseable strings → reject.
 */

import type { QuickLogSensorSnapshot } from "./createQuickLogEvent";

export type QuickLogSnapshotValidation =
  | { ok: true; snapshot: QuickLogSensorSnapshot | null }
  | { ok: false; error: string };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function isValidIsoDate(v: unknown): v is string {
  if (typeof v !== "string" || v.trim().length === 0) return false;
  const t = Date.parse(v);
  return Number.isFinite(t);
}

/**
 * Validate and normalize a sensor snapshot payload prior to embedding in a
 * Quick Log diary companion row.
 */
export function validateQuickLogSensorSnapshot(
  raw: unknown,
): QuickLogSnapshotValidation {
  if (raw === null || raw === undefined) {
    return { ok: true, snapshot: null };
  }
  if (!isPlainObject(raw)) {
    return { ok: false, error: "Sensor snapshot must be an object" };
  }

  const metricsRaw = raw.metrics;
  if (metricsRaw === undefined || metricsRaw === null) {
    return { ok: false, error: "Sensor snapshot is missing metrics payload" };
  }
  if (!isPlainObject(metricsRaw)) {
    return { ok: false, error: "Sensor snapshot metrics must be an object" };
  }

  // Empty metrics object → treat as absent, not invalid. Never embed an
  // empty snapshot.
  if (Object.keys(metricsRaw).length === 0) {
    return { ok: true, snapshot: null };
  }

  const metrics: Record<string, number> = {};
  for (const [k, v] of Object.entries(metricsRaw)) {
    if (typeof v === "number") {
      if (!Number.isFinite(v)) {
        return {
          ok: false,
          error: `Sensor metric "${k}" is not a finite number`,
        };
      }
      metrics[k] = v;
      continue;
    }
    // Strict reject: only number is supported. Numeric strings, booleans,
    // null, objects, arrays all fail validation rather than being coerced —
    // the writer is responsible for normalizing before validation.
    return {
      ok: false,
      error: `Sensor metric "${k}" has unsupported value type`,
    };
  }

  const source = raw.source;
  if (typeof source !== "string" || source.trim().length === 0) {
    return {
      ok: false,
      error: "Sensor snapshot with metrics requires a non-empty source",
    };
  }

  const capturedAt = raw.captured_at;
  if (!isValidIsoDate(capturedAt)) {
    return {
      ok: false,
      error: "Sensor snapshot with metrics requires a valid captured_at",
    };
  }

  return {
    ok: true,
    snapshot: {
      // Preserve verbatim — never coerced/relabeled.
      source,
      captured_at: capturedAt,
      metrics,
    },
  };
}
