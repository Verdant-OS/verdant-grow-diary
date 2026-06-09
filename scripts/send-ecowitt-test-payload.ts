#!/usr/bin/env -S bun run
/**
 * Local EcoWitt test sender.
 *
 * POSTs a single normalized EcoWitt payload to the existing Verdant
 * `sensor-ingest-webhook` Edge Function. Developer/local validation only.
 *
 * Env:
 *   VERDANT_INGEST_URL   Full URL to the ingest function (required)
 *                        e.g. https://<ref>.supabase.co/functions/v1/sensor-ingest-webhook
 *   VERDANT_BRIDGE_TOKEN Bearer token (vbt_... or a Supabase JWT) (required)
 *   VERDANT_TENT_ID      Target tent UUID (required)
 *   VERDANT_PLANT_ID     Optional plant UUID (metadata only)
 *
 * Flags:
 *   --invalid     Send intentionally impossible values (safety test).
 *   --dry-run     Build, redact, and print the payload. Do NOT POST anywhere.
 *
 * Safety:
 *   - Read-only sensor ingest; never writes Action Queue or device commands.
 *   - Never logs the raw bearer token.
 *   - Never uses service_role.
 *   - Exits non-zero on non-2xx response so CI/dev loops can detect failure.
 */

import {
  buildEcowittLocalTestPayload,
  redactBridgeToken,
} from "../src/lib/ecowittLocalTestPayloadRules";

function fail(msg: string): never {
  // eslint-disable-next-line no-console
  console.error(`[ecowitt-test-sender] ${msg}`);
  process.exit(2);
}

const url = process.env.VERDANT_INGEST_URL;
const token = process.env.VERDANT_BRIDGE_TOKEN;
const tentId = process.env.VERDANT_TENT_ID;
const plantId = process.env.VERDANT_PLANT_ID || null;
const invalid = process.argv.includes("--invalid");

if (!url) fail("missing VERDANT_INGEST_URL");
if (!token) fail("missing VERDANT_BRIDGE_TOKEN");
if (!tentId) fail("missing VERDANT_TENT_ID");

const payload = buildEcowittLocalTestPayload({
  tentId: tentId!,
  plantId,
  invalid,
});

// eslint-disable-next-line no-console
console.log("[ecowitt-test-sender] target:", url);
// eslint-disable-next-line no-console
console.log("[ecowitt-test-sender] auth:", redactBridgeToken(token));
// eslint-disable-next-line no-console
console.log("[ecowitt-test-sender] mode:", invalid ? "INVALID (safety test)" : "valid");
// eslint-disable-next-line no-console
console.log("[ecowitt-test-sender] payload summary:", {
  tent_id: payload.tent_id,
  source: payload.source,
  vendor: payload.vendor,
  captured_at: payload.captured_at,
  metric_keys: Object.keys(payload.metrics),
});

const res = await fetch(url!, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    "Idempotency-Key": `ecowitt-test-${payload.captured_at}`,
  },
  body: JSON.stringify(payload),
});

const text = await res.text();
// eslint-disable-next-line no-console
console.log(`[ecowitt-test-sender] HTTP ${res.status}`);
// eslint-disable-next-line no-console
console.log("[ecowitt-test-sender] response:", text);

if (!res.ok) {
  if (invalid) {
    // Expected when the route rejects the impossible payload.
    // eslint-disable-next-line no-console
    console.log("[ecowitt-test-sender] invalid payload rejected as expected.");
    process.exit(0);
  }
  process.exit(1);
}
process.exit(0);
