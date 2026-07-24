// EcoWitt custom-upload listener — Option C router-wired (read-only).
//
// Accepts an EcoWitt gateway custom-upload payload (query/form-style flat
// fields or JSON) and routes per-channel readings to whichever owned tent
// declares those channels in `tents.hardware_config.ecowitt`.
//
// Safety contract (stop-ship if violated):
//   - Read-only. NEVER triggers alerts, Action Queue, AI, automation, or
//     device control.
//   - Authentication MUST be a Verdant bridge token (vbt_...). Ordinary user
//     JWTs cannot create trusted live telemetry. The EcoWitt PASSKEY is ONLY
//     used as a one-way fingerprint
//     to identify which gateway sent the payload; it is NEVER an auth
//     factor and NEVER trusted to map to a user.
//   - Eligible tents are restricted to the bridge's
//     tent scope (defense in depth — a compromised gateway cannot fan out
//     to other tents the user owns).
//   - Caller-supplied `user_id` is ignored; user_id is stamped from auth.
//   - Vendor credentials (passkey, MAC, application_key, token, …) are
//     stripped before any `raw_payload` is built. Only the safe
//     fingerprint and per-channel mapping context are persisted.
//   - Freshness-approved readings persist with canonical `source = 'live'`.
//     EcoWitt vendor/transport lineage stays explicit in `raw_payload`; we
//     never introduce an `ecowitt_live` source label.
//   - Failures that are not authentication failures (missing PASSKEY,
//     unknown fingerprint, no eligible tent for any channel) return
//     200 with `{ accepted: false, inserted: 0 }` so the gateway does not
//     retry-storm.

import { createClient } from "npm:@supabase/supabase-js@2";
import { authenticateBearer } from "../_shared/sensorIngestAuth.ts";
import { classifyIngestTimestampFreshness } from "../_shared/sensorIngestFreshness.ts";
import { computeEcoWittPasskeyFingerprint } from "../_shared/ecowittPasskeyFingerprint.ts";
import {
  buildEcoWittRoutedRows,
  buildEcoWittStoredRows,
  parseEcoWittDateUtc,
  type EcoWittStoredRow,
  type EcoWittTimestampSource,
} from "../_shared/ecowittRoutedRowBuilder.ts";
import type { EcoWittRouterEligibleTent } from "../_shared/ecowittChannelTentRouter.ts";

export interface EcoWittIngestAdminClient {
  // Supabase's generated query-builder type resolves untyped Edge schemas to
  // `never`; the handler intentionally exposes only these two runtime methods.
  // deno-lint-ignore no-explicit-any
  from(table: string): any;
  rpc(name: string, args: Record<string, unknown>): PromiseLike<unknown>;
}

export interface EcoWittIngestHandlerDeps {
  /** Test-only seam. Production resolves the service client from Deno env. */
  admin?: EcoWittIngestAdminClient;
  /** One request clock shared by auth and gateway timestamp validation. */
  now?: () => Date;
}

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

