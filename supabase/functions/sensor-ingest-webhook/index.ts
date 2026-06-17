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
} from "./webhookIngest.ts";
import { buildIngestAuditRecord } from "./ingestAudit.ts";
import {
  authenticateBearer,
  tentScopeMatches,
  type AuthResult,
} from "./auth.ts";
import { sanitizeForResponse, safeLog } from "./sanitize.ts";
import {
  buildStoredRow,
  classifyInsertError,
} from "./storageMapping.ts";



// Centralized CORS handling. Allowed origins are explicit — no wildcard is
// returned when an Authorization or bridge token may be present. Every
// response path (success, auth failure, validation failure, method not
// allowed, malformed JSON, unexpected error) MUST include these headers so
// the browser surfaces real HTTP statuses instead of collapsing to status 0.
const ALLOWED_ORIGINS = new Set<string>([
  "https://verdantgrowdiary.com",
  "https://www.verdantgrowdiary.com",
  "https://verdantgrowdiary-com.lovable.app",
  "http://localhost:5173",
  "http://localhost:3000",
  "http://localhost:8080",
]);

function buildCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const allowOrigin = ALLOWED_ORIGINS.has(origin)
    ? origin
    : "https://verdantgrowdiary.com";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, content-type, apikey, x-client-info, x-verdant-bridge-token, x-verdant-tent-id, idempotency-key",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(req: Request, body: unknown, status: number) {
  const safe = sanitizeForResponse(body);
  return new Response(JSON.stringify(safe), {
    status,
    headers: { ...buildCorsHeaders(req), "Content-Type": "application/json" },
  });
}


// Exported for Deno-based CORS + secret-leakage tests. Behavior is identical
// to the live serve handler: OPTIONS short-circuits before auth/body/DB, and
// any thrown error is caught so the browser still sees CORS-tagged JSON.
export async function handleRequest(req: Request): Promise<Response> {
  // OPTIONS preflight: respond before auth, body parsing, or DB lookups.
  // No bridge token required. No telemetry classification. No writes.
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: buildCorsHeaders(req) });
  }
  try {
    return await handle(req);
  } catch (_err) {
    // Never leak error text, stack traces, tokens, or PG details.
    safeLog("internal_error");
    return json(req, { error: "internal_error" }, 500);
  }
}



// Only start the HTTP listener when run as the main module (Supabase Edge
// Runtime). Importing this file from a Deno test must NOT bind a port.
if (import.meta.main) {
  Deno.serve(handleRequest);
}



async function handle(req: Request): Promise<Response> {
  if (req.method !== "POST") return json(req, { error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json(req, { error: "unauthorized" }, 401);
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
    return json(req, { error: "server_misconfigured" }, 503);
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
    return json(req, { error: authRes.error }, status);
  }
  const auth: AuthResult = authRes.auth;

  let body: WebhookIngestPayload;
  try { body = (await req.json()) as WebhookIngestPayload; }
  catch { return json(req, { error: "invalid_json" }, 400); }

  const normalized = normalizeWebhookIngestPayload(body);
  if (!normalized.ok) {
    return json(req, { error: "invalid_payload", errors: normalized.errors }, 400);
  }

  const payloadTentId = normalized.rows[0].tent_id as string;

  if (!tentScopeMatches(auth, payloadTentId)) {
    return json(req, { error: "forbidden_tent" }, 403);
  }

  // For JWT path, verify tent ownership (RLS would also block).
  // For bridge path, token is already bound to a tent owned by user_id.
  if (auth.kind === "jwt") {
    const { data: tentRow, error: tentErr } = await anonForJwt
      .from("tents").select("id, user_id").eq("id", payloadTentId).maybeSingle();
    if (tentErr) return json(req, { error: "tent_lookup_failed" }, 503);
    if (!tentRow || tentRow.user_id !== auth.userId) {
      return json(req, { error: "forbidden_tent" }, 403);
    }
  }

  // Choose the client used for insert. Bridge path uses service role (token
  // already authenticated), explicitly stamping user_id on each row.
  const writer = auth.kind === "bridge" ? admin! : anonForJwt;

  const capturedAt = normalized.rows[0].captured_at as string;
  const source = normalized.rows[0].source as string;

  // Stamp user_id from auth (never from the request body), remap the
  // transport/vendor source label to a canonical stored source per the
  // Verdant sensor-truth contract (e.g. "ecowitt" -> "live"), and fold
  // the Idempotency-Key header (if any) into raw_payload for
  // traceability. The real dedupe guarantee is the partial unique index
  // `sensor_readings_dedupe_uidx` enforced atomically by Postgres.
  const toInsert = normalized.rows.map((r) =>
    buildStoredRow({
      row: r as unknown as Record<string, unknown>,
      userId: auth.userId,
      idempotencyKey,
    }),
  );

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
    // Classify into a stable, sanitized reason code. Never leak raw PG
    // error text, constraint names, payload values, tokens, bridge ids,
    // secrets, or internal table names.
    const reason = classifyInsertError(
      insErr as { code?: string | null; message?: string | null },
    );
    safeLog("insert_failed", {
      auth_kind: auth.kind,
      tent_id_present: !!payloadTentId,
      reason,
    });
    return json(req, { error: "insert_failed", reason }, 400);
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


  return json(req, {
    ok: true,
    inserted: insertedCount,
    skipped_duplicate: skippedDuplicate,
    rejected: normalized.errors,
    fingerprint: normalized.fingerprint,
    auth: auth.kind,
    idempotency_key: idempotencyKey,
  }, 200);
}

