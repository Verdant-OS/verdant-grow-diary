// Paddle webhook receiver — SANDBOX ONLY.
//
// Responsibilities:
//   1. Read the RAW request body (signature verification requires the exact
//      bytes Paddle signed; do NOT JSON.parse before verifying).
//   2. Verify the Paddle-Signature header using PADDLE_WEBHOOK_SECRET via
//      HMAC-SHA256 over `<ts>:<rawBody>`, in constant time.
//   3. Refuse if PADDLE_ENVIRONMENT is anything other than "sandbox" while
//      Verdant is still in sandbox-only mode.
//   4. Store the event in `public.paddle_events` idempotently (unique
//      event_id) BEFORE any other processing.
//   5. Store one audit/replay row in `public.paddle_event_processing`.
//   6. Do NOT change any user entitlement here yet. Entitlement flips are
//      intentionally deferred until a separate, reviewed change.
//
// Notes:
//   - This function does not trust any client-provided user_id.
//   - It never reads or writes private grow/plant/tent/sensor/alert data.
//   - It uses the service role only inside this trusted server context.

// deno-lint-ignore-file no-explicit-any
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, paddle-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PADDLE_WEBHOOK_SECRET = Deno.env.get("PADDLE_WEBHOOK_SECRET") ?? "";
const PADDLE_ENVIRONMENT = (Deno.env.get("PADDLE_ENVIRONMENT") ?? "").toLowerCase();

const PADDLE_PRICE_CONFIG = {
  pro_monthly: Deno.env.get("PADDLE_PRICE_PRO_MONTHLY") ?? "",
  pro_annual: Deno.env.get("PADDLE_PRICE_PRO_ANNUAL") ?? "",
  founder_lifetime: Deno.env.get("PADDLE_PRICE_FOUNDER_LIFETIME") ?? "",
};

const PROCESSABLE_EVENTS = new Set([
  "transaction.completed",
  "subscription.created",
  "subscription.activated",
  "subscription.updated",
  "subscription.past_due",
  "subscription.paused",
  "subscription.resumed",
  "subscription.canceled",
]);

const NON_GRANTING_TRANSACTION_EVENTS = new Set([
  "transaction.payment_failed",
  "transaction.canceled",
]);

const ADJUSTMENT_EVENTS = new Set([
  "adjustment.created",
  "adjustment.updated",
]);

type RecordedPaddleEventRow = {
  id: string;
  event_id: string;
  event_type: string;
  environment: string;
  signature_verified: boolean;
  payload: Record<string, unknown>;
};

type ProcessingPayload = {
  paddle_event_id: string;
  event_id: string;
  event_type: string;
  environment: string;
  status: "processed" | "ignored" | "blocked" | "failed";
  reason: string | null;
  candidate_plan_id: "free" | "pro_monthly" | "pro_annual" | "founder_lifetime" | null;
  candidate_status: "active" | "past_due" | "canceled" | "paused" | "expired" | null;
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
  provider_price_id: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  is_founder_candidate: boolean;
  details: Record<string, unknown>;
};

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function parsePaddleSignature(header: string): { ts: string; h1: string } | null {
  // Paddle signature header format: "ts=<unix>;h1=<hexhmac>"
  const parts = header.split(";").map((s) => s.trim());
  let ts = "";
  let h1 = "";
  for (const p of parts) {
    const [k, v] = p.split("=");
    if (k === "ts") ts = v ?? "";
    else if (k === "h1") h1 = v ?? "";
  }
  if (!ts || !h1) return null;
  return { ts, h1 };
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  const bytes = new Uint8Array(sig);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readPath(root: Record<string, unknown>, path: string[]): unknown {
  let cursor: unknown = root;
  for (const key of path) {
    if (!isRecord(cursor)) return undefined;
    cursor = cursor[key];
  }
  return cursor;
}

function firstStringPath(root: Record<string, unknown>, paths: string[][]): string | null {
  for (const path of paths) {
    const v = readString(readPath(root, path));
    if (v) return v;
  }
  return null;
}

function payloadData(payload: Record<string, unknown>): Record<string, unknown> {
  return isRecord(payload.data) ? payload.data : payload;
}

function priceIdsFromObject(obj: Record<string, unknown>): string[] {
  const out = new Set<string>();

  const direct = firstStringPath(obj, [["price_id"], ["price", "id"], ["price", "price_id"]]);
  if (direct) out.add(direct);

  for (const listKey of ["items", "line_items"]) {
    const items = obj[listKey];
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      if (!isRecord(item)) continue;
      const priceId = firstStringPath(item, [
        ["price_id"],
        ["price", "id"],
        ["price", "price_id"],
        ["product", "price_id"],
      ]);
      if (priceId) out.add(priceId);
    }
  }

  return [...out];
}

