/**
 * Deployed pi-ingest-readings smoke test.
 *
 * Opt-in: skips with a clear message unless ALL required env vars are present.
 *
 * Required env vars (all must be set to run):
 *   - PI_INGEST_SMOKE_FUNCTION_URL   Full URL to the deployed Edge Function
 *                                    (e.g. https://<ref>.functions.supabase.co/pi-ingest-readings)
 *   - PI_INGEST_SMOKE_BRIDGE_ID      Test-only bridge id
 *   - PI_INGEST_SMOKE_BRIDGE_SECRET  Test-only bridge HMAC secret
 *   - PI_INGEST_SMOKE_TENT_ID        Test-only tent UUID owned by the test user
 *                                    and present in the bridge's allowed_tent_ids
 *
 * Optional:
 *   - PI_INGEST_SMOKE_DEVICE_ID      Device id used in the envelope (default: smoke-device)
 *   - PI_INGEST_SMOKE_TIMESTAMP_MS   Override timestamp (ms epoch) for deterministic runs
 *
 * Safety:
 *   - Uses only test-only credentials supplied by the operator.
 *   - Never prints secret, signature, raw body, ciphertext, nonce, or service-role keys.
 *   - Performs no alert, action_queue, automation, or device-control writes.
 */

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildSigningString,
  computeHmacSha256Hex,
} from "../../../src/lib/piIngestAuthRules.ts";

const REQUIRED_ENV = [
  "PI_INGEST_SMOKE_FUNCTION_URL",
  "PI_INGEST_SMOKE_BRIDGE_ID",
  "PI_INGEST_SMOKE_BRIDGE_SECRET",
  "PI_INGEST_SMOKE_TENT_ID",
] as const;

type SmokeConfig = {
  url: string;
  bridgeId: string;
  bridgeSecret: string;
  tentId: string;
  deviceId: string;
  nowMs: number;
};

function readConfig(): SmokeConfig | null {
  const missing: string[] = [];
  const get = (k: (typeof REQUIRED_ENV)[number]): string => {
    const v = Deno.env.get(k);
    if (!v || v.trim() === "") {
      missing.push(k);
      return "";
    }
    return v;
  };
  const url = get("PI_INGEST_SMOKE_FUNCTION_URL");
  const bridgeId = get("PI_INGEST_SMOKE_BRIDGE_ID");
  const bridgeSecret = get("PI_INGEST_SMOKE_BRIDGE_SECRET");
  const tentId = get("PI_INGEST_SMOKE_TENT_ID");
  if (missing.length > 0) {
    console.log(
      `[pi-ingest-readings smoke] skipped — missing env: ${missing.join(", ")}`,
    );
    return null;
  }
  const tsOverride = Deno.env.get("PI_INGEST_SMOKE_TIMESTAMP_MS");
  const nowMs = tsOverride ? Number(tsOverride) : Date.now();
  if (!Number.isFinite(nowMs)) {
    console.log("[pi-ingest-readings smoke] skipped — invalid timestamp override");
    return null;
  }
  return {
    url,
    bridgeId,
    bridgeSecret,
    tentId,
    deviceId: Deno.env.get("PI_INGEST_SMOKE_DEVICE_ID") ?? "smoke-device",
    nowMs,
  };
}

function buildEnvelope(cfg: SmokeConfig): string {
  const capturedAt = new Date(cfg.nowMs).toISOString();
  return JSON.stringify({
    tent_id: cfg.tentId,
    device_id: cfg.deviceId,
    captured_at: capturedAt,
    source: "pi_bridge",
    readings: [
      { metric: "temperature_c", value: 22.5, unit: "C" },
      { metric: "humidity_pct", value: 55, unit: "%" },
      { metric: "vpd_kpa", value: 1.1, unit: "kPa" },
    ],
  });
}

