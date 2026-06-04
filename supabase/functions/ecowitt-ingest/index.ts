// EcoWitt custom-upload listener — Option C router-wired (read-only).
//
// Accepts an EcoWitt gateway custom-upload payload (query/form-style flat
// fields or JSON) and routes per-channel readings to whichever owned tent
// declares those channels in `tents.hardware_config.ecowitt`.
//
// Safety contract (stop-ship if violated):
//   - Read-only. NEVER triggers alerts, Action Queue, AI, automation, or
//     device control.
//   - Authentication MUST be a Verdant bridge token (vbt_...) or a Supabase
//     Auth JWT. The EcoWitt PASSKEY is ONLY used as a one-way fingerprint
//     to identify which gateway sent the payload; it is NEVER an auth
//     factor and NEVER trusted to map to a user.
//   - For bridge tokens, eligible tents are restricted to the bridge's
//     tent scope (defense in depth — a compromised gateway cannot fan out
//     to other tents the user owns).
//   - For JWT callers, eligible tents are all tents the JWT user owns
//     whose `hardware_config.ecowitt` is configured.
//   - Caller-supplied `user_id` is ignored; user_id is stamped from auth.
//   - Vendor credentials (passkey, MAC, application_key, token, …) are
//     stripped before any `raw_payload` is built. Only the safe
//     fingerprint and per-channel mapping context are persisted.
//   - All readings are tagged `source = 'ecowitt'` so Verdant-side rules
//     can apply EcoWitt-specific freshness/suspicion logic. We do NOT
//     introduce a new `ecowitt_live` source label.
//   - Failures that are not authentication failures (missing PASSKEY,
//     unknown fingerprint, no eligible tent for any channel) return
//     200 with `{ accepted: false, inserted: 0 }` so the gateway does not
//     retry-storm.

import { createClient } from "npm:@supabase/supabase-js@2";
import { authenticateBearer, type AuthResult } from "../sensor-ingest-webhook/auth.ts";
import { computeEcoWittPasskeyFingerprint } from "../../../src/lib/ecowittPasskeyFingerprint.ts";
import {
  buildEcoWittRoutedRows,
  parseEcoWittDateUtc,
  type EcoWittRoutedRow,
  type EcoWittTimestampSource,
} from "../../../src/lib/ecowittRoutedRowBuilder.ts";
import type { EcoWittRouterEligibleTent } from "../../../src/lib/ecowittChannelTentRouter.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-verdant-tent-id",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Fields we will NEVER echo, persist, or log raw. Mirrors the credential
// list inside `ecowittPayloadAdapter` plus client-supplied id fields.
const CREDENTIAL_LIKE_KEYS = new Set([
  "passkey",
  "mac",
  "api_key",
  "apikey",
  "application_key",
  "applicationkey",
  "appkey",
  "token",
  "auth",
  "authorization",
  "service_role",
  "user_id",
  "tent_id",
]);

async function parsePayload(
  req: Request,
): Promise<Record<string, unknown> | null> {
  if (req.method === "GET") {
    const url = new URL(req.url);
    const out: Record<string, unknown> = {};
    for (const [k, v] of url.searchParams.entries()) {
      if (k === "tent_id") continue;
      out[k] = v;
    }
    return out;
  }
  const ctype = (req.headers.get("Content-Type") ?? "").toLowerCase();
  try {
    if (ctype.includes("application/json")) {
      const v = await req.json();
      return v && typeof v === "object" && !Array.isArray(v)
        ? (v as Record<string, unknown>)
        : null;
    }
    if (
      ctype.includes("application/x-www-form-urlencoded") ||
      ctype.includes("multipart/form-data")
    ) {
      const form = await req.formData();
      const out: Record<string, unknown> = {};
      for (const [k, v] of form.entries())
        out[k] = typeof v === "string" ? v : null;
      return out;
    }
    const text = await req.text();
    if (!text) return {};
    try {
      const v = JSON.parse(text);
      return v && typeof v === "object" && !Array.isArray(v)
        ? (v as Record<string, unknown>)
        : null;
    } catch {
      const params = new URLSearchParams(text);
      const out: Record<string, unknown> = {};
      for (const [k, v] of params.entries()) out[k] = v;
      return out;
    }
  } catch {
    return null;
  }
}

/** Extract the raw PASSKEY (case-insensitive) before sanitization. */
function extractRawPasskey(payload: Record<string, unknown>): string | null {
  for (const [k, v] of Object.entries(payload)) {
    if (k.toLowerCase() === "passkey" && typeof v === "string" && v.length > 0) {
      return v;
    }
  }
  return null;
}

/** Strip credential-like keys before passing into the router. */
function sanitizePayload(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (CREDENTIAL_LIKE_KEYS.has(k.toLowerCase())) continue;
    out[k] = v;
  }
  return out;
}

interface TentHardwareConfigRow {
  id: string;
  hardware_config: unknown;
}

