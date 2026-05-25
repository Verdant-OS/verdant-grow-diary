// Shelly H&T Gen4 read-only webhook ingest.
//
// Security model (smallest safe setup):
//  - Token required via `x-verdant-webhook-token` header or `token` query.
//  - Token compared (constant-time) against the `SHELLY_HT_WEBHOOK_TOKEN`
//    server secret. Missing/invalid token -> respond 200 ack but persist
//    nothing trusted (prevents Shelly retry storms).
//  - Resolved tent comes from `SHELLY_HT_TENT_ID` server env. We NEVER
//    accept tent_id or user_id from the client payload.
//  - user_id is resolved server-side from `tents.user_id` via service role.
//  - Read-only sensor logging only. No notifications, no queues, no
//    device control, no auto-actions.
//
// Returns: always HTTP 200 ack so the Shelly retries do not storm.
// Failures are logged server-side only.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ACK = { status: "received" } as const;
const ackResponse = () =>
  new Response(JSON.stringify(ACK), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers":
    "authorization, x-client-info, apikey, content-type, x-verdant-webhook-token",
  "access-control-allow-methods": "POST, OPTIONS",
};

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// --- Pure normalization (inlined; mirrors src/lib/shellyHtWebhookRules.ts) ---
const SHELLY_PREFIX = "shelly-ht-gen4";
function fToC(f: number): number {
  return (f - 32) * (5 / 9);
}
function computeVpdKpa(tempC: number, rhPct: number): number {
  const svp = 0.6108 * Math.exp((17.27 * tempC) / (tempC + 237.3));
  const vpd = svp * (1 - rhPct / 100);
  return Math.max(0, Math.round(vpd * 1000) / 1000);
}
function toFinite(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}
function normalize(payload: any, now: Date) {
  const errors: string[] = [];
  const deviceIdRaw = typeof payload?.device_id === "string"
    ? payload.device_id.trim().slice(0, 64).replace(/[^a-zA-Z0-9_:-]/g, "")
    : "";
  const deviceId = deviceIdRaw ? `${SHELLY_PREFIX}:${deviceIdRaw}` : SHELLY_PREFIX;
  const capturedRaw = payload?.captured_at ?? payload?.ts;
  let capturedAt = now.toISOString();
  if (typeof capturedRaw === "string" || typeof capturedRaw === "number") {
    const t = new Date(capturedRaw as any).getTime();
    if (Number.isFinite(t) && t <= now.getTime() + 5 * 60 * 1000)
      capturedAt = new Date(t).toISOString();
  }
  if (!payload || typeof payload !== "object")
    return { ok: false, errors: ["payload required"], rows: [], deviceId, capturedAt };

  let tempC: number | null = toFinite(payload.temperature_c);
  if (tempC === null) {
    const f = toFinite(payload.temperature_f);
    if (f !== null) tempC = fToC(f);
    else {
      const t = toFinite(payload.temperature);
      if (t !== null) tempC = fToC(t); // v1 default: F
    }
  }
  const humidity = toFinite(payload.humidity);
  if (tempC === null) errors.push("temperature required");
  else if (tempC < -10 || tempC > 60) errors.push("temperature out of range");
  if (humidity === null) errors.push("humidity required");
  else if (humidity < 0 || humidity > 100) errors.push("humidity out of range");
  if (errors.length > 0)
    return { ok: false, errors, rows: [], deviceId, capturedAt };

  return {
    ok: true,
    errors: [],
    deviceId,
    capturedAt,
    rows: [
      { metric: "temperature_c", value: tempC as number },
      { metric: "humidity_pct", value: humidity as number },
      { metric: "vpd_kpa", value: computeVpdKpa(tempC as number, humidity as number) },
    ],
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return ackResponse();

  try {
    const url = new URL(req.url);
    const headerToken = req.headers.get("x-verdant-webhook-token") ?? "";
    const queryToken = url.searchParams.get("token") ?? "";
    const provided = headerToken || queryToken;
    const expected = Deno.env.get("SHELLY_HT_WEBHOOK_TOKEN") ?? "";
    const tentId = Deno.env.get("SHELLY_HT_TENT_ID") ?? "";

    if (!expected || !tentId) {
      console.warn("[shelly-ht-webhook] missing server config");
      return ackResponse();
    }
    if (!provided || !constantTimeEqual(provided, expected)) {
      console.warn("[shelly-ht-webhook] invalid token");
      return ackResponse();
    }

    const text = await req.text();
    let payload: unknown = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      console.warn("[shelly-ht-webhook] invalid JSON");
      return ackResponse();
    }

    const norm = normalize(payload, new Date());
    if (!norm.ok) {
      console.warn("[shelly-ht-webhook] rejected:", norm.errors.join("; "));
      return ackResponse();
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Resolve tent owner server-side. Never trust client.
    const { data: tent, error: tentErr } = await supabase
      .from("tents")
      .select("id,user_id")
      .eq("id", tentId)
      .maybeSingle();
    if (tentErr || !tent?.user_id) {
      console.warn("[shelly-ht-webhook] tent owner lookup failed");
      return ackResponse();
    }

    const rawPayload = payload as Record<string, unknown>;
    const rows = norm.rows.map((r) => ({
      user_id: tent.user_id,
      tent_id: tent.id,
      metric: r.metric,
      value: r.value,
      source: "pi_bridge",
      quality: "ok",
      ts: norm.capturedAt,
      captured_at: norm.capturedAt,
      device_id: norm.deviceId,
      raw_payload: rawPayload,
    }));

    const { error: insErr } = await supabase.from("sensor_readings").insert(rows);
    if (insErr) {
      console.warn("[shelly-ht-webhook] insert failed:", insErr.message);
    }
    return ackResponse();
  } catch (e) {
    console.warn("[shelly-ht-webhook] unhandled:", (e as Error).message);
    return ackResponse();
  }
});