function planFromPriceId(priceId: string): ProcessingPayload["candidate_plan_id"] {
  if (priceId && priceId === PADDLE_PRICE_CONFIG.pro_monthly) return "pro_monthly";
  if (priceId && priceId === PADDLE_PRICE_CONFIG.pro_annual) return "pro_annual";
  if (priceId && priceId === PADDLE_PRICE_CONFIG.founder_lifetime) return "founder_lifetime";
  return null;
}

function selectPlan(data: Record<string, unknown>):
  | { ok: true; priceId: string; planId: NonNullable<ProcessingPayload["candidate_plan_id"]> }
  | { ok: false; reason: "unknown_price_id" | "ambiguous_price_ids" } {
  const mapped = priceIdsFromObject(data)
    .map((priceId) => ({ priceId, planId: planFromPriceId(priceId) }))
    .filter((x): x is { priceId: string; planId: NonNullable<ProcessingPayload["candidate_plan_id"]> } => x.planId !== null);

  const uniquePlans = new Map<NonNullable<ProcessingPayload["candidate_plan_id"]>, string>();
  for (const item of mapped) uniquePlans.set(item.planId, item.priceId);

  if (uniquePlans.size === 0) return { ok: false, reason: "unknown_price_id" };
  if (uniquePlans.size > 1) return { ok: false, reason: "ambiguous_price_ids" };

  const [[planId, priceId]] = [...uniquePlans.entries()];
  return { ok: true, planId, priceId };
}

function candidateStatus(eventType: string): NonNullable<ProcessingPayload["candidate_status"]> {
  switch (eventType) {
    case "subscription.past_due":
      return "past_due";
    case "subscription.paused":
      return "paused";
    case "subscription.canceled":
      return "canceled";
    default:
      return "active";
  }
}

function baseProcessingPayload(
  row: RecordedPaddleEventRow,
  status: ProcessingPayload["status"],
  reason: string | null,
  details: Record<string, unknown>,
): ProcessingPayload {
  return {
    paddle_event_id: row.id,
    event_id: row.event_id,
    event_type: row.event_type,
    environment: row.environment,
    status,
    reason,
    candidate_plan_id: null,
    candidate_status: null,
    provider_customer_id: null,
    provider_subscription_id: null,
    provider_price_id: null,
    current_period_end: null,
    cancel_at_period_end: false,
    is_founder_candidate: false,
    details,
  };
}

function ignoredProcessingPayload(row: RecordedPaddleEventRow, reason: string): ProcessingPayload {
  return baseProcessingPayload(row, "ignored", reason, {
    phase: "webhook_mapper_decision",
    decision_state: "ignore",
  });
}

function blockedProcessingPayload(row: RecordedPaddleEventRow, reason: string): ProcessingPayload {
  return baseProcessingPayload(row, "blocked", reason, {
    phase: "webhook_mapper_decision",
    decision_state: "block",
  });
}

function failedProcessingPayload(row: RecordedPaddleEventRow, reason: string): ProcessingPayload {
  return baseProcessingPayload(row, "failed", reason, {
    phase: "webhook_processing_failure",
  });
}

function buildProcessingPayload(row: RecordedPaddleEventRow): ProcessingPayload {
  if (row.signature_verified !== true) return blockedProcessingPayload(row, "event_not_verified");
  if (row.environment !== "sandbox") return blockedProcessingPayload(row, "environment_not_allowed");

  const payload = row.payload;
  const payloadEventType = readString(payload.event_type);
  if (payloadEventType && payloadEventType !== row.event_type) {
    return blockedProcessingPayload(row, "event_type_mismatch");
  }

  if (NON_GRANTING_TRANSACTION_EVENTS.has(row.event_type)) {
    return ignoredProcessingPayload(row, "non_granting_transaction_event");
  }
  if (ADJUSTMENT_EVENTS.has(row.event_type)) {
    return ignoredProcessingPayload(row, "adjustment_event_requires_policy");
  }
  if (!PROCESSABLE_EVENTS.has(row.event_type)) {
    return ignoredProcessingPayload(row, "unsupported_event_type");
  }

  const data = payloadData(payload);
  const selectedPlan = selectPlan(data);
  if (!selectedPlan.ok) return blockedProcessingPayload(row, selectedPlan.reason);

  const customerId = firstStringPath(data, [["customer_id"], ["customer", "id"]]);
  if (!customerId) return blockedProcessingPayload(row, "missing_customer_id");

  const isFounderCandidate = selectedPlan.planId === "founder_lifetime";
  const subscriptionId = firstStringPath(data, [["subscription_id"], ["subscription", "id"], ["id"]]);
  if (!isFounderCandidate && !subscriptionId) {
    return blockedProcessingPayload(row, "missing_subscription_id");
  }

  return {
    ...baseProcessingPayload(row, "processed", null, {
      phase: "webhook_mapper_decision",
      decision_state: "process",
    }),
    candidate_plan_id: selectedPlan.planId,
    candidate_status: isFounderCandidate ? "active" : candidateStatus(row.event_type),
    provider_customer_id: customerId,
    provider_subscription_id: subscriptionId,
    provider_price_id: selectedPlan.priceId,
    current_period_end: isFounderCandidate
      ? null
      : firstStringPath(data, [
        ["current_billing_period", "ends_at"],
        ["billing_period", "ends_at"],
        ["next_billed_at"],
        ["access_until"],
      ]),
    cancel_at_period_end: isFounderCandidate
      ? false
      : firstStringPath(data, [["scheduled_change", "action"]]) === "cancel",
    is_founder_candidate: isFounderCandidate,
  };
}

