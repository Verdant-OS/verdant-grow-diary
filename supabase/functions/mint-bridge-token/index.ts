// Mint a tent-scoped, expiring API token for headless bridges.
// Requires a Supabase session JWT. Returns the plaintext token ONCE.
// Stored at rest as sha-256 hash + short non-secret prefix.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (b: unknown, status: number) =>
  new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const TOKEN_PREFIX = "vbt_";
const MIN_TTL_HOURS = 1;
const MAX_TTL_DAYS = 365;

function b64url(bytes: Uint8Array): string {
  let s = btoa(String.fromCharCode(...bytes));
  return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY)
    return json({ error: "server_misconfigured" }, 503);

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(token);
  if (claimsErr || !claimsData?.claims?.sub) return json({ error: "unauthorized" }, 401);
  const userId = claimsData.claims.sub as string;

  let body: { tent_id?: string; name?: string; ttl_days?: number };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  const tentId = String(body.tent_id || "");
  const name = (body.name || "bridge").toString().slice(0, 60);
  const ttlDays = Math.max(
    MIN_TTL_HOURS / 24,
    Math.min(MAX_TTL_DAYS, Number(body.ttl_days ?? 30)),
  );
  if (!/^[0-9a-f-]{36}$/i.test(tentId))
    return json({ error: "invalid_tent_id" }, 400);

  // Verify tent ownership (defense-in-depth; INSERT policy also enforces).
  const { data: tentRow, error: tentErr } = await supabase
    .from("tents").select("id, user_id").eq("id", tentId).maybeSingle();
  if (tentErr) return json({ error: "tent_lookup_failed" }, 503);
  if (!tentRow || tentRow.user_id !== userId)
    return json({ error: "forbidden_tent" }, 403);

  // Generate 32 random bytes -> base64url -> vbt_ prefix.
  const rand = new Uint8Array(32);
  crypto.getRandomValues(rand);
  const plaintext = TOKEN_PREFIX + b64url(rand);
  const tokenHash = await sha256Hex(plaintext);
  const tokenPrefix = plaintext.slice(0, 12); // vbt_ + 8 chars, non-secret
  const expiresAt = new Date(Date.now() + ttlDays * 86400_000).toISOString();

  const { data: inserted, error: insErr } = await supabase
    .from("bridge_tokens")
    .insert({
      user_id: userId,
      tent_id: tentId,
      name,
      token_prefix: tokenPrefix,
      token_hash: tokenHash,
      expires_at: expiresAt,
    })
    .select("id, name, token_prefix, expires_at, created_at")
    .single();
  if (insErr) return json({ error: "insert_failed", detail: insErr.message }, 400);

  return json({ ok: true, token: plaintext, record: inserted }, 200);
});
