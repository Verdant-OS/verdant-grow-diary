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

const BRIDGE_PREFIX = "vbt_";

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

type AuthResult =
  | { kind: "jwt"; userId: string; tentScope: null }
  | { kind: "bridge"; userId: string; tentScope: string; tokenId: string };

async function authenticate(
  rawToken: string,
  supabaseUrl: string,
  anonKey: string,
  serviceKey: string | undefined,
): Promise<AuthResult | { error: string; status: number }> {
  if (rawToken.startsWith(BRIDGE_PREFIX)) {
    if (!serviceKey) return { error: "server_misconfigured", status: 503 };
    // Basic shape check; reject obvious malformed tokens before DB lookup.
    if (rawToken.length < BRIDGE_PREFIX.length + 16) {
      return { error: "unauthorized", status: 401 };
    }
    const admin = createClient(supabaseUrl, serviceKey);
    const hash = await sha256Hex(rawToken);
    const { data, error } = await admin
      .from("bridge_tokens")
      .select("id, user_id, tent_id, expires_at, revoked_at")
      .eq("token_hash", hash)
      .maybeSingle();
    if (error) return { error: "auth_lookup_failed", status: 503 };
    if (!data) return { error: "unauthorized", status: 401 };
    if (data.revoked_at) return { error: "token_revoked", status: 401 };
    if (new Date(data.expires_at).getTime() <= Date.now()) {
      return { error: "token_expired", status: 401 };
    }
    return {
      kind: "bridge",
      userId: data.user_id,
      tentScope: data.tent_id,
      tokenId: data.id,
    };
  }
  // JWT path
  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${rawToken}` } },
  });
  const { data: claimsData, error: claimsErr } =
    await supabase.auth.getClaims(rawToken);
  if (claimsErr || !claimsData?.claims?.sub) {
    return { error: "unauthorized", status: 401 };
  }
  return { kind: "jwt", userId: claimsData.claims.sub as string, tentScope: null };
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

  const auth = await authenticate(
    rawToken,
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY,
  );
  if ("error" in auth) return json({ error: auth.error }, auth.status);

  let body: WebhookIngestPayload;
  try { body = (await req.json()) as WebhookIngestPayload; }
  catch { return json({ error: "invalid_json" }, 400); }

  const normalized = normalizeWebhookIngestPayload(body);
  if (!normalized.ok) {
    return json({ error: "invalid_payload", errors: normalized.errors }, 400);
  }

  const payloadTentId = normalized.rows[0].tent_id as string;

  // Bridge-token tent scope: payload tent (if present and validated) must match
  // the token's bound tent_id. Normalization always sets tent_id on rows, so we
  // can always compare here.
  if (auth.kind === "bridge" && payloadTentId !== auth.tentScope) {
    return json({ error: "forbidden_tent" }, 403);
  }

  // For JWT path, verify tent ownership (RLS would also block).
  // For bridge path, token already bound to a tent owned by user_id.
  if (auth.kind === "jwt") {
    const jwtClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${rawToken}` } },
    });
    const { data: tentRow, error: tentErr } = await jwtClient
      .from("tents").select("id, user_id").eq("id", payloadTentId).maybeSingle();
    if (tentErr) return json({ error: "tent_lookup_failed" }, 503);
    if (!tentRow || tentRow.user_id !== auth.userId) {
      return json({ error: "forbidden_tent" }, 403);
    }
  }

  // Choose the client used for read+insert. Bridge path uses service role
  // (token already authenticated), explicitly stamping user_id on each row.
  const writer =
    auth.kind === "bridge"
      ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY!)
      : createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          global: { headers: { Authorization: `Bearer ${rawToken}` } },
        });

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

  // Bump last_used_at only on successful insert.
  if (auth.kind === "bridge") {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY!);
    await admin
      .from("bridge_tokens")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", auth.tokenId);
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
