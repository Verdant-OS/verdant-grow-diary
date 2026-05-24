/**
 * Pure rules for Daily Grow Check freshness wiring.
 *
 * Daily Grow Check checked-today status on both Dashboard and Plant Detail
 * is derived from two read paths:
 *
 *   - plant QuickLogs (diary_entries)
 *   - current-tent manual sensor snapshots (sensor_readings)
 *
 * QuickLog already invalidates `diary_entries` after a successful insert and
 * the manual sensor reading hooks already invalidate `sensor_readings`. This
 * module centralizes the *consumer-side* contract: when the cross-component
 * `verdant:entry-created` event fires, the Daily Grow Check surfaces must
 * recompute against the same two read paths — never inventing a local
 * checked state that is not backed by real data.
 *
 * No persistence. No writes. No RPC. No background jobs. No device control.
 */

/** Window event QuickLog dispatches after a successful diary insert. */
export const ENTRY_CREATED_EVENT = "verdant:entry-created";

/**
 * Window event the manual sensor reading hooks dispatch after a
 * successful insert. Daily Grow Check surfaces listen for this in
 * addition to `verdant:entry-created` so a manual snapshot also counts
 * as today's check and refreshes the same caches.
 *
 * Detail shape: `{ createdAt?: string; tentId?: string }`. Listeners
 * must tolerate a missing detail.
 */
export const SENSOR_READING_CREATED_EVENT = "verdant:sensor-reading-created";

/** Every cross-component success event that counts as a Daily Grow Check. */
export const DAILY_CHECK_SUCCESS_EVENTS: ReadonlyArray<string> = [
  ENTRY_CREATED_EVENT,
  SENSOR_READING_CREATED_EVENT,
];

/**
 * React Query keys that back Daily Grow Check checked-today derivations.
 *
 * Listed as plain prefix keys so callers can invalidate by prefix and pick
 * up every variant (e.g. tent-scoped sensor reading queries).
 */
export const DAILY_CHECK_REFRESH_QUERY_KEYS: ReadonlyArray<ReadonlyArray<string>> = [
  ["diary_entries"],
  ["sensor_readings"],
];

export interface DailyCheckRefreshClient {
  invalidateQueries: (args: { queryKey: ReadonlyArray<string> }) => unknown;
}

/**
 * Invalidate every Daily Grow Check freshness query in one place so the
 * Dashboard panel and Plant Detail consistency card cannot drift apart.
 */
export function refreshDailyCheckQueries(client: DailyCheckRefreshClient): void {
  for (const key of DAILY_CHECK_REFRESH_QUERY_KEYS) {
    client.invalidateQueries({ queryKey: key });
  }
}
