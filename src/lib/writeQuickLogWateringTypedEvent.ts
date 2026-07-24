/**
 * Atomic writer for Quick Log's structured watering record.
 *
 * The existing `quicklog_save_event` RPC owns target authorization,
 * idempotency, the grow-event spine, the typed `watering_events` row, and
 * the companion diary evidence. This module only validates and maps the
 * grower-authored record into that contract.
 *
 * It never writes tables directly, creates alerts/actions, or controls a
 * device. Manual observations and manual air readings remain explicitly
 * labeled as manual evidence.
 */

import { supabase as defaultSupabase } from "@/integrations/supabase/client";

export interface QuickLogWateringRpcPayload {
  volume_ml: number;
  ph?: number;
  ec_ms_cm?: number;
  runoff_ml?: number;
  runoff_ph?: number;
  runoff_ec?: number;
  water_temp_c?: number;
}

export interface QuickLogWateringManualSnapshot {
  source: "manual";
  captured_at: string;
  metrics: Partial<Record<"temperature_c" | "humidity_pct" | "vpd_kpa", number>>;
}

export interface QuickLogWateringEventRpcArgs {
  p_idempotency_key: string;
  p_grow_id: string;
  p_event_type: "watering";
  p_tent_id: string | null;
  p_plant_id: string | null;
  p_note: string | null;
  p_photo_url: null;
  p_sensor_snapshot: QuickLogWateringManualSnapshot | null;
  p_occurred_at: string | null;
  p_details: Record<string, unknown> | null;
  p_water: QuickLogWateringRpcPayload;
  p_feed: null;
}

export interface WateringRpcClient {
  rpc: (
    fn: "quicklog_save_event",
    args: QuickLogWateringEventRpcArgs,
  ) => Promise<{ data: unknown; error: unknown }>;
}

export interface WateringTypedEventInput {
  /** Generate once per logical save and reuse on retry. */
  idempotency_key: string;
  grow_id: string;
  tent_id?: string | null;
  plant_id?: string | null;
  occurred_at?: string | Date | number | null;
  note?: string | null;
  volume_ml: number;
  ph?: number | null;
  ec_ms_cm?: number | null;
  runoff_ml?: number | null;
  runoff_ph?: number | null;
  runoff_ec?: number | null;
  water_temp_c?: number | null;
  sensor_snapshot?: QuickLogWateringManualSnapshot | null;
  details?: Record<string, unknown> | null;
}

export type WriteWateringFailureReason =
  | "idempotency_key:invalid"
  | "grow_id:missing"
  | "volume_ml:invalid"
  | "numeric:not_finite"
  | "numeric:out_of_range"
  | "note:invalid"
  | "occurred_at:invalid"
  | "sensor_snapshot:invalid"
  | "details:invalid"
  | "rpc:no_event_id"
  | "rpc:rejected"
  | "rpc:error";

export type WriteWateringTypedEventResult =
  | { ok: true; eventId: string; reused: boolean }
  | { ok: false; reason: WriteWateringFailureReason };

const NOTE_LIMIT = 500;
const DETAILS_SERIALIZED_LIMIT = 20_000;
const FORBIDDEN_DETAIL_KEYS = new Set([
  "user_id",
  "grow_id",
  "tent_id",
  "plant_id",
  "auth_uid",
  "auth.uid",
]);

function trimOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toIsoOrNull(value: WateringTypedEventInput["occurred_at"]): {
  iso: string | null;
  invalid: boolean;
} {
  if (value === null || value === undefined) return { iso: null, invalid: false };
  const timestamp =
    value instanceof Date
      ? value.getTime()
      : typeof value === "number"
        ? value
        : typeof value === "string"
          ? Date.parse(value)
          : Number.NaN;
  if (!Number.isFinite(timestamp)) return { iso: null, invalid: true };
  const date = new Date(timestamp);
  return Number.isFinite(date.getTime())
    ? { iso: date.toISOString(), invalid: false }
    : { iso: null, invalid: true };
}

function optionalNumberIsFinite(value: unknown): boolean {
  return (
    value === null || value === undefined || (typeof value === "number" && Number.isFinite(value))
  );
}

function numberInRange(value: number | null | undefined, min: number, max: number): boolean {
  return value === null || value === undefined || (value >= min && value <= max);
}

function validateSnapshot(value: QuickLogWateringManualSnapshot | null | undefined): boolean {
  if (value === null || value === undefined) return true;
  if (!isPlainRecord(value) || value.source !== "manual") return false;
  if (!Number.isFinite(Date.parse(value.captured_at))) return false;
  if (!isPlainRecord(value.metrics)) return false;
  const entries = Object.entries(value.metrics);
  if (entries.length === 0) return false;
  const allowed = new Set(["temperature_c", "humidity_pct", "vpd_kpa"]);
  for (const [key, raw] of entries) {
    if (!allowed.has(key) || typeof raw !== "number" || !Number.isFinite(raw)) return false;
    if (key === "temperature_c" && (raw < -10 || raw > 60)) return false;
    if (key === "humidity_pct" && (raw < 0 || raw > 100)) return false;
    if (key === "vpd_kpa" && (raw < 0 || raw > 10)) return false;
  }
  return true;
}

