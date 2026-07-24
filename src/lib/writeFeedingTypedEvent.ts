/**
 * writeFeedingTypedEvent — thin client wrapper around the existing atomic,
 * idempotent `public.quicklog_save_event` RPC.
 *
 * Rules:
 *   - App validation runs before the RPC; DB ownership/RLS guards remain final.
 *   - The typed feeding row, parent grow event, diary companion, idempotency
 *     record, and audit rows are committed by one server transaction.
 *   - Retries reuse the caller-provided idempotency key and return the original
 *     grow_event_id instead of creating a duplicate feeding.
 *   - No direct table writes, service role, alerts, actions, or device control.
 */

import { supabase as defaultSupabase } from "@/integrations/supabase/client";
import { ROOT_ZONE_PRODUCT_CAP } from "./rootZoneObservationRules";

export interface QuickLogFeedingRpcPayload {
  line_id: string;
  products: unknown[];
  volume_ml: number;
  ph?: number;
  ec_in?: number;
  ec_out?: number;
  runoff_ml?: number;
  runoff_ph?: number;
  runoff_ec?: number;
  water_temp_c?: number;
}

export interface QuickLogFeedingEventRpcArgs {
  p_idempotency_key: string;
  p_grow_id: string;
  p_event_type: "feeding";
  p_tent_id: string | null;
  p_plant_id: string | null;
  p_note: string | null;
  p_photo_url: null;
  p_sensor_snapshot: null;
  p_occurred_at: string | null;
  p_details: null;
  p_water: null;
  p_feed: QuickLogFeedingRpcPayload;
}

// Minimal authenticated client surface, injectable for deterministic tests.
export interface FeedingRpcClient {
  rpc: (
    fn: "quicklog_save_event",
    args: QuickLogFeedingEventRpcArgs,
  ) => Promise<{ data: unknown; error: unknown }>;
}

export interface FeedingTypedEventInput {
  /** Generate once for a logical save and reuse on retry. */
  idempotency_key: string;
  grow_id: string;
  tent_id?: string | null;
  plant_id?: string | null;
  occurred_at?: string | Date | number | null;
  note?: string | null;
  /** Preferred app-level field. `line_id` remains an accepted alias. */
  nutrient_line_id?: string | null;
  line_id?: string | null;
  products: unknown;
  volume_ml: number;
  ec_in?: number | null;
  ec_out?: number | null;
  ph?: number | null;
  runoff_ml?: number | null;
  runoff_ph?: number | null;
  runoff_ec?: number | null;
  water_temp_c?: number | null;
}

export type WriteFeedingTypedEventResult =
  | { ok: true; eventId: string; reused: boolean }
  | { ok: false; reason: WriteFeedingFailureReason };

export type WriteFeedingFailureReason =
  | "idempotency_key:invalid"
  | "grow_id:missing"
  | "line_id:missing"
  | "products:not_array"
  | "products:empty"
  | "products:too_many"
  | "products:contains_secret"
  | "volume_ml:invalid"
  | "numeric:not_finite"
  | "occurred_at:invalid"
  | "rpc:no_event_id"
  | "rpc:rejected"
  | "rpc:error";

const SECRET_HINT_RE =
  /(secret|token|api[_-]?key|password|service[_-]?role|bearer\s|^eyJ[A-Za-z0-9_-]{8,}\.|^sk_(live|test)_|^sb_|^pk_(live|test)_)/i;

function trimOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isFiniteNumberOrNull(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  return typeof value === "number" && Number.isFinite(value);
}

function toIsoOrNull(value: FeedingTypedEventInput["occurred_at"]): {
  iso: string | null;
  invalid: boolean;
} {
  if (value === null || value === undefined) {
    return { iso: null, invalid: false };
  }
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

function containsSecret(value: unknown, depth = 0): boolean {
  if (depth > 5) return false;
  if (typeof value === "string") return SECRET_HINT_RE.test(value);
  if (Array.isArray(value)) {
    return value.some((item) => containsSecret(item, depth + 1));
  }
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).some(
      ([key, nested]) => SECRET_HINT_RE.test(key) || containsSecret(nested, depth + 1),
    );
  }
  return false;
}

