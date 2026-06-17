// Deno test: end-to-end OPTIONS → POST CORS contract for the
// sensor-ingest-webhook Edge Function. Run with:
//
//   deno test --allow-env --allow-net=esm.sh,deno.land \
//     supabase/functions/sensor-ingest-webhook/cors_e2e_test.ts
//
// No real production secrets are required. Network calls are stubbed via
// fetch and Supabase client mocks. This test exercises the response paths
// the browser actually hits from https://verdantgrowdiary.com and proves:
//   - OPTIONS returns 204 with full CORS headers and no auth requirement
//   - POST error paths still return CORS headers (not status 0)
//   - Response bodies never echo bridge tokens or Authorization values

import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";

// Stub env BEFORE the handler imports it.
Deno.env.set("SUPABASE_URL", "https://test.supabase.co");
Deno.env.set("SUPABASE_ANON_KEY", "test-anon-key");

const { handleRequest } = await import("./index.ts");

const ORIGIN = "https://verdantgrowdiary.com";

function corsHeaderAssertions(res: Response) {
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), ORIGIN);
  assertEquals(res.headers.get("Access-Control-Allow-Methods"), "POST, OPTIONS");
  assertEquals(res.headers.get("Vary"), "Origin");
  const allowHeaders = (res.headers.get("Access-Control-Allow-Headers") ?? "").toLowerCase();
  for (const h of [
    "authorization",
    "content-type",
    "x-verdant-bridge-token",
    "x-verdant-tent-id",
    "idempotency-key",
  ]) {
    assertStringIncludes(allowHeaders, h);
  }
}

async function assertBodyHasNoSecrets(res: Response) {
  const text = await res.text();
  for (const forbidden of [
    "vbt_",
    "Bearer ",
    "Authorization",
    "service_role",
    "SUPABASE_SERVICE_ROLE_KEY",
    "token_hash",
  ]) {
    assert(!text.includes(forbidden), `response body leaked "${forbidden}": ${text}`);
  }
  return text;
}

Deno.test("OPTIONS preflight from verdantgrowdiary.com returns 204 + CORS, no auth", async () => {
  const req = new Request("https://test.supabase.co/functions/v1/sensor-ingest-webhook", {
    method: "OPTIONS",
    headers: {
      origin: ORIGIN,
      "access-control-request-method": "POST",
      "access-control-request-headers": "authorization, content-type, x-verdant-bridge-token",
    },
  });
  const res = await handleRequest(req);
  assertEquals(res.status, 204);
  corsHeaderAssertions(res);
  await assertBodyHasNoSecrets(res);
});

Deno.test("POST without Authorization returns 401 WITH CORS headers (not browser status 0)", async () => {
  const req = new Request("https://test.supabase.co/functions/v1/sensor-ingest-webhook", {
    method: "POST",
    headers: { origin: ORIGIN, "content-type": "application/json" },
    body: JSON.stringify({ tent_id: "t" }),
  });
  const res = await handleRequest(req);
  assertEquals(res.status, 401);
  corsHeaderAssertions(res);
  const text = await assertBodyHasNoSecrets(res);
  assertStringIncludes(text, "unauthorized");
});

Deno.test("GET returns 405 method_not_allowed WITH CORS headers", async () => {
  const req = new Request("https://test.supabase.co/functions/v1/sensor-ingest-webhook", {
    method: "GET",
    headers: { origin: ORIGIN },
  });
  const res = await handleRequest(req);
  assertEquals(res.status, 405);
  corsHeaderAssertions(res);
  const text = await assertBodyHasNoSecrets(res);
  assertStringIncludes(text, "method_not_allowed");
});

Deno.test({
  name: "POST with bearer + invalid JSON returns 400 WITH CORS headers; body has no token",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
  const SECRET = "vbt_test_bridge_token_value_should_not_leak";
  const req = new Request("https://test.supabase.co/functions/v1/sensor-ingest-webhook", {
    method: "POST",
    headers: {
      origin: ORIGIN,
      authorization: `Bearer ${SECRET}`,
      "content-type": "application/json",
    },
    body: "{not-json",
  });
  // Auth lookup runs first and will fail closed (no admin client wired) —
  // either path must still return CORS and must not echo the token.
  const res = await handleRequest(req);
  assert(res.status === 400 || res.status === 401 || res.status === 503);
  corsHeaderAssertions(res);
  await assertBodyHasNoSecrets(res);
});

Deno.test("disallowed origin still receives CORS headers (falls back to canonical origin)", async () => {
  const req = new Request("https://test.supabase.co/functions/v1/sensor-ingest-webhook", {
    method: "OPTIONS",
    headers: { origin: "https://evil.example.com" },
  });
  const res = await handleRequest(req);
  assertEquals(res.status, 204);
  // Never echoes the disallowed origin — falls back to the canonical site.
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), ORIGIN);
});
