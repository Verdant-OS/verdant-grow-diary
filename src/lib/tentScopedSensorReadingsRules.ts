/**
 * Pure helpers for reading sensor evidence through per-tent windows instead
 * of one unscoped "all tents" read.
 *
 * The unscoped `sensor_readings_effective` read orders every row the viewer
 * can see by `captured_at` with no tent predicate. In production it exceeded
 * the Postgres statement timeout (`57014`) on the Plants page and Dashboard,
 * while a tent-scoped read over the same view returned in tens of
 * milliseconds (QA 2026-09-24, BUG-003). A tent predicate lets the
 * `(user_id, tent_id, captured_at DESC)` index bound each read.
 *
 * Hard constraints:
 *  - Pure: no React, no Supabase, no clock.
 *  - Deterministic: stable ordering with explicit tie-breakers.
 *  - Sensor truth: a tent whose read is pending or failed never contributes
 *    an "empty" window; the merged result is withheld until every tent in
 *    scope has data.
 */
import { isUuid } from "@/lib/isUuid";

/**
 * `null` means the caller's scope is not resolved yet (its tents or plants are
 * still loading). An array (possibly empty) is a resolved scope: only UUID ids
 * are kept, de-duplicated and sorted so query keys are stable.
 */
export function normalizeSensorReadingTentScope(
  tentIds: readonly (string | null | undefined)[] | null | undefined,
): string[] | null {
  if (tentIds == null) return null;
  const ids = new Set<string>();
  for (const id of tentIds) {
    if (typeof id === "string" && isUuid(id)) ids.add(id);
  }
  return Array.from(ids).sort();
}

export interface TentScopedSensorRowLike {
  id?: string | null;
  captured_at?: string | null;
  ts?: string | null;
  created_at?: string | null;
}

function timeValue(value: string | null | undefined): number | null {
  if (typeof value !== "string") return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/** Descending by time; null/unparseable values sort last. */
function compareDesc(a: string | null | undefined, b: string | null | undefined): number {
  const av = timeValue(a);
  const bv = timeValue(b);
  if (av === bv) return 0;
  if (av === null) return 1;
  if (bv === null) return -1;
  return bv - av;
}

/**
 * Same ordering the unscoped read requested from PostgREST
 * (`captured_at DESC NULLS LAST, ts DESC, created_at DESC`), plus `id` as a
 * final tie-breaker so equal timestamps never reorder between renders.
 */
export function compareTentScopedSensorRows(
  a: TentScopedSensorRowLike,
  b: TentScopedSensorRowLike,
): number {
  return (
    compareDesc(a.captured_at, b.captured_at) ||
    compareDesc(a.ts, b.ts) ||
    compareDesc(a.created_at, b.created_at) ||
    String(a.id ?? "").localeCompare(String(b.id ?? ""))
  );
}

/**
 * Merge per-tent windows into one newest-first list. Each tent keeps its own
 * bounded window, so a busy tent cannot crowd another tent out of the result.
 */
export function mergeTentScopedSensorReadings<T extends TentScopedSensorRowLike>(
  windows: readonly (readonly T[])[],
): T[] {
  const merged: T[] = [];
  for (const window of windows) merged.push(...window);
  return merged.sort(compareTentScopedSensorRows);
}

export type TentScopedReadStatus = "pending" | "error" | "success";

export interface TentScopedWindowState<T> {
  data: readonly T[] | undefined;
  isPending: boolean;
  isError: boolean;
}

/**
 * Combine per-tent window states. An unresolved scope is pending. Any failed
 * window makes the combined read an error; merged data is exposed only when
 * every window in scope has data (a background refresh error keeps the last
 * complete data, as a single query would).
 */
export function combineTentScopedSensorWindows<T extends TentScopedSensorRowLike>(
  scope: readonly string[] | null,
  windows: readonly TentScopedWindowState<T>[],
): { status: TentScopedReadStatus; data: T[] | undefined } {
  if (scope === null) return { status: "pending", data: undefined };
  const allHaveData = windows.every((w) => w.data !== undefined);
  const data = allHaveData
    ? mergeTentScopedSensorReadings(windows.map((w) => w.data as readonly T[]))
    : undefined;
  if (windows.some((w) => w.isError)) return { status: "error", data };
  if (!allHaveData || windows.some((w) => w.isPending)) {
    return { status: "pending", data: undefined };
  }
  return { status: "success", data };
}
