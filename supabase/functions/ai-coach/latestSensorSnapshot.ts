/**
 * pickLatestSensorSnapshotByCapturedAt — pure, deterministic selector
 * for the freshest sensor snapshot embedded in a list of diary-style
 * rows.
 *
 * Rules:
 *   - Looks for `row.details.sensor_snapshot` (plain object) on each row.
 *   - Picks the snapshot with the freshest VALID `captured_at`
 *     timestamp (also accepts `capturedAt`, `timestamp`, `ts`, `time`).
 *   - A snapshot with a missing or invalid `captured_at` CANNOT outrank
 *     a snapshot with a valid timestamp.
 *   - If no snapshot has a valid timestamp, returns the first snapshot
 *     encountered (preserves prior fallback behavior).
 *   - Returns `null` when no snapshot is present at all.
 *   - Pure: no I/O, no Supabase, no Deno, no model calls.
 */

export interface SensorSnapshotCarrier {
  details?: Record<string, unknown> | null;
}

function parseCapturedAtMs(snap: Record<string, unknown>): number | null {
  const raw =
    snap.captured_at ?? snap.capturedAt ?? snap.timestamp ?? snap.ts ?? snap.time;
  if (raw === undefined || raw === null) return null;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const ms = raw < 1e12 ? raw * 1000 : raw;
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t) return null;
    const d = Date.parse(t);
    return Number.isFinite(d) ? d : null;
  }
  return null;
}

export function pickLatestSensorSnapshotByCapturedAt(
  rows: ReadonlyArray<SensorSnapshotCarrier> | null | undefined,
): Record<string, unknown> | null {
  if (!Array.isArray(rows) || rows.length === 0) return null;

  let bestWithTs: { snap: Record<string, unknown>; ms: number } | null = null;
  let firstAny: Record<string, unknown> | null = null;

  for (const row of rows) {
    const snap = (row?.details ?? null) && (row.details as Record<string, unknown>).sensor_snapshot;
    if (!snap || typeof snap !== "object" || Array.isArray(snap)) continue;
    const s = snap as Record<string, unknown>;
    if (firstAny === null) firstAny = s;
    const ms = parseCapturedAtMs(s);
    if (ms === null) continue;
    if (!bestWithTs || ms > bestWithTs.ms) bestWithTs = { snap: s, ms };
  }

  if (bestWithTs) return bestWithTs.snap;
  return firstAny;
}
