// Deno test: end-to-end OPTIONS → POST CORS + sanitization contract for the
// sensor-ingest-webhook Edge Function. Run with:
//
//   bun run test:edge:sensor-ingest-webhook
//
// No real production secrets are required. Network calls are stubbed via
// env clearing and known-bad bearer tokens. This file exercises every
// browser-reachable response path and proves:
//   - OPTIONS returns 204 with full CORS headers, no auth, no body parse,
//     and no DB lookup.
//   - Every POST error path returns CORS headers + a readable HTTP status
//     (never browser status 0).
//   - Response bodies never echo bridge tokens, Bearer values, Authorization
//     header values, service-role keys, JWT-shaped strings, or vbt_* tokens.
//
// Mocking limitation: Supabase DB-dependent paths (forbidden_tent,
// tent_lookup_failed, insert_failed, idempotency duplicate) require
// intercepting `createClient` from `npm:@supabase/supabase-js@2`, which the
// current `index.ts` imports directly. Those paths are pinned by static
// scans in `src/test/sensor-ingest-webhook-secret-leakage.test.ts` and the
// runtime matrix tests in `src/test/sensor-ingest-webhook-matrix.test.ts`.
// See "DB mocking blocker" comment at the bottom of this file.

import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";

// Stub env BEFORE the handler imports it.
Deno.env.set("SUPABASE_URL", "https://test.supabase.co");
Deno.env.set("SUPABASE_ANON_KEY", "test-anon-key");

const { handleRequest } = await import("./index.ts");

const ORIGIN = "https://verdantgrowdiary.com";
const ENDPOINT = "https://test.supabase.co/functions/v1/sensor-ingest-webhook";

// Forbidden secret-shaped strings that must NEVER appear in any response.
const FORBIDDEN_LEAKS = [
  "vbt_",
  "Bearer ",
  "Authorization",
  "x-verdant-bridge-token",
  "service_role",
  "SUPABASE_SERVICE_ROLE_KEY",
  "token_hash",
];

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

async function assertBodyHasNoSecrets(res: Response, extra: string[] = []) {
  const text = await res.text();
  for (const forbidden of [...FORBIDDEN_LEAKS, ...extra]) {
    assert(!text.includes(forbidden), `response body leaked "${forbidden}": ${text}`);
  }
  // Browser must see a real status, not 0.
  assert(res.status > 0, "response status must be > 0 (CORS-readable)");
  return text;
}

Deno.test("OPTIONS — 204 + CORS, no auth, no body parse, no DB", async () => {
  const req = new Request(ENDPOINT, {
    method: "OPTIONS",
    headers: {
      origin: ORIGIN,
      "access-control-request-method": "POST",
      "access-control-request-headers": "authorization, content-type, x-verdant-bridge-token",
      authorization: "Bearer vbt_should_be_ignored_on_options",
    },
    body: "{not-json-and-should-not-be-parsed",
  });
  const res = await handleRequest(req);
  assertEquals(res.status, 204);
  corsHeaderAssertions(res);
  // 204 carries no body — assert it's empty (no leak surface).
  assertEquals(await res.text(), "");
});

