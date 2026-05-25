/**
 * Pure helpers for the "Recent Sensor Readings" section shown below the
 * latest Sensor Context display.
 *
 * No I/O, no React, no Supabase calls. Deterministic derivations only.
 *
 * Groups long-format sensor_readings rows (already scoped to a single
 * tent by the caller) by exact `ts`, then returns the latest 3-5
 * snapshots in descending captured_at order. Source is mapped through
 * the existing classification used by snapshotFromReadings so manual
 * rows surface as "manual" (never "live") and sim-only rows as "sim".
 *
 * Read-only. Not used for alerts, action_queue, AI Doctor, or device
 * control. Never invents placeholder values.
 */
import {
  isStale,
  toFiniteNumber,
  type SensorReadingLike,
  type SnapshotSource,
} from "@/lib/sensorSnapshot";
import { formatSensorDeviceDetail } from "@/lib/shellyHtWebhookRules";

export const RECENT_HISTORY_DEFAULT_LIMIT = 5;
export const RECENT_HISTORY_MIN_LIMIT = 3;
export const RECENT_HISTORY_MAX_LIMIT = 5;

export interface RecentSensorSnapshot {
  ts: string;
  source: SnapshotSource;
  stale: boolean;
  temp: number | null;
  rh: number | null;
  vpd: number | null;
  co2: number | null;
  /** Optional device-specific label (e.g. "Shelly H&T Gen4"). Null when
   *  unknown. Always derived through the shared pure helper — never a
   *  duplicated mapping table. */
  deviceDetail: string | null;
}

function clampLimit(n: number | undefined): number {
  const v =
    typeof n === "number" && Number.isFinite(n)
      ? Math.floor(n)
      : RECENT_HISTORY_DEFAULT_LIMIT;
  if (v < RECENT_HISTORY_MIN_LIMIT) return RECENT_HISTORY_MIN_LIMIT;
  if (v > RECENT_HISTORY_MAX_LIMIT) return RECENT_HISTORY_MAX_LIMIT;
  return v;
}

function classifySource(rows: SensorReadingLike[]): SnapshotSource {
  if (rows.length === 0) return "unavailable";
  if (rows.some((r) => r.source === "manual")) return "manual";
  if (rows.every((r) => r.source === "sim")) return "sim";
  return "live";
}

function pickMetric(rows: SensorReadingLike[], metric: string): number | null {
  const r = rows.find((x) => x.metric === metric);
  return r ? toFiniteNumber(r.value) : null;
}

/**
 * Build a newest-first list of recent sensor snapshots from long-format
 * readings. Rows sharing the same `ts` are folded into one snapshot.
 * Returns at most `limit` (clamped to [3, 5]).
 */
export function buildRecentSensorSnapshotHistory(
  rows: ReadonlyArray<SensorReadingLike> | null | undefined,
  opts: { limit?: number; now?: number } = {},
): RecentSensorSnapshot[] {
  if (!rows || rows.length === 0) return [];
  const limit = clampLimit(opts.limit);
  const now = opts.now ?? Date.now();

  // Group by exact ts, preserve incoming order (caller orders desc).
  const order: string[] = [];
  const byTs = new Map<string, SensorReadingLike[]>();
  for (const r of rows) {
    if (!r || typeof r.ts !== "string") continue;
    const t = new Date(r.ts).getTime();
    if (!Number.isFinite(t)) continue;
    const existing = byTs.get(r.ts);
    if (existing) {
      existing.push(r);
    } else {
      byTs.set(r.ts, [r]);
      order.push(r.ts);
    }
  }
  if (order.length === 0) return [];

  // Deterministic ordering: newest ts first; ties broken by lexical ts
  // (already stable since identical strings).
  order.sort((a, b) => {
    const ta = new Date(a).getTime();
    const tb = new Date(b).getTime();
    if (tb !== ta) return tb - ta;
    return a < b ? 1 : a > b ? -1 : 0;
  });

  const out: RecentSensorSnapshot[] = [];
  for (const ts of order) {
    if (out.length >= limit) break;
    const group = byTs.get(ts)!;
    let deviceDetail: string | null = null;
    for (const r of group) {
      const d = formatSensorDeviceDetail(r.device_id);
      if (d) {
        deviceDetail = d;
        break;
      }
    }
    out.push({
      ts,
      source: classifySource(group),
      stale: isStale(ts, now),
      temp: pickMetric(group, "temperature_c"),
      rh: pickMetric(group, "humidity_pct"),
      vpd: pickMetric(group, "vpd_kpa"),
      co2: pickMetric(group, "co2_ppm"),
      deviceDetail,
    });
  }
  return out;
}
