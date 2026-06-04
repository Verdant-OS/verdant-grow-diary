// EcoWitt custom-upload listener (read-only).
//
// Accepts an EcoWitt gateway custom-upload payload (query/form-style flat
// fields or JSON) and writes normalized sensor_readings rows for the tent
// resolved by the bearer credential.
//
// Safety contract (stop-ship if violated):
//   - Read-only. NEVER triggers alerts, Action Queue, AI, automation, or
//     device control.
//   - Authentication MUST be a Verdant bridge token (vbt_...) or a Supabase
//     Auth JWT. Bridge tokens are tent-scoped and hashed at rest.
//   - tent_id is server-resolved from the bridge token; never trusted from
//     the EcoWitt payload. JWT callers MUST pass `?tent_id=` (or X-Verdant-
//     Tent-Id header) and tent ownership is verified against `tents`.
//   - Caller-supplied `user_id` is ignored; user_id is stamped from auth.
//   - Vendor credentials (passkey, MAC, …) are suppressed by the adapter and
//     never persisted to raw_payload.
//   - All readings are tagged `source = 'ecowitt'` so Verdant-side rules
//     can apply EcoWitt-specific freshness/suspicion logic.

import { createClient } from "npm:@supabase/supabase-js@2";
import { adaptEcoWittPayloadToBridgeInput } from "../../../src/lib/ecowittPayloadAdapter.ts";
import { authenticateBearer, type AuthResult } from "../sensor-ingest-webhook/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-verdant-tent-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function parsePayload(req: Request): Promise<Record<string, unknown> | null> {
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
    // Fallback: try JSON first, then querystring-encoded body.
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

  // Resolve tent_id: bridge token → token scope; JWT → query/header.
  let tentId: string | null = null;
  if (auth.kind === "bridge") {
    tentId = auth.tentScope;
  } else {
    const url = new URL(req.url);
    tentId =
      url.searchParams.get("tent_id") ??
      req.headers.get("X-Verdant-Tent-Id") ??
      null;
    if (!tentId || !UUID_RE.test(tentId)) {
      return json({ error: "tent_id_required" }, 400);
    }
    // Verify tent ownership.
    const { data: tentRow, error: tentErr } = await anonForJwt
      .from("tents")
      .select("id, user_id")
      .eq("id", tentId)
      .maybeSingle();
    if (tentErr) return json({ error: "tent_lookup_failed" }, 503);
    if (!tentRow || tentRow.user_id !== auth.userId) {
      return json({ error: "forbidden_tent" }, 403);
    }
  }

  const payload = await parsePayload(req);
  if (!payload) return json({ error: "invalid_payload" }, 400);

  const adapter = adaptEcoWittPayloadToBridgeInput(payload, {
    tentId,
    allowServerReceivedAtFallback: true,
    serverReceivedAt: new Date().toISOString(),
  });

  if (!adapter.ok || adapter.input.readings.length === 0) {
    return json(
      { error: "no_readings_mapped", reasons: adapter.reasons, warnings: adapter.warnings },
      400,
    );
  }

  const capturedAt =
    typeof adapter.input.captured_at === "string"
      ? adapter.input.captured_at
      : new Date().toISOString();

  // Build sensor_readings rows. Vendor lineage rides in raw_payload.vendor;
  // credentials were already suppressed by the adapter.
  const rows = adapter.input.readings.map((r) => ({
    user_id: auth.userId,
    tent_id: tentId,
    source: "ecowitt" as const,
    metric: r.metric as string,
    value: r.value as number,
    captured_at: capturedAt,
    quality: "ok" as const,
    raw_payload: {
      vendor: "ecowitt",
      station_type: adapter.metadata.station_type,
      adapter_warnings: adapter.warnings,
      unit: r.unit ?? null,
    },
  }));

  const writer = auth.kind === "bridge" ? admin! : anonForJwt;

  const { data: upserted, error: insErr } = await writer
    .from("sensor_readings")
    .upsert(rows, {
      onConflict: "user_id,tent_id,source,metric,captured_at",
      ignoreDuplicates: true,
    })
    .select("id");

  if (insErr) {
    console.error("[ecowitt-ingest] insert failed", {
      auth_kind: auth.kind,
      tent_id_present: !!tentId,
    });
    return json({ error: "insert_failed" }, 400);
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
      inserted,
      skipped_duplicate: rows.length - inserted,
      warnings: adapter.warnings,
      auth: auth.kind,
    },
    200,
  );
});
