/**
 * writeFeedingTypedEvent — thin, deterministic client wrapper around the
 * transactional Postgres RPC `public.create_feeding_event`.
 *
 * Rules:
 *   - App-layer validation runs BEFORE the RPC. The DB remains the final
 *     authority and re-enforces every rule via RLS + function guards.
 *   - Never writes directly to `feeding_events` or `grow_events` — the only
 *     write path is the RPC.
 *   - Never touches `service_role`. Uses the standard authenticated client.
 *   - No alerts, Action Queue rows, model sessions, or device commands.
 *   - The Supabase client is injectable so tests can mock the boundary
 *     without spinning up a network layer.
 *
 * Returns:
 *   - { ok: true, eventId } on success.
 *   - { ok: false, reason } on validation or RPC failure. The `reason`
 *     string is a short stable code suitable for telemetry; raw user input
 *     and RPC error messages are never echoed back verbatim.
 */

import { supabase as defaultSupabase } from "@/integrations/supabase/client";

// Minimal client surface we depend on, so tests can inject a stub without
// dragging the full Supabase generic in.
export interface FeedingRpcClient {
  rpc: (
    fn: "create_feeding_event",
    args: CreateFeedingEventRpcArgs,
  ) => Promise<{ data: unknown; error: unknown }>;
}

// ---------------------------------------------------------------------------
// App-level input shape
// ---------------------------------------------------------------------------

export interface FeedingTypedEventInput {
  grow_id: string;
  tent_id?: string | null;
  plant_id?: string | null;
  occurred_at?: string | Date | number | null;
  note?: string | null;
  /** Preferred app-level field. `line_id` is accepted as an alias. */
  nutrient_line_id?: string | null;
  line_id?: string | null;
  products: unknown;
  ec_in?: number | null;
  ec_out?: number | null;
  ph?: number | null;
  runoff_ml?: number | null;
  runoff_ph?: number | null;
  runoff_ec?: number | null;
  water_temp_c?: number | null;
}

export interface CreateFeedingEventRpcArgs {
  _grow_id: string;
  _line_id: string;
  _products: unknown[];
  _tent_id?: string;
  _plant_id?: string;
  _occurred_at?: string;
  _note?: string;
  _ph?: number;
  _ec_in?: number;
  _ec_out?: number;
  _runoff_ml?: number;
  _runoff_ph?: number;
  _runoff_ec?: number;
  _water_temp_c?: number;
}

export type WriteFeedingTypedEventResult =
  | { ok: true; eventId: string }
  | { ok: false; reason: WriteFeedingFailureReason };

export type WriteFeedingFailureReason =
  | "grow_id:missing"
  | "line_id:missing"
  | "products:not_array"
  | "products:contains_secret"
  | "numeric:not_finite"
  | "occurred_at:invalid"
  | "rpc:no_event_id"
  | "rpc:error";

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

const SECRET_HINT_RE =
  /(secret|token|api[_-]?key|password|service[_-]?role|bearer\s|^eyJ[A-Za-z0-9_-]{8,}\.|^sk_(live|test)_|^sb_|^pk_(live|test)_)/i;

function isStringy(v: unknown): v is string {
  return typeof v === "string";
}

function trimOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function isFiniteNumberOrNull(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  return typeof v === "number" && Number.isFinite(v);
}

function toIsoOrNull(v: FeedingTypedEventInput["occurred_at"]): {
  iso: string | null;
  invalid: boolean;
} {
  if (v === null || v === undefined) return { iso: null, invalid: false };
  if (v instanceof Date) {
    const t = v.getTime();
    return Number.isFinite(t)
      ? { iso: new Date(t).toISOString(), invalid: false }
      : { iso: null, invalid: true };
  }
  if (typeof v === "number") {
    return Number.isFinite(v)
      ? { iso: new Date(v).toISOString(), invalid: false }
      : { iso: null, invalid: true };
  }
  if (typeof v === "string") {
    const t = Date.parse(v);
    return Number.isFinite(t)
      ? { iso: new Date(t).toISOString(), invalid: false }
      : { iso: null, invalid: true };
  }
  return { iso: null, invalid: true };
}