async function insertProcessingPayload(
  supabase: SupabaseClient,
  payload: ProcessingPayload,
): Promise<{ status: ProcessingPayload["status"]; duplicate: boolean }> {
  const { error } = await supabase.from("paddle_event_processing").insert(payload);
  if (!error) return { status: payload.status, duplicate: false };

  const code = (error as { code?: string }).code;
  if (code === "23505") {
    return { status: payload.status, duplicate: true };
  }

  throw error;
}

async function recordProcessing(
  supabase: SupabaseClient,
  row: RecordedPaddleEventRow,
): Promise<{ status: ProcessingPayload["status"]; duplicate: boolean }> {
  try {
    return await insertProcessingPayload(supabase, buildProcessingPayload(row));
  } catch (error) {
    console.error("paddle-webhook processing_insert_failed", error);
    return await insertProcessingPayload(supabase, failedProcessingPayload(row, "processing_insert_failed"));
  }
}

async function fetchExistingPaddleEvent(
  supabase: SupabaseClient,
  eventId: string,
): Promise<RecordedPaddleEventRow | null> {
  const { data, error } = await supabase
    .from("paddle_events")
    .select("id,event_id,event_type,environment,signature_verified,payload")
    .eq("event_id", eventId)
    .single();

  if (error || !data) {
    console.error("paddle-webhook duplicate_fetch_failed", error);
    return null;
  }
  return data as RecordedPaddleEventRow;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  // Sandbox-only refusal.
  if (PADDLE_ENVIRONMENT !== "sandbox") {
    return jsonResponse(
      { error: "sandbox_only", detail: "PADDLE_ENVIRONMENT must be 'sandbox'." },
      403,
    );
  }

  if (!PADDLE_WEBHOOK_SECRET) {
    return jsonResponse({ error: "webhook_secret_missing" }, 500);
  }

  // CRITICAL: read RAW body before any parsing.
  const rawBody = await req.text();

  const sigHeader = req.headers.get("paddle-signature") ?? "";
  const parsed = parsePaddleSignature(sigHeader);
  if (!parsed) {
    return jsonResponse({ error: "invalid_signature_header" }, 400);
  }

  const expected = await hmacSha256Hex(
    PADDLE_WEBHOOK_SECRET,
    `${parsed.ts}:${rawBody}`,
  );
  const verified = constantTimeEqual(expected, parsed.h1);
  if (!verified) {
    return jsonResponse({ error: "signature_mismatch" }, 401);
  }

  // Parse only AFTER verification.
  let evt: any;
  try {
    evt = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }

  const eventId: string | undefined =
    typeof evt?.event_id === "string" ? evt.event_id : undefined;
  const eventType: string | undefined =
    typeof evt?.event_type === "string" ? evt.event_type : undefined;
  if (!eventId || !eventType) {
    return jsonResponse({ error: "missing_event_fields" }, 400);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Idempotent insert. If event_id already exists, treat as duplicate-OK and
  // re-use the existing recorded event row for processing-state recording.
  const { data: insertedEvent, error } = await supabase.from("paddle_events").insert({
    event_id: eventId,
    event_type: eventType,
    environment: PADDLE_ENVIRONMENT,
    signature_verified: true,
    payload: evt,
  }).select("id,event_id,event_type,environment,signature_verified,payload").single();

  if (error) {
    const code = (error as { code?: string }).code;
    if (code === "23505") {
      const existingEvent = await fetchExistingPaddleEvent(supabase, eventId);
      if (!existingEvent) return jsonResponse({ error: "duplicate_fetch_failed" }, 500);
      const processing = await recordProcessing(supabase, existingEvent);
      return jsonResponse({ ok: true, duplicate: true, processing }, 200);
    }
    console.error("paddle-webhook insert_failed", error);
    return jsonResponse({ error: "insert_failed" }, 500);
  }

  const processing = await recordProcessing(supabase, insertedEvent as RecordedPaddleEventRow);

  // NOTE: No entitlement changes here. Pro access is intentionally NOT
  // granted from this function until a reviewed follow-up change wires
  // entitlement updates against verified events.
  return jsonResponse({ ok: true, recorded: true, processing }, 200);
});