function validateDetails(value: Record<string, unknown> | null | undefined): boolean {
  if (value === null || value === undefined) return true;
  if (!isPlainRecord(value)) return false;
  if (Object.keys(value).some((key) => FORBIDDEN_DETAIL_KEYS.has(key))) return false;
  try {
    return JSON.stringify(value).length <= DETAILS_SERIALIZED_LIMIT;
  } catch {
    return false;
  }
}

export function mapWateringInputToRpcArgs(
  input: WateringTypedEventInput,
):
  | { ok: true; args: QuickLogWateringEventRpcArgs }
  | { ok: false; reason: WriteWateringFailureReason } {
  const idempotencyKey = trimOrNull(input.idempotency_key);
  if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 200) {
    return { ok: false, reason: "idempotency_key:invalid" };
  }

  const growId = trimOrNull(input.grow_id);
  if (!growId) return { ok: false, reason: "grow_id:missing" };

  if (
    typeof input.volume_ml !== "number" ||
    !Number.isFinite(input.volume_ml) ||
    input.volume_ml <= 0 ||
    input.volume_ml > 1_000_000
  ) {
    return { ok: false, reason: "volume_ml:invalid" };
  }

  const numericFields = [
    "ph",
    "ec_ms_cm",
    "runoff_ml",
    "runoff_ph",
    "runoff_ec",
    "water_temp_c",
  ] as const;
  for (const field of numericFields) {
    if (!optionalNumberIsFinite(input[field])) {
      return { ok: false, reason: "numeric:not_finite" };
    }
  }
  if (
    !numberInRange(input.ph, 0, 14) ||
    !numberInRange(input.ec_ms_cm, 0, 10) ||
    !numberInRange(input.runoff_ml, 0, 1_000_000) ||
    !numberInRange(input.runoff_ph, 0, 14) ||
    !numberInRange(input.runoff_ec, 0, 10) ||
    !numberInRange(input.water_temp_c, -10, 60)
  ) {
    return { ok: false, reason: "numeric:out_of_range" };
  }

  const note = trimOrNull(input.note);
  if (note && note.length > NOTE_LIMIT) return { ok: false, reason: "note:invalid" };

  const occurred = toIsoOrNull(input.occurred_at);
  if (occurred.invalid) return { ok: false, reason: "occurred_at:invalid" };
  if (!validateSnapshot(input.sensor_snapshot)) {
    return { ok: false, reason: "sensor_snapshot:invalid" };
  }
  if (!validateDetails(input.details)) return { ok: false, reason: "details:invalid" };

  const water: QuickLogWateringRpcPayload = { volume_ml: input.volume_ml };
  for (const field of numericFields) {
    const value = input[field];
    if (typeof value === "number" && Number.isFinite(value)) water[field] = value;
  }

  return {
    ok: true,
    args: {
      p_idempotency_key: idempotencyKey,
      p_grow_id: growId,
      p_event_type: "watering",
      p_tent_id: trimOrNull(input.tent_id),
      p_plant_id: trimOrNull(input.plant_id),
      p_note: note,
      p_photo_url: null,
      p_sensor_snapshot: input.sensor_snapshot ?? null,
      p_occurred_at: occurred.iso,
      p_details: input.details ?? null,
      p_water: water,
      p_feed: null,
    },
  };
}

export interface WriteWateringTypedEventOptions {
  client?: WateringRpcClient;
}

export async function writeQuickLogWateringTypedEvent(
  input: WateringTypedEventInput,
  options: WriteWateringTypedEventOptions = {},
): Promise<WriteWateringTypedEventResult> {
  const mapped = mapWateringInputToRpcArgs(input);
  if (mapped.ok !== true) return mapped;

  const client = options.client ?? (defaultSupabase as unknown as WateringRpcClient);
  let response: { data: unknown; error: unknown };
  try {
    response = await client.rpc("quicklog_save_event", mapped.args);
  } catch {
    return { ok: false, reason: "rpc:error" };
  }
  if (response.error) return { ok: false, reason: "rpc:error" };

  const envelope = isPlainRecord(response.data) ? response.data : null;
  if (!envelope || envelope.ok !== true) return { ok: false, reason: "rpc:rejected" };
  const eventId = trimOrNull(envelope.grow_event_id);
  if (!eventId) return { ok: false, reason: "rpc:no_event_id" };

  return { ok: true, eventId, reused: envelope.reused === true };
}
