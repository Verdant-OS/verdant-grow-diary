// V1 generic authenticated sensor webhook.
//
// Auth: accepts EITHER a Supabase Auth JWT (Bearer) OR a Verdant bridge token
// (Bearer vbt_...). Bridge tokens are tent-scoped, expiring, hashed at rest,
// and resolved server-side; revoked/expired tokens are rejected.
//
// Sensor ingest is read-only. Incoming readings are source-tagged and never
// trigger AI, alerts, Action Queue, automation, or device control directly.
// Caller-supplied `user_id` in the body is ignored.

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  normalizeWebhookIngestPayload,
  type WebhookIngestPayload,
} from "../../../src/lib/sensorWebhookIngestRules.ts";
import { buildIngestAuditRecord } from "../../../src/lib/sensorIngestAuditRules.ts";
import {
  authenticateBearer,
  tentScopeMatches,
  type AuthResult,
} from "./auth.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
  const rawToken = authHeader.replace("Bearer ", "");

  // Optional client-supplied idempotency key (recommended for bridge clients:
  // MQTT, Ecowitt, Home Assistant). The real dedupe guarantee comes from the
  // partial unique index `sensor_readings_dedupe_uidx`; this header is kept
  // for traceability in raw_payload. Capped to avoid abuse.
  const rawIdemHeader = req.headers.get("Idempotency-Key");
  const idempotencyKey =
    typeof rawIdemHeader === "string" && rawIdemHeader.length > 0
      ? rawIdemHeader.slice(0, 128)
      : null;

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return json({ error: "server_misconfigured" }, 503);
  }

  const admin = SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null;
  const anonForJwt = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${rawToken}` } },
  });

  const authRes = await authenticateBearer(rawToken, {
    serviceKeyAvailable: !!admin,
    lookupBridgeToken: async (hash) => {
      if (!admin) return { data: null, error: { message: "no admin" } };
      const r = await admin
        .from("bridge_tokens")
        .select("id, user_id, tent_id, expires_at, revoked_at")
        .eq("token_hash", hash)
        .maybeSingle();
      return { data: r.data as any, error: r.error ? { message: r.error.message } : null };
    },
    verifyJwtClaims: async (token) => {
      const { data } = await anonForJwt.auth.getClaims(token);
      return { sub: (data?.claims?.sub as string | undefined) ?? null };
    },
  });
  if (!authRes.ok) {
    const status = authRes.error === "server_misconfigured" || authRes.error === "auth_lookup_failed" ? 503 : 401;
    return json({ error: authRes.error }, status);
  }
  const auth: AuthResult = authRes.auth;

  let body: WebhookIngestPayload;
  try { body = (await req.json()) as WebhookIngestPayload; }
  catch { return json({ error: "invalid_json" }, 400); }

  const normalized = normalizeWebhookIngestPayload(body);
  if (!normalized.ok) {
    return json({ error: "invalid_payload", errors: normalized.errors }, 400);
  }

  const payloadTentId = normalized.rows[0].tent_id as string;

  if (!tentScopeMatches(auth, payloadTentId)) {
    return json({ error: "forbidden_tent" }, 403);
  }

  // For JWT path, verify tent ownership (RLS would also block).
  // For bridge path, token is already bound to a tent owned by user_id.
  if (auth.kind === "jwt") {
    const { data: tentRow, error: tentErr } = await anonForJwt
      .from("tents").select("id, user_id").eq("id", payloadTentId).maybeSingle();
    if (tentErr) return json({ error: "tent_lookup_failed" }, 503);
    if (!tentRow || tentRow.user_id !== auth.userId) {
      return json({ error: "forbidden_tent" }, 403);
    }
  }

  // Choose the client used for insert. Bridge path uses service role (token
  // already authenticated), explicitly stamping user_id on each row.
  const writer = auth.kind === "bridge" ? admin! : anonForJwt;

  const capturedAt = normalized.rows[0].captured_at as string;
  const source = normalized.rows[0].source as string;

  // Stamp user_id from auth (never from the request body) and fold the
  // Idempotency-Key header (if any) into raw_payload for traceability. The
  // real dedupe guarantee is the partial unique index
  // `sensor_readings_dedupe_uidx` enforced atomically by Postgres.
  const toInsert = normalized.rows.map((r) => {
    const raw = (r as { raw_payload?: Record<string, unknown> }).raw_payload ?? {};
    return {
      ...r,
      user_id: auth.userId,
      raw_payload: idempotencyKey
        ? ({ ...raw, idempotency_key: idempotencyKey } as unknown as typeof r.raw_payload)
        : (r.raw_payload as typeof r.raw_payload),
    };
  });

  // Atomic upsert: ON CONFLICT (user_id, tent_id, source, metric, captured_at)
  // DO NOTHING. Concurrent identical POSTs cannot create duplicates.
  const { data: upserted, error: insErr } = await writer
    .from("sensor_readings")
    .upsert(toInsert, {
      onConflict: "user_id,tent_id,source,metric,captured_at",
      ignoreDuplicates: true,
    })
    .select("id");

  if (insErr) {
    // Never leak PG error text, constraint names, payload values, tokens,
    // bridge ids, secrets, or internal table names. Log internally only.
    console.error("[sensor-ingest-webhook] insert failed", {
      auth_kind: auth.kind,
      tent_id_present: !!payloadTentId,
      // Intentionally NOT logging the raw insErr.message.
    });
    return json({ error: "insert_failed" }, 400);
  }

  const insertedCount = upserted?.length ?? 0;
  const skippedDuplicate = toInsert.length - insertedCount;


  // Bump last_used_at, first_used_at, and ingest_count atomically (server-only RPC).
  if (auth.kind === "bridge" && admin && insertedCount > 0) {
    await admin.rpc("bump_bridge_token_usage", {
      p_id: auth.tokenId,
      p_inserted: insertedCount,
    });
  }

  // Append an ingest audit record. Best-effort: never fail the ingest on
  // audit-log errors. Service role bypasses RLS; no caller-supplied fields.
  if (admin) {
    const auditRow = buildIngestAuditRecord({
      authKind: auth.kind,
      userId: auth.userId,
      tentId: payloadTentId,
      bridgeTokenId: auth.kind === "bridge" ? auth.tokenId : null,
      source,
      capturedAt: capturedAt,
      rowsReceived: normalized.rows.length,
      rowsInserted: insertedCount,
    });
    if (auditRow) {
      await admin.from("sensor_ingest_audit_log").insert(auditRow);
    }
  }


  return json({
    ok: true,
    inserted: insertedCount,
    skipped_duplicate: skippedDuplicate,
    rejected: normalized.errors,
    fingerprint: normalized.fingerprint,
    auth: auth.kind,
    idempotency_key: idempotencyKey,
  }, 200);
});