async function parsePayload(req: Request): Promise<Record<string, unknown> | null> {
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
      for (const [k, v] of form.entries()) out[k] = typeof v === "string" ? v : null;
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

function extractPayloadValueCaseInsensitive(
  payload: Record<string, unknown>,
  wantedKey: string,
): unknown {
  const wanted = wantedKey.toLowerCase();
  for (const [k, v] of Object.entries(payload)) {
    if (k.toLowerCase() === wanted) return v;
  }
  return null;
}

/** Extract the raw PASSKEY (case-insensitive) before sanitization. */
function extractRawPasskey(payload: Record<string, unknown>): string | null {
  const value = extractPayloadValueCaseInsensitive(payload, "passkey");
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Strip credential-like keys before passing into the router. */
function sanitizePayload(payload: Record<string, unknown>): Record<string, unknown> {
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

function parseEligibleTents(rows: TentHardwareConfigRow[]): EcoWittRouterEligibleTent[] {
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

export async function handleEcoWittIngestRequest(
  req: Request,
  deps: EcoWittIngestHandlerDeps = {},
): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST" && req.method !== "GET") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
  const rawToken = authHeader.replace("Bearer ", "");

  let admin = deps.admin;
  if (!admin) {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return json({ error: "server_misconfigured" }, 503);
    }
    admin = createClient(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
    ) as unknown as EcoWittIngestAdminClient;
  }
  const requestNow = deps.now?.() ?? new Date();

  const authRes = await authenticateBearer(rawToken, {
    serviceKeyAvailable: true,
    allowJwt: false,
    now: () => requestNow.getTime(),
    lookupBridgeToken: async (hash) => {
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
    verifyJwtClaims: async () => ({ sub: null }),
  });
  if (!authRes.ok) {
    const status =
      authRes.error === "bridge_required"
        ? 403
        : authRes.error === "server_misconfigured" || authRes.error === "auth_lookup_failed"
          ? 503
          : 401;
    return json({ error: authRes.error }, status);
  }
  if (authRes.auth.kind !== "bridge") {
    return json({ error: "bridge_required" }, 403);
  }
  const auth = authRes.auth;

  // The authenticated bridge token is the only tent-routing authority.
  // Query parameters, headers, and payload fields cannot widen this scope.
  const scopedTentId = auth.tentScope;

  const payload = await parsePayload(req);
  if (!payload) return json({ error: "invalid_payload" }, 400);

  // Compute fingerprint from the raw PASSKEY BEFORE we strip it.
  const rawPasskey = extractRawPasskey(payload);
  const fingerprint = await computeEcoWittPasskeyFingerprint(rawPasskey);

  // Sanitize before anything else uses the payload.
  const safePayload = sanitizePayload(payload);

  // The service client is restricted by both server-resolved user_id and the
  // bridge token's tent scope before any configured channel is considered.
  let tentQuery = admin
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
    return json({ ok: true, accepted: false, inserted: 0, reason: "tent_lookup_failed" }, 200);
  }

  const eligibleTents = parseEligibleTents((tentRows ?? []) as TentHardwareConfigRow[]);

  // Trusted live telemetry must carry a valid gateway event time. Never
  // substitute server receive time: that would make stale replays look fresh
  // and evade the captured_at-based dedupe key.
  const receivedAt = requestNow;
  const dateutcRaw = extractPayloadValueCaseInsensitive(payload, "dateutc");
  const parsedDateUtc = parseEcoWittDateUtc(dateutcRaw, receivedAt);
  if (!parsedDateUtc) {
    return json(
      {
        ok: true,
        accepted: false,
        inserted: 0,
        reason: "timestamp_invalid",
        auth: auth.kind,
      },
      200,
    );
  }
  if (Date.parse(parsedDateUtc) > receivedAt.getTime() + 5 * 60_000) {
    return json(
      {
        ok: true,
        accepted: false,
        inserted: 0,
        reason: "timestamp_future",
        auth: auth.kind,
      },
      200,
    );
  }
  if (classifyIngestTimestampFreshness(parsedDateUtc, { now: receivedAt }) === "stale") {
    return json(
      {
        ok: true,
        accepted: false,
        inserted: 0,
        reason: "timestamp_stale",
        auth: auth.kind,
      },
      200,
    );
  }
  const capturedAt = parsedDateUtc;
  const timestampSource: EcoWittTimestampSource = "ecowitt_dateutc";

  const { rows, summary } = buildEcoWittRoutedRows({
    userId: auth.userId,
    payload: safePayload,
    payloadPasskeyFingerprint: fingerprint,
    eligibleTents,
    capturedAt,
    timestampSource,
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

  // Timestamp freshness is proven above. Canonicalize only at this final
  // server-side storage boundary so stale packets can never become live.
  const insertRows: EcoWittStoredRow[] = buildEcoWittStoredRows(rows);

  const { data: upserted, error: insErr } = await admin
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
  if (inserted > 0) {
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
}

// Importing this module from Deno tests must never bind a listener.
if (import.meta.main) {
  Deno.serve((req) => handleEcoWittIngestRequest(req));
}
