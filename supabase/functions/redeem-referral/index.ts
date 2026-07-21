/**
 * redeem-referral — the ONLY path that fires a VERIFIED referral conversion
 * (give 10 / get 10 AI credits) from a client-reachable surface.
 *
 * Security contract:
 *  - Identity is the caller's JWT (auth.getUser on the forwarded header).
 *    The referee is ALWAYS auth.uid(); the body never names a user.
 *  - Email confirmation is re-checked SERVER-side (user.email_confirmed_at);
 *    a client cannot force verified=true.
 *  - Credit environment comes from server secrets via the strict resolver
 *    (PAYMENTS_ENVIRONMENT) — the repo invariant for anything that writes
 *    environment-tagged credit grants. Missing/invalid → fail closed, no grant.
 *  - The code (from the referee's own auth metadata, else the request body
 *    for the OAuth bridge) is a LOOKUP KEY into profiles.referral_code; every
 *    grant guard (anti-self-referral, one-referral-per-referee, idempotent
 *    dual grant) lives in the service-role-only convert_referral RPC.
 *  - Fresh attributions (no pending row recorded at signup) are accepted only
 *    for YOUNG accounts (48h) — an established account cannot be retro-claimed
 *    as someone's referee to farm credits. Pending rows recorded by the signup
 *    trigger convert regardless of age (the attribution was bound at signup).
 *
 * Responses: { ok, status, terminal? } — terminal reasons are permanent
 * (client clears pending state); non-terminal failures are retryable.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
// Self-contained twin of the resolver in _shared/unionEntitlementLookup.ts —
// this function must bundle from supabase/functions/** alone (Lovable deploy).
import { resolveRequiredServerBillingEnvironment } from "../_shared/serverBillingEnvironment.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FRESH_ATTRIBUTION_MAX_AGE_MS = 48 * 60 * 60 * 1_000;
const CODE_PATTERN = /^[a-z0-9]{6,16}$/;

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function sanitizeCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toLowerCase();
  return CODE_PATTERN.test(code) ? code : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { ok: false, status: "method_not_allowed" });

  try {
    // 1) Verified caller identity — the referee is always the JWT user.
    const auth = req.headers.get("Authorization");
    if (!auth) return json(401, { ok: false, status: "unauthorized" });
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return json(500, { ok: false, status: "not_configured" });
    }
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userError } = await callerClient.auth.getUser();
    const user = userData?.user;
    if (userError || !user) return json(401, { ok: false, status: "unauthorized" });

    // 2) Server-authoritative environment. Fail closed — no env, no grant.
    const envResolution = resolveRequiredServerBillingEnvironment();
    if (!envResolution.ok) {
      return json(500, { ok: false, status: "environment_unresolved" });
    }
    const environment = envResolution.environment;

    // 3) The code claim: the referee's own auth metadata wins (email signups);
    //    the body covers the OAuth bridge, where metadata cannot carry it.
    let bodyCode: unknown = null;
    try {
      const body = await req.json();
      bodyCode = (body as { code?: unknown })?.code ?? null;
    } catch {
      /* empty body is fine when metadata carries the code */
    }
    const code =
      sanitizeCode((user.user_metadata as Record<string, unknown> | null)?.["verdant_ref_code"]) ??
      sanitizeCode(bodyCode);
    if (!code) return json(200, { ok: false, status: "no_code", terminal: true });

    const service = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 4) Fresh-attribution age gate: without a pending row from the signup
    //    trigger, only young accounts may create a new attribution.
    const { data: existing, error: existingError } = await service
      .from("referrals")
      .select("id,status")
      .eq("referee_user_id", user.id)
      .maybeSingle();
    if (existingError) return json(500, { ok: false, status: "lookup_failed" });
    if (!existing) {
      const createdAtMs = Date.parse(user.created_at ?? "");
      if (
        !Number.isFinite(createdAtMs) ||
        Date.now() - createdAtMs > FRESH_ATTRIBUTION_MAX_AGE_MS
      ) {
        return json(200, { ok: false, status: "stale_account", terminal: true });
      }
    }

    // 5) Resolve the referrer from the trusted code column (server-side only).
    const { data: referrerRow, error: referrerError } = await service
      .from("profiles")
      .select("user_id")
      .eq("referral_code", code)
      .maybeSingle();
    if (referrerError) return json(500, { ok: false, status: "lookup_failed" });
    const referrerId = (referrerRow as { user_id?: string } | null)?.user_id;
    if (!referrerId) return json(200, { ok: false, status: "unknown_code", terminal: true });

    // 6) Convert. verified is the SERVER's view of email confirmation.
    const { data, error } = await service.rpc("convert_referral", {
      p_referrer_user_id: referrerId,
      p_referee_user_id: user.id,
      p_code: code,
      p_environment: environment,
      p_verified: user.email_confirmed_at != null,
    });
    if (error) return json(500, { ok: false, status: "convert_failed" });
    const payload = (data ?? {}) as { ok?: boolean; reason?: string };
    if (payload.ok === true) {
      const status =
        payload.reason === "idempotent"
          ? "idempotent"
          : payload.reason === "pending"
            ? "pending"
            : "converted";
      return json(200, { ok: true, status });
    }
    if (payload.reason === "self_referral" || payload.reason === "referee_already_referred") {
      return json(200, { ok: false, status: payload.reason, terminal: true });
    }
    return json(500, { ok: false, status: payload.reason ?? "convert_failed" });
  } catch {
    return json(500, { ok: false, status: "internal" });
  }
});
