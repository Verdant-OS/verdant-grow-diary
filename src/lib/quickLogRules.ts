/**
 * Pure helpers for the Plant Detail Gate 1 Quick Log surface.
 *
 * SCOPE: presenter-free, deterministic, fully unit-testable.
 *   - normalize free-text numeric inputs to finite numbers or null
 *   - build the `details.manual_sensor_snapshot` payload
 *   - build the `details` jsonb that goes into a `diary_entries` insert
 *
 * SAFETY:
 *   - Never includes `user_id` in any payload (DB default auth.uid() wins).
 *   - Never invents sensor values — empty inputs become null, not 0.
 *   - Never blends manual values with live/pi_bridge readings.
 *   - No alert / action_queue / sensor_readings / device-control surface.
 */

export const QUICK_LOG_EVENT_TYPE = "quick_log" as const;
export const MANUAL_SENSOR_SOURCE = "manual" as const;

export interface QuickLogSensorInput {
  temp: string;     // °F as typed
  humidity: string; // % as typed
  ph: string;       // free-text decimal
  ec: string;       // free-text decimal
}

export interface ManualSensorSnapshot {
  temp_f: number | null;
  humidity_percent: number | null;
  ph: number | null;
  ec: number | null;
  source: typeof MANUAL_SENSOR_SOURCE;
}

/**
 * Parse a free-text numeric input.
 *   "" / whitespace / non-numeric / NaN / Infinity -> null
 *   "6.2" -> 6.2 ; "78" -> 78
 */
export function parseOptionalNumber(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  return n;
}

/**
 * Build the manual sensor snapshot. Returns null if every field is empty —
 * so we never persist a snapshot of all-nulls.
 */
export function buildManualSensorSnapshot(
  input: QuickLogSensorInput,
): ManualSensorSnapshot | null {
  const snap: ManualSensorSnapshot = {
    temp_f: parseOptionalNumber(input.temp),
    humidity_percent: parseOptionalNumber(input.humidity),
    ph: parseOptionalNumber(input.ph),
    ec: parseOptionalNumber(input.ec),
    source: MANUAL_SENSOR_SOURCE,
  };
  if (
    snap.temp_f === null &&
    snap.humidity_percent === null &&
    snap.ph === null &&
    snap.ec === null
  ) {
    return null;
  }
  return snap;
}

export interface QuickLogDetails {
  event_type: typeof QUICK_LOG_EVENT_TYPE;
  plant_id?: string;
  plant_name?: string;
  tent_id?: string;
  manual_sensor_snapshot?: ManualSensorSnapshot;
}

export interface BuildQuickLogDetailsArgs {
  plantId: string;
  plantName?: string | null;
  tentId?: string | null;
  sensors: QuickLogSensorInput;
}

export function buildQuickLogDetails(args: BuildQuickLogDetailsArgs): QuickLogDetails {
  const out: QuickLogDetails = {
    event_type: QUICK_LOG_EVENT_TYPE,
    plant_id: args.plantId,
  };
  if (args.plantName && args.plantName.trim()) out.plant_name = args.plantName.trim();
  if (args.tentId) out.tent_id = args.tentId;
  const snap = buildManualSensorSnapshot(args.sensors);
  if (snap) out.manual_sensor_snapshot = snap;
  return out;
}

export interface QuickLogInsertDraft {
  grow_id: string;
  plant_id: string;
  tent_id: string | null;
  note: string;
  photo_url: string | null;
  details: QuickLogDetails;
}

export interface BuildQuickLogInsertArgs {
  plantId: string;
  plantName?: string | null;
  growId: string;
  tentId?: string | null;
  note: string;
  photoPath?: string | null;
  sensors: QuickLogSensorInput;
}

export type DraftResult =
  | { ok: true; draft: QuickLogInsertDraft }
  | { ok: false; reason: string };

/**
 * Build the diary_entries insert draft. Never includes `user_id` —
 * DB default `auth.uid()` is the sole source of truth.
 *
 * Returns a validation failure if required fields (plant_id, grow_id, note)
 * are missing or empty. The caller (presenter) is responsible for surfacing
 * the failure.
 */
export function buildQuickLogInsertDraft(args: BuildQuickLogInsertArgs): DraftResult {
  const plantId = args.plantId?.trim();
  if (!plantId) return { ok: false, reason: "missing_plant_id" };
  const growId = args.growId?.trim();
  if (!growId) return { ok: false, reason: "missing_grow_id" };
  const note = (args.note ?? "").trim();
  if (!note) return { ok: false, reason: "missing_note" };

  return {
    ok: true,
    draft: {
      grow_id: growId,
      plant_id: plantId,
      tent_id: args.tentId?.trim() || null,
      note,
      photo_url: args.photoPath?.trim() || null,
      details: buildQuickLogDetails({
        plantId,
        plantName: args.plantName ?? null,
        tentId: args.tentId ?? null,
        sensors: args.sensors,
      }),
    },
  };
}