Deno.test("unauthorized — missing Authorization → 401 + CORS", async () => {
  const req = new Request(ENDPOINT, {
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

Deno.test("method_not_allowed — GET → 405 + CORS", async () => {
  const req = new Request(ENDPOINT, { method: "GET", headers: { origin: ORIGIN } });
  const res = await handleRequest(req);
  assertEquals(res.status, 405);
  corsHeaderAssertions(res);
  const text = await assertBodyHasNoSecrets(res);
  assertStringIncludes(text, "method_not_allowed");
});

Deno.test({
  name: "invalid_json / auth-rejection — POST with bearer + bad JSON → 4xx + CORS, no token leak",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const SECRET = "vbt_test_bridge_token_value_should_not_leak_12345";
    const req = new Request(ENDPOINT, {
      method: "POST",
      headers: {
        origin: ORIGIN,
        authorization: `Bearer ${SECRET}`,
        "content-type": "application/json",
        "x-verdant-bridge-token": SECRET,
        "idempotency-key": "idem-test-001",
      },
      body: "{not-json",
    });
    const res = await handleRequest(req);
    // Auth lookup runs first against the stub URL and will fail closed.
    assert([400, 401, 503].includes(res.status), `unexpected status ${res.status}`);
    corsHeaderAssertions(res);
    await assertBodyHasNoSecrets(res, [SECRET]);
  },
});

Deno.test({
  name: "server_misconfigured — missing SUPABASE_URL → 503 + CORS",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const prevUrl = Deno.env.get("SUPABASE_URL");
    const prevAnon = Deno.env.get("SUPABASE_ANON_KEY");
    Deno.env.delete("SUPABASE_URL");
    Deno.env.delete("SUPABASE_ANON_KEY");
    try {
      const req = new Request(ENDPOINT, {
        method: "POST",
        headers: {
          origin: ORIGIN,
          authorization: "Bearer vbt_arbitrary_value_for_misconfig_test",
          "content-type": "application/json",
        },
        body: JSON.stringify({ tent_id: "t" }),
      });
      const res = await handleRequest(req);
      assertEquals(res.status, 503);
      corsHeaderAssertions(res);
      const text = await assertBodyHasNoSecrets(res);
      assertStringIncludes(text, "server_misconfigured");
    } finally {
      if (prevUrl) Deno.env.set("SUPABASE_URL", prevUrl);
      if (prevAnon) Deno.env.set("SUPABASE_ANON_KEY", prevAnon);
    }
  },
});

Deno.test("disallowed origin — OPTIONS still CORS-tagged with canonical origin", async () => {
  const req = new Request(ENDPOINT, {
    method: "OPTIONS",
    headers: { origin: "https://evil.example.com" },
  });
  const res = await handleRequest(req);
  assertEquals(res.status, 204);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), ORIGIN);
});

Deno.test({
  name: "idempotency-key — duplicate requests both return CORS + no token leak",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    // DB-mocking blocker: the success / true-duplicate path requires
    // mocking `createClient`. We assert the strongest property we CAN
    // observe without a DB: an identical pair of POSTs with the same
    // Idempotency-Key header both produce CORS-tagged, secret-free,
    // status>0 responses (never a browser-side status 0 inconsistency).
    const SECRET = "vbt_idem_dup_token_must_not_leak_in_response";
    const makeReq = () =>
      new Request(ENDPOINT, {
        method: "POST",
        headers: {
          origin: ORIGIN,
          authorization: `Bearer ${SECRET}`,
          "content-type": "application/json",
          "idempotency-key": "idem-dup-001",
        },
        body: JSON.stringify({ tent_id: "00000000-0000-0000-0000-000000000000" }),
      });
    const a = await handleRequest(makeReq());
    const b = await handleRequest(makeReq());
    corsHeaderAssertions(a);
    corsHeaderAssertions(b);
    assertEquals(a.status, b.status, "duplicate requests must classify identically");
    await assertBodyHasNoSecrets(a, [SECRET]);
    await assertBodyHasNoSecrets(b, [SECRET]);
  },
});

// ---------------------------------------------------------------------------
// DB mocking blocker
// ---------------------------------------------------------------------------
// The following classifications require intercepting Supabase client calls:
//   - forbidden_tent     (tent owned by a different user)
//   - tent_lookup_failed (PG returned an error during tent SELECT)
//   - insert_failed      (PG returned an error during sensor_readings upsert)
//   - true idempotency duplicate (ignoreDuplicates returns 0 inserted rows)
//
// `supabase/functions/sensor-ingest-webhook/index.ts` imports `createClient`
// directly from `npm:@supabase/supabase-js@2`, so these paths cannot be
// reached from a pure Deno test without refactoring the function for
// dependency injection. Coverage for those paths lives in:
//   - src/test/sensor-ingest-webhook-matrix.test.ts (Vitest, mocked client)
//   - src/test/sensor-ingest-webhook-idempotency-race.test.ts
//   - src/test/sensor-ingest-webhook-secret-leakage.test.ts (static scan)
//   - src/test/sensor-ingest-webhook-error-leakage.test.ts
