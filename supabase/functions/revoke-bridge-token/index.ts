// Revoke a bridge token. Owner-only; sets revoked_at.
//
// Runs under the caller's JWT (anon key + forwarded Authorization header),
// so RLS enforces ownership; the `.eq("user_id", userId)` filter is
// defense-in-depth on top of that. Revocation is one-way at the DB layer:
// bridge_tokens_guard_immutables rejects client-role attempts to clear or
// move revoked_at. See docs/bridge-sensor-ingest-security-audit-checklist.md §9.
import { createClient } from "npm:@supabase/supabase-js@2";

export interface RevokeBridgeTokenClient {
  auth: {
    getClaims(token: string): PromiseLike<{
      data?: { claims?: { sub?: string | null } | null } | null;
      error?: unknown;
    }>;
  };
  // Supabase's generated Edge schema resolves untyped tables to `never`.
  // Keep this handler seam limited to the runtime query-builder method.
  // deno-lint-ignore no-explicit-any
  from(table: string): any;
}

export interface RevokeBridgeTokenHandlerDeps {
  /** Test-only seam. Production creates a caller-JWT Supabase client. */
  supabase?: RevokeBridgeTokenClient;
  /** One request clock; stamps revoked_at. */
  now?: () => Date;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (b: unknown, s: number) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

export async function handleRequest(
  req: Request,
  deps: RevokeBridgeTokenHandlerDeps = {},
): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

  let supabase = deps.supabase;
  if (!supabase) {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return json({ error: "server_misconfigured" }, 503);
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    }) as unknown as RevokeBridgeTokenClient;
  }

  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(token);
  if (claimsErr || !claimsData?.claims?.sub) return json({ error: "unauthorized" }, 401);
  const userId = claimsData.claims.sub as string;

  let body: { id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const id = String(body.id || "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "invalid_id" }, 400);

  // Stamp only rows that are not yet revoked: the DB guard makes revoked_at
  // one-way for client roles, so re-stamping an existing revocation would
  // raise. Filtering on IS NULL keeps bridge retries calm and idempotent.
  const revokedAt = (deps.now?.() ?? new Date()).toISOString();
  const { error: updErr, data } = await supabase
    .from("bridge_tokens")
    .update({ revoked_at: revokedAt })
    .eq("id", id)
    .eq("user_id", userId)
    .is("revoked_at", null)
    .select("id")
    .maybeSingle();
  if (updErr) {
    // Terse code only — never echo PG error text, ids, or token material.
    console.error("revoke-bridge-token update_failed");
    return json({ error: "update_failed" }, 400);
  }
  if (!data) {
    // Nothing matched: either the row is foreign/absent, or it is already
    // revoked. An owner-scoped lookup (RLS-enforced) distinguishes the two.
    const { data: existing, error: lookupErr } = await supabase
      .from("bridge_tokens")
      .select("id, revoked_at")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    if (lookupErr) {
      console.error("revoke-bridge-token lookup_failed");
      return json({ error: "lookup_failed" }, 503);
    }
    if (existing?.revoked_at) return json({ ok: true, already_revoked: true }, 200);
    return json({ error: "not_found" }, 404);
  }
  return json({ ok: true }, 200);
}

if (import.meta.main) {
  Deno.serve((req) => handleRequest(req));
}
