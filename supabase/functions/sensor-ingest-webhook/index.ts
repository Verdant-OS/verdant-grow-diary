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

  // Choose the client used for read+insert. Bridge path uses service role
  // (token already authenticated), explicitly stamping user_id on each row.
  const writer = auth.kind === "bridge" ? admin! : anonForJwt;

  const capturedAt = normalized.rows[0].captured_at as string;
  const source = normalized.rows[0].source as string;
  const { data: existing } = await writer
    .from("sensor_readings")
    .select("metric, value")
    .eq("tent_id", payloadTentId)
    .eq("source", source)
    .eq("captured_at", capturedAt);

  const existingKey = new Set(
    (existing ?? []).map((r) => `${r.metric}:${Number(r.value).toFixed(6)}`),
  );
  const toInsert = normalized.rows
    .filter(
      (r) => !existingKey.has(
        `${r.metric}:${Number(r.value as number).toFixed(6)}`,
      ),
    )
    .map((r) => ({ ...r, user_id: auth.userId }));

  if (toInsert.length === 0) {
    return json({
      ok: true,
      inserted: 0,
      skipped_duplicate: normalized.rows.length,
      rejected: normalized.errors,
    }, 200);
  }

  const { error: insErr } = await writer.from("sensor_readings").insert(toInsert);
  if (insErr) {
    return json({ error: "insert_failed", detail: insErr.message }, 400);
  }

  // Bump last_used_at, first_used_at, and ingest_count atomically (server-only RPC).
  if (auth.kind === "bridge" && admin) {
    await admin.rpc("bump_bridge_token_usage", {
      p_id: auth.tokenId,
      p_inserted: toInsert.length,
    });
  }

  return json({
    ok: true,
    inserted: toInsert.length,
    skipped_duplicate: normalized.rows.length - toInsert.length,
    rejected: normalized.errors,
    fingerprint: normalized.fingerprint,
    auth: auth.kind,
  }, 200);
});
