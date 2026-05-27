// V1 generic authenticated sensor webhook.
//
// Sensor ingest is read-only. Incoming readings are source-tagged and never
// trigger AI, alerts, Action Queue, automation, or device control directly.
//
// Auth: Supabase Auth JWT (Bearer). The caller's `auth.uid()` owns every
// inserted row. Tent ownership is verified server-side before insert.
// Caller-supplied `user_id` in the body is ignored.
//
// Hard rules:
//   - No service-role client.
//   - No alerts / action_queue / AI / automation / device control writes.
//   - No long-running MQTT subscriber.
//   - Out-of-range metrics are rejected per-metric, not silently clamped.

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "unauthorized" }, 401);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return json({ error: "server_misconfigured" }, 503);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: claimsErr } =
    await supabase.auth.getClaims(token);
  if (claimsErr || !claimsData?.claims?.sub) {
    return json({ error: "unauthorized" }, 401);
  }
  const userId = claimsData.claims.sub as string;

  let body: WebhookIngestPayload;
  try {
    body = (await req.json()) as WebhookIngestPayload;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const normalized = normalizeWebhookIngestPayload(body);
  if (!normalized.ok) {
    return json(
      { error: "invalid_payload", errors: normalized.errors },
      400,
    );
  }

  // Verify tent ownership server-side. RLS would also block, but a clear
  // 403 is friendlier than a generic insert failure.
  const tentId = normalized.rows[0].tent_id as string;
  const { data: tentRow, error: tentErr } = await supabase
    .from("tents")
    .select("id, user_id")
    .eq("id", tentId)
    .maybeSingle();
  if (tentErr) return json({ error: "tent_lookup_failed" }, 503);
  if (!tentRow || tentRow.user_id !== userId) {
    return json({ error: "forbidden_tent" }, 403);
  }

  // Request-level deduplication: skip rows whose exact
  // (tent_id, source, captured_at, metric, value) already exists.
  const capturedAt = normalized.rows[0].captured_at as string;
  const source = normalized.rows[0].source as string;
  const { data: existing } = await supabase
    .from("sensor_readings")
    .select("metric, value")
    .eq("tent_id", tentId)
    .eq("source", source)
    .eq("captured_at", capturedAt);

  const existingKey = new Set(
    (existing ?? []).map((r) => `${r.metric}:${Number(r.value).toFixed(6)}`),
  );
  const toInsert = normalized.rows.filter(
    (r) =>
      !existingKey.has(
        `${r.metric}:${Number(r.value as number).toFixed(6)}`,
      ),
  );

  if (toInsert.length === 0) {
    return json(
      {
        ok: true,
        inserted: 0,
        skipped_duplicate: normalized.rows.length,
        rejected: normalized.errors,
      },
      200,
    );
  }

  const { error: insErr } = await supabase
    .from("sensor_readings")
    .insert(toInsert);
  if (insErr) {
    return json(
      { error: "insert_failed", detail: insErr.message },
      400,
    );
  }

  return json(
    {
      ok: true,
      inserted: toInsert.length,
      skipped_duplicate: normalized.rows.length - toInsert.length,
      rejected: normalized.errors,
      fingerprint: normalized.fingerprint,
    },
    200,
  );
});