/**
 * Recursively scan a product entry for token-like strings. Returns true if
 * any value matches a known secret pattern. Strings are checked, objects
 * walked, arrays walked. Other types are ignored.
 */
function containsSecret(value: unknown, depth = 0): boolean {
  if (depth > 5) return false;
  if (isStringy(value)) return SECRET_HINT_RE.test(value);
  if (Array.isArray(value)) {
    return value.some((v) => containsSecret(v, depth + 1));
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_HINT_RE.test(k)) return true;
      if (containsSecret(v, depth + 1)) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Mapper: app input → RPC args (pure)
// ---------------------------------------------------------------------------

export function mapFeedingInputToRpcArgs(
  input: FeedingTypedEventInput,
):
  | { ok: true; args: CreateFeedingEventRpcArgs }
  | { ok: false; reason: WriteFeedingFailureReason } {
  const grow_id = trimOrNull(input.grow_id);
  if (!grow_id) return { ok: false, reason: "grow_id:missing" };

  const line_id =
    trimOrNull(input.nutrient_line_id) ?? trimOrNull(input.line_id);
  if (!line_id) return { ok: false, reason: "line_id:missing" };

  if (!Array.isArray(input.products)) {
    return { ok: false, reason: "products:not_array" };
  }
  if (containsSecret(input.products)) {
    return { ok: false, reason: "products:contains_secret" };
  }

  const numericFields: Array<[
    keyof FeedingTypedEventInput,
    keyof CreateFeedingEventRpcArgs,
  ]> = [
    ["ph", "_ph"],
    ["ec_in", "_ec_in"],
    ["ec_out", "_ec_out"],
    ["runoff_ml", "_runoff_ml"],
    ["runoff_ph", "_runoff_ph"],
    ["runoff_ec", "_runoff_ec"],
    ["water_temp_c", "_water_temp_c"],
  ];
  for (const [k] of numericFields) {
    if (!isFiniteNumberOrNull(input[k])) {
      return { ok: false, reason: "numeric:not_finite" };
    }
  }

  const occurred = toIsoOrNull(input.occurred_at);
  if (occurred.invalid) return { ok: false, reason: "occurred_at:invalid" };

  const args: CreateFeedingEventRpcArgs = {
    _grow_id: grow_id,
    _line_id: line_id,
    _products: input.products as unknown[],
  };

  const tent_id = trimOrNull(input.tent_id);
  if (tent_id) args._tent_id = tent_id;
  const plant_id = trimOrNull(input.plant_id);
  if (plant_id) args._plant_id = plant_id;
  if (occurred.iso) args._occurred_at = occurred.iso;
  const note = trimOrNull(input.note);
  if (note) args._note = note;

  for (const [appKey, rpcKey] of numericFields) {
    const v = input[appKey];
    if (typeof v === "number" && Number.isFinite(v)) {
      (args as unknown as Record<string, unknown>)[rpcKey] = v;
    }
  }

  return { ok: true, args };
}

// ---------------------------------------------------------------------------
// Writer
// ---------------------------------------------------------------------------

export interface WriteFeedingTypedEventOptions {
  /** Optional injectable client for tests. Defaults to the app's Supabase
   * authenticated client. Never accepts a service-role client. */
  client?: FeedingRpcClient;
}

export async function writeFeedingTypedEvent(
  input: FeedingTypedEventInput,
  options: WriteFeedingTypedEventOptions = {},
): Promise<WriteFeedingTypedEventResult> {
  const mapped = mapFeedingInputToRpcArgs(input);
  if (!mapped.ok) {
    return { ok: false, reason: mapped.reason };
  }

  const client: FeedingRpcClient =
    options.client ?? (defaultSupabase as unknown as FeedingRpcClient);

  let response: { data: unknown; error: unknown };
  try {
    response = await client.rpc("create_feeding_event", mapped.args);
  } catch {
    return { ok: false, reason: "rpc:error" };
  }

  if (response.error) {
    return { ok: false, reason: "rpc:error" };
  }
  const eventId =
    typeof response.data === "string" && response.data.length > 0
      ? response.data
      : null;
  if (!eventId) {
    return { ok: false, reason: "rpc:no_event_id" };
  }
  return { ok: true, eventId };
}
