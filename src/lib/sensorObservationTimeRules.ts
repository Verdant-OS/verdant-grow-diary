/**
 * Resolve the time a sensor observation was actually captured.
 *
 * CSV imports retain their historical `captured_at` while database `ts` can
 * be the import time. Consumers must use this helper for grouping, freshness,
 * latest-snapshot selection, and trend windows so historical rows never turn
 * into apparent fresh telemetry.
 */
export interface SensorObservationTimeLike {
  ts?: unknown;
  captured_at?: unknown;
  capturedAt?: unknown;
}

function nonEmptyTimestamp(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function resolveSensorObservationTime(row: SensorObservationTimeLike): string | null {
  return (
    nonEmptyTimestamp(row.captured_at) ??
    nonEmptyTimestamp(row.capturedAt) ??
    nonEmptyTimestamp(row.ts)
  );
}