async function signHeaders(
  cfg: SmokeConfig,
  rawBody: string,
): Promise<Record<string, string>> {
  const u = new URL(cfg.url);
  const ts = String(Math.floor(cfg.nowMs / 1000));
  const signingString = buildSigningString("POST", u.pathname, ts, rawBody);
  const sig = await computeHmacSha256Hex(cfg.bridgeSecret, signingString);
  return {
    "content-type": "application/json",
    "x-bridge-id": cfg.bridgeId,
    "x-bridge-signature": sig,
    "x-bridge-timestamp": ts,
  };
}

async function post(
  cfg: SmokeConfig,
  headers: Record<string, string>,
  rawBody: string,
): Promise<{ status: number; json: unknown }> {
  const res = await fetch(cfg.url, { method: "POST", headers, body: rawBody });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

function assertNoLeak(json: unknown): void {
  if (!json || typeof json !== "object") return;
  const s = JSON.stringify(json).toLowerCase();
  for (const forbidden of ["secret", "signature", "ciphertext", "nonce", "service_role"]) {
    assert(!s.includes(forbidden), `response leaked forbidden token: ${forbidden}`);
  }
}

Deno.test("pi-ingest-readings deployed smoke: full ingest → replay → tampered → unknown → invalid", async () => {
  const cfg = readConfig();
  if (!cfg) return;

  const rawBody = buildEnvelope(cfg);
  const headers = await signHeaders(cfg, rawBody);

  // 1) Valid signed batch → 200 ok:true inserted=N rejected=0
  const first = await post(cfg, headers, rawBody);
  assertEquals(first.status, 200, `expected 200, got ${first.status}`);
  const firstBody = first.json as {
    ok?: boolean;
    inserted?: number;
    rejected?: number;
  } | null;
  assert(firstBody?.ok === true, "first call should be ok:true");
  assertEquals(firstBody?.rejected, 0, "first call rejected must be 0");
  const insertedCount = firstBody?.inserted ?? 0;
  assert(insertedCount > 0, "first call inserted must be > 0");

  // 2) Replay same body → 200 ok:true inserted=0 rejected=N
  const replay = await post(cfg, headers, rawBody);
  assertEquals(replay.status, 200, `replay expected 200, got ${replay.status}`);
  const replayBody = replay.json as {
    ok?: boolean;
    inserted?: number;
    rejected?: number;
  } | null;
  assert(replayBody?.ok === true, "replay should be ok:true");
  assertEquals(replayBody?.inserted, 0, "replay inserted must be 0");
  assert(
    (replayBody?.rejected ?? 0) >= insertedCount,
    "replay rejected must cover originally inserted rows",
  );

  // 3) Tampered signature → 401, no internals leaked
  const tamperedSig = headers["x-bridge-signature"].slice(0, -1) +
    (headers["x-bridge-signature"].endsWith("a") ? "b" : "a");
  const tampered = await post(
    cfg,
    { ...headers, "x-bridge-signature": tamperedSig },
    rawBody,
  );
  assertEquals(tampered.status, 401, `tampered expected 401, got ${tampered.status}`);
  assertNoLeak(tampered.json);

  // 4) Unknown bridge → 401
  const unknownHeaders = await signHeaders(
    { ...cfg, bridgeId: `smoke-unknown-${cfg.nowMs}` },
    rawBody,
  );
  const unknown = await post(cfg, unknownHeaders, rawBody);
  assertEquals(unknown.status, 401, `unknown expected 401, got ${unknown.status}`);
  assertNoLeak(unknown.json);

  // 5) Invalid metric soil_ec → 400
  const invalidBody = JSON.stringify({
    tent_id: cfg.tentId,
    device_id: cfg.deviceId,
    captured_at: new Date(cfg.nowMs).toISOString(),
    source: "pi_bridge",
    readings: [{ metric: "soil_ec", value: 1.0, unit: "mS/cm" }],
  });
  const invalidHeaders = await signHeaders(cfg, invalidBody);
  const invalid = await post(cfg, invalidHeaders, invalidBody);
  assertEquals(invalid.status, 400, `invalid expected 400, got ${invalid.status}`);
  assertNoLeak(invalid.json);
});
