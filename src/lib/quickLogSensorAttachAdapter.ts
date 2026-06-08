/**
 * quickLogSensorAttachAdapter — pure, deterministic adapter that turns the
 * dashboard-shaped `SensorSnapshot` (from `@/lib/sensorSnapshot`) into the
 * redacted Quick Log save envelope produced by
 * `buildSensorSnapshotSavePayload` (from `@/lib/latestSensorSnapshotRules`).
 *
 * Why this exists:
 *  - QuickLog already consumes the dashboard `useLatestSensorSnapshot` hook
 *    for the trust strip. Re-fetching with the tent-scoped hook just to get
 *    the save envelope would double-query Supabase.
 *  - The dashboard hook's snapshot is already classified by the strip
 *    adapter (`buildQuickLogSnapshotStrip`); we only attach when its status
 *    is `usable`, which means non-Live-promoting + non-invalid.
 *
 * Safety rules (stop-ship if violated):
 *  - Only emits `status: "fresh_live"` when the dashboard source is exactly
 *    `"live"` AND the reading is within the freshness window. Manual / sim /
 *    diary / unavailable never become Live.
 *  - Never invents data. Missing metrics stay null.
 *  - Never includes raw_payload, tokens, auth strings, or device ids.
 *  - Returns null when attach is OFF or the strip is not usable.
 *  - Pure: no React, no Supabase, no fetch.
 */
import type { SensorSnapshot as DashboardSnapshot } from "@/lib/sensorSnapshot";
import {
  buildSensorSnapshotSavePayload,
  resolveLatestSensorSnapshot,
  SENSOR_FRESH_WINDOW_MINUTES,
  SENSOR_FUTURE_SKEW_LIMIT_MINUTES,
  type RawSensorRow,
} from "@/lib/latestSensorSnapshotRules";

export type QuickLogSensorStripStatus =
  | "no_data"
  | "usable"
  | "stale"
  | "invalid"
  | string;

export interface BuildQuickLogSensorAttachInput {
  /** Dashboard-shaped snapshot from useLatestSensorSnapshot. */
  snapshot: DashboardSnapshot;
  /** Strip status classified by buildQuickLogSnapshotStrip. */
  stripStatus: QuickLogSensorStripStatus;
  /** Whether the grower has the attach toggle ON. */
  attach: boolean;
  /** Tent id the strip is showing (server-trusted, from selectedPlant). */
  tentId: string | null;
  /** Wall clock for tests. Defaults to `new Date()`. */
  now?: Date;
}

export type QuickLogSensorAttachPayload = ReturnType<
  typeof buildSensorSnapshotSavePayload
>;

/**
 * Build the redacted `details.sensor` envelope for Quick Log. Returns null
 * (omit `p_details.sensor`) whenever attach is OFF or the snapshot is not
 * safe to persist as a usable record.
 */
export function buildQuickLogSensorAttachPayload(
  input: BuildQuickLogSensorAttachInput,
): QuickLogSensorAttachPayload {
  if (!input.attach) return null;
  if (input.stripStatus !== "usable") return null;
  const snap = input.snapshot;
  if (!snap || snap.source === "unavailable") return null;
  if (!snap.ts) return null;

  // Translate dashboard fields → long-format rows the resolver accepts.
  // We pass the raw source through verbatim so only `"live"` can promote
  // to fresh_live downstream. Manual/sim/diary stay non-Live.
  const captured = snap.ts;
  const rows: RawSensorRow[] = [];
  const push = (metric: string, value: number | null) => {
    if (value === null) return;
    rows.push({
      id: null,
      tent_id: input.tentId ?? null,
      metric,
      value,
      source: snap.source,
      captured_at: captured,
      ts: captured,
      created_at: captured,
    });
  };
  push("temperature_c", snap.temp); // resolver converts to temp_f
  push("humidity_pct", snap.rh);
  push("vpd_kpa", snap.vpd);
  push("soil_moisture_pct", snap.soil);
  push("co2_ppm", snap.co2);

  if (rows.length === 0) return null;

  const nowIso = (input.now ?? new Date()).toISOString();
  const resolved = resolveLatestSensorSnapshot(rows, nowIso, {
    tentId: input.tentId ?? null,
  });

  return buildSensorSnapshotSavePayload(resolved);
}

// Re-export the freshness constants so call sites and tests share a single
// source of truth without reaching into the rules module directly.
export { SENSOR_FRESH_WINDOW_MINUTES, SENSOR_FUTURE_SKEW_LIMIT_MINUTES };