function parseEligibleTents(
  rows: TentHardwareConfigRow[],
): EcoWittRouterEligibleTent[] {
  const out: EcoWittRouterEligibleTent[] = [];
  for (const row of rows) {
    const hc = row.hardware_config;
    if (!hc || typeof hc !== "object") continue;
    const eco = (hc as Record<string, unknown>).ecowitt;
    if (!eco || typeof eco !== "object") continue;
    const e = eco as Record<string, unknown>;
    const fp = typeof e.passkey_fingerprint === "string" ? e.passkey_fingerprint : null;
    if (!fp) continue;
    const air = Array.isArray(e.air_channels)
      ? e.air_channels.filter((n): n is number => typeof n === "number" && n >= 1 && n <= 8)
      : [];
    const soil = Array.isArray(e.soil_channels)
      ? e.soil_channels.filter((n): n is number => typeof n === "number" && n >= 1 && n <= 8)
      : [];
    if (air.length === 0 && soil.length === 0) continue;
    out.push({
      tent_id: row.id,
      passkey_fingerprint: fp,
      air_channels: air,
      soil_channels: soil,
    });
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST" && req.method !== "GET") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer "))
    return json({ error: "unauthorized" }, 401);
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
      return {
        data: r.data as never,
        error: r.error ? { message: r.error.message } : null,
      };
    },
    verifyJwtClaims: async (token) => {
      const { data } = await anonForJwt.auth.getClaims(token);
      return { sub: (data?.claims?.sub as string | undefined) ?? null };
    },
  });
  if (!authRes.ok) {
    const status =
      authRes.error === "server_misconfigured" ||
      authRes.error === "auth_lookup_failed"
        ? 503
        : 401;
    return json({ error: authRes.error }, status);
  }
  const auth: AuthResult = authRes.auth;

  // For bridge auth, restrict the eligible-tent search to the bridge's tent
  // scope. For JWT auth, optionally accept a tent_id hint but otherwise
  // consider all the user's configured tents. We NEVER trust a tent_id
  // from the EcoWitt payload itself.
  let scopedTentId: string | null = null;
  if (auth.kind === "bridge") {
    scopedTentId = auth.tentScope;
  } else {
    const url = new URL(req.url);
    const hinted =
      url.searchParams.get("tent_id") ??
      req.headers.get("X-Verdant-Tent-Id") ??
      null;
    if (hinted) {
      if (!UUID_RE.test(hinted)) {
        return json({ error: "tent_id_invalid" }, 400);
      }
      scopedTentId = hinted;
    }
  }

  const payload = await parsePayload(req);
  if (!payload) return json({ error: "invalid_payload" }, 400);

  // Compute fingerprint from the raw PASSKEY BEFORE we strip it.
  const rawPasskey = extractRawPasskey(payload);
  const fingerprint = await computeEcoWittPasskeyFingerprint(rawPasskey);

  // Sanitize before anything else uses the payload.
  const safePayload = sanitizePayload(payload);

  // Look up eligible tents. Use admin client for bridge auth (RLS-equivalent
  // is enforced by the tent_id filter we just locked down); use the
  // user-scoped anon client for JWT callers (RLS enforces ownership).
  const reader = auth.kind === "bridge" && admin ? admin : anonForJwt;
  let tentQuery = reader
    .from("tents")
    .select("id, hardware_config")
    .eq("user_id", auth.userId)
    .eq("is_archived", false)
    .not("hardware_config", "is", null);
  if (scopedTentId) tentQuery = tentQuery.eq("id", scopedTentId);
  const { data: tentRows, error: tentErr } = await tentQuery;

  if (tentErr) {
    // Do NOT leak SQL detail to the gateway. Terse error only.
    console.error("[ecowitt-ingest] tent_lookup_failed", {
      auth_kind: auth.kind,
    });
    return json(
      { ok: true, accepted: false, inserted: 0, reason: "tent_lookup_failed" },
      200,
    );
  }

  const eligibleTents = parseEligibleTents(
    (tentRows ?? []) as TentHardwareConfigRow[],
  );

  const capturedAt = new Date().toISOString();
  const { rows, summary } = buildEcoWittRoutedRows({
    userId: auth.userId,
    payload: safePayload,
    payloadPasskeyFingerprint: fingerprint,
    eligibleTents,
    capturedAt,
  });

  if (rows.length === 0) {
    // 200 OK with accepted:false covers: missing PASSKEY, unknown
    // fingerprint, no channel mapped to any owned tent, all values invalid.
    return json(
      {
        ok: true,
        accepted: false,
        inserted: 0,
        per_tent: summary.per_tent,
        dropped: summary.dropped,
        auth: auth.kind,
      },
      200,
    );
  }

  const writer = auth.kind === "bridge" ? admin! : anonForJwt;
  const insertRows: EcoWittRoutedRow[] = rows;

  const { data: upserted, error: insErr } = await writer
    .from("sensor_readings")
    .upsert(insertRows, {
      onConflict: "user_id,tent_id,source,metric,captured_at",
      ignoreDuplicates: true,
    })
    .select("id");

  if (insErr) {
    console.error("[ecowitt-ingest] insert_failed", {
      auth_kind: auth.kind,
      rows: rows.length,
    });
    return json({ ok: false, accepted: false, inserted: 0, error: "insert_failed" }, 200);
  }

  const inserted = upserted?.length ?? 0;
  if (auth.kind === "bridge" && admin && inserted > 0) {
    await admin.rpc("bump_bridge_token_usage", {
      p_id: auth.tokenId,
      p_inserted: inserted,
    });
  }

  return json(
    {
      ok: true,
      accepted: inserted > 0,
      inserted,
      skipped_duplicate: rows.length - inserted,
      per_tent: summary.per_tent,
      dropped: summary.dropped,
      auth: auth.kind,
    },
    200,
  );
});
