// Shelly H&T Gen4 read-only setup status.
//
// Returns whether the webhook ingest is configured server-side, and (when
// the configured tent belongs to the caller) the assigned tent's id+name.
// Never returns the raw webhook token — only a 4-char suffix mask.
// Read-only. No writes, no notifications, no device control.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers":
    "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "GET, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json" },
  });
}

function maskToken(token: string): string {
  if (!token) return "";
  const tail = token.length >= 4 ? token.slice(-4) : token;
  return `••••${tail}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "GET") return json({ error: "method-not-allowed" }, 405);

  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!accessToken) return json({ error: "unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceRoleKey)
      return json({ error: "server-misconfigured" }, 500);

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: userRes, error: userErr } = await admin.auth.getUser(
      accessToken,
    );
    if (userErr || !userRes?.user?.id)
      return json({ error: "unauthorized" }, 401);
    const callerId = userRes.user.id;

    const expected = Deno.env.get("SHELLY_HT_WEBHOOK_TOKEN") ?? "";
    const tentId = Deno.env.get("SHELLY_HT_TENT_ID") ?? "";
    const configured = !!expected && !!tentId;

    let tentAssignedToCaller = false;
    let tentName: string | null = null;
    let resolvedTentId: string | null = null;

    if (configured) {
      const { data: tent } = await admin
        .from("tents")
        .select("id,name,user_id")
        .eq("id", tentId)
        .maybeSingle();
      if (tent && tent.user_id === callerId) {
        tentAssignedToCaller = true;
        tentName = tent.name ?? null;
        resolvedTentId = tent.id;
      }
    }

    const webhookUrl = `${supabaseUrl}/functions/v1/shelly-ht-webhook`;

    return json({
      configured,
      tentAssignedToCaller,
      tentId: resolvedTentId,
      tentName,
      tokenMask: configured ? maskToken(expected) : null,
      webhookUrl,
    });
  } catch (e) {
    console.warn("[shelly-ht-status] unhandled:", (e as Error).message);
    return json({ error: "internal" }, 500);
  }
});
