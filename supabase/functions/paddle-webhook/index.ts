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
//   5. Do NOT change any user entitlement here yet. Entitlement flips are
//      intentionally deferred until a separate, reviewed change.
//
// Notes:
//   - This function does not trust any client-provided user_id.
//   - It never reads or writes private grow/plant/tent/sensor/alert data.
//   - It uses the service role only inside this trusted server context.

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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

  // Idempotent insert. If event_id already exists, treat as duplicate-OK.
  const { error } = await supabase.from("paddle_events").insert({
    event_id: eventId,
    event_type: eventType,
    environment: PADDLE_ENVIRONMENT,
    signature_verified: true,
    payload: evt,
  });

  if (error) {
    // 23505 = unique_violation → duplicate event, already recorded.
    const code = (error as { code?: string }).code;
    if (code === "23505") {
      return jsonResponse({ ok: true, duplicate: true }, 200);
    }
    return jsonResponse({ error: "insert_failed", detail: error.message }, 500);
  }

  // NOTE: No entitlement changes here. Pro access is intentionally NOT
  // granted from this function until a reviewed follow-up change wires
  // entitlement updates against verified events.
  return jsonResponse({ ok: true, recorded: true }, 200);
});