export function mapFeedingInputToRpcArgs(
  input: FeedingTypedEventInput,
):
  | { ok: true; args: QuickLogFeedingEventRpcArgs }
  | { ok: false; reason: WriteFeedingFailureReason } {
  const idempotencyKey = trimOrNull(input.idempotency_key);
  if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 200) {
    return { ok: false, reason: "idempotency_key:invalid" };
  }

  const growId = trimOrNull(input.grow_id);
  if (!growId) return { ok: false, reason: "grow_id:missing" };

  const lineId = trimOrNull(input.nutrient_line_id) ?? trimOrNull(input.line_id);
  if (!lineId) return { ok: false, reason: "line_id:missing" };

  if (!Array.isArray(input.products)) {
    return { ok: false, reason: "products:not_array" };
  }
  if (input.products.length === 0) {
    return { ok: false, reason: "products:empty" };
  }
  if (input.products.length > ROOT_ZONE_PRODUCT_CAP) {
    return { ok: false, reason: "products:too_many" };
  }
  if (containsSecret(input.products)) {
    return { ok: false, reason: "products:contains_secret" };
  }

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
    "ec_in",
    "ec_out",
    "runoff_ml",
    "runoff_ph",
    "runoff_ec",
    "water_temp_c",
  ] as const;
  for (const field of numericFields) {
    if (!isFiniteNumberOrNull(input[field])) {
      return { ok: false, reason: "numeric:not_finite" };
    }
  }

  const occurred = toIsoOrNull(input.occurred_at);
  if (occurred.invalid) return { ok: false, reason: "occurred_at:invalid" };

  const feed: QuickLogFeedingRpcPayload = {
    line_id: lineId,
    products: input.products,
    volume_ml: input.volume_ml,
  };
  for (const field of numericFields) {
    const value = input[field];
    if (typeof value === "number" && Number.isFinite(value)) {
      feed[field] = value;
    }
  }

  return {
    ok: true,
    args: {
      p_idempotency_key: idempotencyKey,
      p_grow_id: growId,
      p_event_type: "feeding",
      p_tent_id: trimOrNull(input.tent_id),
      p_plant_id: trimOrNull(input.plant_id),
      p_note: trimOrNull(input.note),
      p_photo_url: null,
      p_sensor_snapshot: null,
      p_occurred_at: occurred.iso,
      p_details: null,
      p_water: null,
      p_feed: feed,
    },
  };
}

export interface WriteFeedingTypedEventOptions {
  client?: FeedingRpcClient;
}

export async function writeFeedingTypedEvent(
  input: FeedingTypedEventInput,
  options: WriteFeedingTypedEventOptions = {},
): Promise<WriteFeedingTypedEventResult> {
  const mapped = mapFeedingInputToRpcArgs(input);
  if (mapped.ok !== true) return mapped;

  const client = options.client ?? (defaultSupabase as unknown as FeedingRpcClient);

  let response: { data: unknown; error: unknown };
  try {
    response = await client.rpc("quicklog_save_event", mapped.args);
  } catch {
    return { ok: false, reason: "rpc:error" };
  }
  if (response.error) return { ok: false, reason: "rpc:error" };

  const envelope =
    response.data && typeof response.data === "object"
      ? (response.data as Record<string, unknown>)
      : null;
  if (!envelope || envelope.ok !== true) {
    return { ok: false, reason: "rpc:rejected" };
  }
  const eventId = trimOrNull(envelope.grow_event_id);
  if (!eventId) return { ok: false, reason: "rpc:no_event_id" };

  return {
    ok: true,
    eventId,
    reused: envelope.reused === true,
  };
}
