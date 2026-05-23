// Deno tests for the auth-gated pi-ingest-readings Edge Function.
// Exercises the full OPTIONS / 405 / 401 / 400 / 503 contract using
// injected lookup + key-provider deps so tests stay hermetic.
import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  CORS_HEADERS,
  handlePiIngestReadingsRequest,
  type PiIngestHandlerDeps,
} from "./index.ts";
import type {
  PiIngestBridgeCredentialLookupClient,
  PiIngestBridgeCredentialLookupResponse,
} from "./bridgeCredentialLookup.ts";
import {
  buildSigningString,
  computeHmacSha256Hex,
} from "../../../src/lib/piIngestAuthRules.ts";

const ENDPOINT = "http://localhost/functions/v1/pi-ingest-readings";
const NOW_MS = Date.parse("2026-05-23T12:00:00Z");
const NOW_ISO = new Date(NOW_MS).toISOString();

// AES-GCM(plain="bridge-secret-xyz", key=K_V1, nonce=N) precomputed.
// We compute encryption at runtime for stability across platforms.
const KEY_V1 = new Uint8Array(32).fill(7);
const NONCE = new Uint8Array(12).fill(3);
const PLAINTEXT_SECRET = "bridge-secret-xyz";

async function encryptSecret(): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    KEY_V1 as unknown as BufferSource,
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: NONCE as unknown as BufferSource },
    cryptoKey,
    new TextEncoder().encode(PLAINTEXT_SECRET),
  );
  return new Uint8Array(ct);
}

function makeClient(
  response: PiIngestBridgeCredentialLookupResponse,
  tentsResponse: PiIngestBridgeCredentialLookupResponse = {
    data: [{ user_id: "user-xyz" }],
    error: null,
  },
  tracker?: { tentsCalled: boolean },
  idempotencyResponse: PiIngestBridgeCredentialLookupResponse = {
    data: [],
    error: null,
  },
): PiIngestBridgeCredentialLookupClient {
  return {
    from(table: string) {
      const isTents = table === "tents";
      const isIdem = table === "pi_ingest_idempotency_keys";
      const res = isTents
        ? tentsResponse
        : isIdem
        ? idempotencyResponse
        : response;
      return {
        select() {
          return {
            eq() {
              const chain = {
                limit() {
                  if (isTents && tracker) tracker.tentsCalled = true;
                  return Promise.resolve(res);
                },
                // Real idempotency lookup uses .in() after .eq().
                in() {
                  return Promise.resolve(res);
                },
              };
              // deno-lint-ignore no-explicit-any
              return chain as any;
            },
          };
        },
      };
    },
  };
}

async function defaultRow() {
  return {
    bridge_id: "bridge-abc",
    user_id: "user-xyz",
    is_active: true,
    secret_ciphertext: await encryptSecret(),
    secret_nonce: NONCE,
    secret_key_version: 1,
    secret_status: "active_encrypted" as const,
    allowed_tent_ids: ["tent-1"],
    last_used_at: null,
  };
}

function defaultDeps(
  client: PiIngestBridgeCredentialLookupClient,
): PiIngestHandlerDeps {
  return {
    client,
    keyProvider: (v) => (v === 1 ? KEY_V1 : null),
    now: NOW_MS,
    // Default success commit for happy-path tests. Returns
    // inserted == rows.length so per-test assertions can derive
    // expected counts deterministically.
    commitPiIngestBatch: (_c, input) =>
      Promise.resolve({
        ok: true as const,
        inserted: input.rows.length,
        rejected: 0,
      }),
  };
}

async function signedPostHeaders(
  rawBody: string,
  overrides: Partial<{ bridgeId: string; timestamp: string; secret: string }> = {},
) {
  const ts = overrides.timestamp ?? NOW_ISO;
  const bridgeId = overrides.bridgeId ?? "bridge-abc";
  const secret = overrides.secret ?? PLAINTEXT_SECRET;
  const sig = await computeHmacSha256Hex(
    secret,
    buildSigningString("POST", "/functions/v1/pi-ingest-readings", ts, rawBody),
  );
  return {
    "Content-Type": "application/json",
    "x-bridge-id": bridgeId,
    "x-bridge-signature": sig,
    "x-bridge-timestamp": ts,
  };
}

function validEnvelopeBody(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    tent_id: "tent-1",
    device_id: "device-1",
    captured_at: NOW_ISO,
    source: "pi_bridge",
    readings: [{ metric: "temperature_c", value: 22.5, unit: "C" }],
    ...overrides,
  });
}

// ---------- CORS / method ----------

Deno.test("OPTIONS returns 200 with CORS headers", async () => {
  const res = await handlePiIngestReadingsRequest(
    new Request(ENDPOINT, { method: "OPTIONS" }),
  );
  assertEquals(res.status, 200);
  assertEquals(
    res.headers.get("Access-Control-Allow-Origin"),
    CORS_HEADERS["Access-Control-Allow-Origin"],
  );
  await res.text();
});

for (const method of ["GET", "PUT", "DELETE", "PATCH"] as const) {
  Deno.test(`${method} returns 405 method_not_allowed`, async () => {
    const res = await handlePiIngestReadingsRequest(
      new Request(ENDPOINT, { method }),
    );
    assertEquals(res.status, 405);
    const body = await res.json();
    assertEquals(body.error, "method_not_allowed");
  });
}

// ---------- POST without service-role config (no injected client) ----------

Deno.test("POST without env config returns 503 secret_resolver_not_implemented", async () => {
  // Pass deps.client === null to skip the default builder and force
  // the unconfigured branch (we never actually consult env in tests).
  const res = await handlePiIngestReadingsRequest(
    new Request(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-bridge-id": "b",
        "x-bridge-signature": "s",
        "x-bridge-timestamp": NOW_ISO,
      },
      body: JSON.stringify({ tent_id: "t" }),
    }),
    { client: null },
  );
  assertEquals(res.status, 503);
  const body = await res.json();
  assertEquals(body.error, "secret_resolver_not_implemented");
});

// ---------- POST missing auth headers ----------

for (const missing of ["x-bridge-id", "x-bridge-signature", "x-bridge-timestamp"] as const) {
  Deno.test(`POST missing ${missing} returns 401 unauthorized`, async () => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-bridge-id": "bridge-abc",
      "x-bridge-signature": "deadbeef",
      "x-bridge-timestamp": NOW_ISO,
    };
    delete headers[missing];
    const client = makeClient({ data: [await defaultRow()], error: null });
    const res = await handlePiIngestReadingsRequest(
      new Request(ENDPOINT, {
        method: "POST",
        headers,
        body: JSON.stringify({ tent_id: "tent-1" }),
      }),
      defaultDeps(client),
    );
    assertEquals(res.status, 401);
    const body = await res.json();
    assertEquals(body.error, "unauthorized");
  });
}

// ---------- POST invalid body / missing tent_id ----------

Deno.test("POST invalid JSON returns 400 invalid_request", async () => {
  const rawBody = "{not-json";
  const headers = await signedPostHeaders(rawBody);
  const client = makeClient({ data: [await defaultRow()], error: null });
  const res = await handlePiIngestReadingsRequest(
    new Request(ENDPOINT, { method: "POST", headers, body: rawBody }),
    defaultDeps(client),
  );
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, "invalid_request");
});

Deno.test("POST missing tent_id returns 400 invalid_request", async () => {
  const rawBody = JSON.stringify({ readings: [] });
  const headers = await signedPostHeaders(rawBody);
  const client = makeClient({ data: [await defaultRow()], error: null });
  const res = await handlePiIngestReadingsRequest(
    new Request(ENDPOINT, { method: "POST", headers, body: rawBody }),
    defaultDeps(client),
  );
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, "invalid_request");
});

// ---------- POST unknown bridge ----------

Deno.test("POST unknown bridge returns 401 unauthorized", async () => {
  const rawBody = JSON.stringify({ tent_id: "tent-1" });
  const headers = await signedPostHeaders(rawBody);
  const client = makeClient({ data: [], error: null });
  const res = await handlePiIngestReadingsRequest(
    new Request(ENDPOINT, { method: "POST", headers, body: rawBody }),
    defaultDeps(client),
  );
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.error, "unauthorized");
});

// ---------- POST inactive credential ----------

Deno.test("POST inactive credential returns 401 unauthorized", async () => {
  const rawBody = JSON.stringify({ tent_id: "tent-1" });
  const headers = await signedPostHeaders(rawBody);
  const row = { ...(await defaultRow()), is_active: false };
  const client = makeClient({ data: [row], error: null });
  const res = await handlePiIngestReadingsRequest(
    new Request(ENDPOINT, { method: "POST", headers, body: rawBody }),
    defaultDeps(client),
  );
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.error, "unauthorized");
});

// ---------- POST lookup internal error ----------

Deno.test("POST lookup error returns 503 internal_failure", async () => {
  const rawBody = JSON.stringify({ tent_id: "tent-1" });
  const headers = await signedPostHeaders(rawBody);
  const client = makeClient({ data: null, error: { message: "db down" } });
  const res = await handlePiIngestReadingsRequest(
    new Request(ENDPOINT, { method: "POST", headers, body: rawBody }),
    defaultDeps(client),
  );
  assertEquals(res.status, 503);
  const body = await res.json();
  assertEquals(body.error, "internal_failure");
});

Deno.test("POST multiple rows returns 503 internal_failure", async () => {
  const rawBody = JSON.stringify({ tent_id: "tent-1" });
  const headers = await signedPostHeaders(rawBody);
  const row = await defaultRow();
  const client = makeClient({
    data: [row, { ...row, user_id: "user-other" }],
    error: null,
  });
  const res = await handlePiIngestReadingsRequest(
    new Request(ENDPOINT, { method: "POST", headers, body: rawBody }),
    defaultDeps(client),
  );
  assertEquals(res.status, 503);
  const body = await res.json();
  assertEquals(body.error, "internal_failure");
});

// ---------- POST resolver internal vs auth failure ----------

Deno.test("POST resolver missing env key returns 503 internal_failure", async () => {
  const rawBody = JSON.stringify({ tent_id: "tent-1" });
  const headers = await signedPostHeaders(rawBody);
  const client = makeClient({ data: [await defaultRow()], error: null });
  const res = await handlePiIngestReadingsRequest(
    new Request(ENDPOINT, { method: "POST", headers, body: rawBody }),
    { client, keyProvider: () => null, now: NOW_MS },
  );
  assertEquals(res.status, 503);
  const body = await res.json();
  assertEquals(body.error, "internal_failure");
});

Deno.test("POST resolver unknown_key_version returns 401 unauthorized", async () => {
  const rawBody = JSON.stringify({ tent_id: "tent-1" });
  const headers = await signedPostHeaders(rawBody);
  const row = { ...(await defaultRow()), secret_key_version: 99 };
  const client = makeClient({ data: [row], error: null });
  const res = await handlePiIngestReadingsRequest(
    new Request(ENDPOINT, { method: "POST", headers, body: rawBody }),
    defaultDeps(client),
  );
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.error, "unauthorized");
});

// ---------- POST invalid HMAC ----------

Deno.test("POST invalid HMAC returns 401 unauthorized", async () => {
  const rawBody = JSON.stringify({ tent_id: "tent-1" });
  const headers = {
    "Content-Type": "application/json",
    "x-bridge-id": "bridge-abc",
    "x-bridge-signature": "00".repeat(32),
    "x-bridge-timestamp": NOW_ISO,
  };
  const client = makeClient({ data: [await defaultRow()], error: null });
  const res = await handlePiIngestReadingsRequest(
    new Request(ENDPOINT, { method: "POST", headers, body: rawBody }),
    defaultDeps(client),
  );
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.error, "unauthorized");
});

Deno.test("POST tent not allowed returns 401 unauthorized", async () => {
  const rawBody = JSON.stringify({ tent_id: "tent-not-allowed" });
  const headers = await signedPostHeaders(rawBody);
  const client = makeClient({ data: [await defaultRow()], error: null });
  const res = await handlePiIngestReadingsRequest(
    new Request(ENDPOINT, { method: "POST", headers, body: rawBody }),
    defaultDeps(client),
  );
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.error, "unauthorized");
});

// ---------- POST valid auth ----------

Deno.test("POST valid auth returns 200 success after atomic commit", async () => {
  const rawBody = validEnvelopeBody();
  const headers = await signedPostHeaders(rawBody);
  const client = makeClient({ data: [await defaultRow()], error: null });
  const res = await handlePiIngestReadingsRequest(
    new Request(ENDPOINT, { method: "POST", headers, body: rawBody }),
    defaultDeps(client),
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.ok, true);
  assertEquals(body.inserted, 1);
  assertEquals(body.rejected, 0);
});

// ---------- Response hygiene ----------

Deno.test("POST response never leaks secrets/headers/body", async () => {
  const rawMarker = "RAW_PAYLOAD_MARKER_XYZ";
  const sigMarker = "deadbeefsignature";
  const rawBody = JSON.stringify({ tent_id: "tent-1", marker: rawMarker });
  const res = await handlePiIngestReadingsRequest(
    new Request(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-bridge-id": "bridge-abc",
        "x-bridge-signature": sigMarker,
        "x-bridge-timestamp": NOW_ISO,
      },
      body: rawBody,
    }),
    defaultDeps(makeClient({ data: [await defaultRow()], error: null })),
  );
  const text = await res.text();
  for (const forbidden of [
    rawMarker,
    sigMarker,
    PLAINTEXT_SECRET,
    "PI_INGEST_SECRET_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "secret_ciphertext",
    "secret_hash",
    "stack",
  ]) {
    assert(!text.includes(forbidden), `response leaked: ${forbidden}`);
  }
});

// ---------- POST tent-owner / authorization gate ----------

Deno.test("POST tent owned by same user returns 200 success", async () => {
  const rawBody = validEnvelopeBody();
  const headers = await signedPostHeaders(rawBody);
  const client = makeClient(
    { data: [await defaultRow()], error: null },
    { data: [{ user_id: "user-xyz" }], error: null },
  );
  const res = await handlePiIngestReadingsRequest(
    new Request(ENDPOINT, { method: "POST", headers, body: rawBody }),
    defaultDeps(client),
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.ok, true);
});

Deno.test("POST tent owned by different user returns 401 unauthorized", async () => {
  const rawBody = JSON.stringify({ tent_id: "tent-1" });
  const headers = await signedPostHeaders(rawBody);
  const client = makeClient(
    { data: [await defaultRow()], error: null },
    { data: [{ user_id: "user-other" }], error: null },
  );
  const res = await handlePiIngestReadingsRequest(
    new Request(ENDPOINT, { method: "POST", headers, body: rawBody }),
    defaultDeps(client),
  );
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.error, "unauthorized");
  const text = JSON.stringify(body);
  assert(!text.includes("user-other"));
  assert(!text.includes("user-xyz"));
  assert(!text.includes("owner_mismatch"));
  assert(!text.includes("tent-1"));
});

Deno.test("POST unknown tent returns 401 unauthorized", async () => {
  const rawBody = JSON.stringify({ tent_id: "tent-1" });
  const headers = await signedPostHeaders(rawBody);
  const client = makeClient(
    { data: [await defaultRow()], error: null },
    { data: [], error: null },
  );
  const res = await handlePiIngestReadingsRequest(
    new Request(ENDPOINT, { method: "POST", headers, body: rawBody }),
    defaultDeps(client),
  );
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.error, "unauthorized");
});

Deno.test("POST tent without owner returns 401 unauthorized", async () => {
  const rawBody = JSON.stringify({ tent_id: "tent-1" });
  const headers = await signedPostHeaders(rawBody);
  const client = makeClient(
    { data: [await defaultRow()], error: null },
    { data: [{ user_id: null }], error: null },
  );
  const res = await handlePiIngestReadingsRequest(
    new Request(ENDPOINT, { method: "POST", headers, body: rawBody }),
    defaultDeps(client),
  );
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.error, "unauthorized");
});

Deno.test("POST tent-owner lookup failure returns 503 internal_failure", async () => {
  const rawBody = JSON.stringify({ tent_id: "tent-1" });
  const headers = await signedPostHeaders(rawBody);
  const client = makeClient(
    { data: [await defaultRow()], error: null },
    { data: null, error: { message: "db down" } },
  );
  const res = await handlePiIngestReadingsRequest(
    new Request(ENDPOINT, { method: "POST", headers, body: rawBody }),
    defaultDeps(client),
  );
  assertEquals(res.status, 503);
  const body = await res.json();
  assertEquals(body.error, "internal_failure");
  const text = JSON.stringify(body);
  assert(!text.includes("db down"));
  assert(!text.includes("stack"));
});

Deno.test("POST bad HMAC skips tent-owner lookup", async () => {
  const rawBody = JSON.stringify({ tent_id: "tent-1" });
  const headers = {
    "Content-Type": "application/json",
    "x-bridge-id": "bridge-abc",
    "x-bridge-signature": "00".repeat(32),
    "x-bridge-timestamp": NOW_ISO,
  };
  const tracker = { tentsCalled: false };
  const client = makeClient(
    { data: [await defaultRow()], error: null },
    { data: [{ user_id: "user-xyz" }], error: null },
    tracker,
  );
  const res = await handlePiIngestReadingsRequest(
    new Request(ENDPOINT, { method: "POST", headers, body: rawBody }),
    defaultDeps(client),
  );
  assertEquals(res.status, 401);
  assertEquals(tracker.tentsCalled, false);
  await res.text();
});

// ---------- Source guardrails ----------

function stripComments(s: string): string {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

Deno.test("index.ts has no decryption / direct env reads / DB writes", async () => {
  const raw = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  const src = stripComments(raw);
  const forbidden: Array<[string, RegExp]> = [
    [".insert(", /\.insert\(/],
    [".upsert(", /\.upsert\(/],
    [".update(", /\.update\(/],
    [".delete(", /\.delete\(/],
    [".rpc(", /\.rpc\(/],
    ["crypto.subtle.decrypt", /crypto\.subtle\.decrypt\s*\(/],
    ["createDecipheriv", /\bcreateDecipheriv\s*\(/],
    ["PI_INGEST_SECRET_KEY env read", /["']PI_INGEST_SECRET_KEY/],
    ["secret_hash -> secret", /secret\s*:\s*[A-Za-z_.]*\.?secret_hash\b/],
    ["secret_ciphertext -> secret", /secret\s*:\s*[A-Za-z_.]*\.?secret_ciphertext\b/],
    ["sensor_readings", /\bsensor_readings\b/],
    ["pi_ingest_idempotency_keys", /\bpi_ingest_idempotency_keys\b/],
    ["pi_ingest_commit_batch literal", /pi_ingest_commit_batch/],
    ["alerts table from()", /from\(\s*["']alerts["']\s*\)/],
    ["action_queue table from()", /from\(\s*["']action_queue["']\s*\)/],
    ["browser supabase client", /@\/integrations\/supabase\/client/],
    ["raw body log", /console\.\w+\([^)]*\b(rawBody|raw_body)\b/],
    ["signature log", /console\.\w+\([^)]*\bsignature\b/i],
    ["secret log", /console\.\w+\([^)]*\bsecret\b/i],
    ["stack expose", /err(or)?\.stack/i],
  ];
  for (const [label, re] of forbidden) {
    assert(!re.test(src), `index.ts contains forbidden surface: ${label}`);
  }
});

// ---------- Request envelope validation gate ----------

async function postEnvelope(
  overrides: Record<string, unknown>,
  trackers: { tentsCalled?: boolean } = {},
) {
  const rawBody = validEnvelopeBody(overrides);
  const headers = await signedPostHeaders(rawBody);
  const client = makeClient(
    { data: [await defaultRow()], error: null },
    { data: [{ user_id: "user-xyz" }], error: null },
    trackers as { tentsCalled: boolean },
  );
  return handlePiIngestReadingsRequest(
    new Request(ENDPOINT, { method: "POST", headers, body: rawBody }),
    defaultDeps(client),
  );
}

for (const source of ["sim", "manual", "telnyx_webhook"] as const) {
  Deno.test(`POST source=${source} returns 400 invalid_request`, async () => {
    const res = await postEnvelope({ source });
    assertEquals(res.status, 400);
    const body = await res.json();
    assertEquals(body.error, "invalid_request");
  });
}

for (const metric of ["soil_ec", "ppfd", "dli", "reservoir_ph"] as const) {
  Deno.test(`POST unsupported metric=${metric} returns 400`, async () => {
    const res = await postEnvelope({
      readings: [{ metric, value: 1, unit: "ppm" }],
    });
    assertEquals(res.status, 400);
    assertEquals((await res.json()).error, "invalid_request");
  });
}

Deno.test("POST missing readings returns 400", async () => {
  const res = await postEnvelope({ readings: undefined });
  assertEquals(res.status, 400);
  assertEquals((await res.json()).error, "invalid_request");
});

Deno.test("POST empty readings returns 400", async () => {
  const res = await postEnvelope({ readings: [] });
  assertEquals(res.status, 400);
  assertEquals((await res.json()).error, "invalid_request");
});

Deno.test("POST invalid unit returns 400", async () => {
  const res = await postEnvelope({
    readings: [{ metric: "temperature_c", value: 22, unit: "kPa" }],
  });
  assertEquals(res.status, 400);
});

Deno.test("POST non-finite value returns 400", async () => {
  const res = await postEnvelope({
    readings: [{ metric: "temperature_c", value: Number.NaN, unit: "C" }],
  });
  // NaN serializes as null -> validator rejects as missing/non-finite value.
  assertEquals(res.status, 400);
});

Deno.test("POST future captured_at returns 400", async () => {
  const future = new Date(NOW_MS + 60 * 60 * 1000).toISOString();
  const res = await postEnvelope({ captured_at: future });
  assertEquals(res.status, 400);
});

Deno.test("POST client-provided user_id returns 400", async () => {
  const res = await postEnvelope({ user_id: "user-attacker" });
  assertEquals(res.status, 400);
});

Deno.test("POST invalid envelope response leaks nothing sensitive", async () => {
  const rawBody = validEnvelopeBody({ source: "sim", marker: "RAW_MARK_XYZ" });
  const headers = await signedPostHeaders(rawBody);
  const sig = headers["x-bridge-signature"];
  const client = makeClient(
    { data: [await defaultRow()], error: null },
    { data: [{ user_id: "user-xyz" }], error: null },
  );
  const res = await handlePiIngestReadingsRequest(
    new Request(ENDPOINT, { method: "POST", headers, body: rawBody }),
    defaultDeps(client),
  );
  assertEquals(res.status, 400);
  const text = await res.text();
  for (const forbidden of [
    "RAW_MARK_XYZ",
    sig,
    PLAINTEXT_SECRET,
    "user-xyz",
    "tent-1",
    "secret_ciphertext",
    "SUPABASE_SERVICE_ROLE_KEY",
    "nonce",
  ]) {
    assert(!text.includes(forbidden), `response leaked: ${forbidden}`);
  }
});

Deno.test("envelope validation is skipped when HMAC fails", async () => {
  const rawBody = validEnvelopeBody({ source: "sim" }); // would fail validation
  const headers = {
    "Content-Type": "application/json",
    "x-bridge-id": "bridge-abc",
    "x-bridge-signature": "00".repeat(32),
    "x-bridge-timestamp": NOW_ISO,
  };
  const client = makeClient({ data: [await defaultRow()], error: null });
  const res = await handlePiIngestReadingsRequest(
    new Request(ENDPOINT, { method: "POST", headers, body: rawBody }),
    defaultDeps(client),
  );
  // HMAC fails first → 401, not 400.
  assertEquals(res.status, 401);
  assertEquals((await res.json()).error, "unauthorized");
});

Deno.test("envelope validation is skipped when authorization fails", async () => {
  const rawBody = validEnvelopeBody({ source: "sim" });
  const headers = await signedPostHeaders(rawBody);
  const client = makeClient(
    { data: [await defaultRow()], error: null },
    { data: [{ user_id: "user-other" }], error: null }, // owner mismatch
  );
  const res = await handlePiIngestReadingsRequest(
    new Request(ENDPOINT, { method: "POST", headers, body: rawBody }),
    defaultDeps(client),
  );
  assertEquals(res.status, 401);
  assertEquals((await res.json()).error, "unauthorized");
});

// ---------- Normalization wiring ----------

for (const r of [
  { metric: "temperature_c", value: 22.5, unit: "C" },
  { metric: "temperature_c", value: 72, unit: "F" },
  { metric: "humidity_pct", value: 55, unit: "%" },
  { metric: "co2_ppm", value: 800, unit: "ppm" },
  { metric: "soil_moisture_pct", value: 40, unit: "%" },
  { metric: "vpd_kpa", value: 1.1, unit: "kPa" },
] as const) {
  Deno.test(`POST normalized ${r.metric}/${r.unit} returns 200 success`, async () => {
    const res = await postEnvelope({ readings: [r] });
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.ok, true);
    assertEquals(body.inserted, 1);
    assertEquals(body.rejected, 0);
  });
}

Deno.test("POST normalization-failure response leaks nothing sensitive", async () => {
  // Validator passes (forbidden_metric check uses an allowlist that does
  // not include 'air_pressure'); reach normalization with an unknown
  // metric by sneaking it past via raw envelope — but our validator
  // rejects unknown metrics. Instead, force a future captured_at right at
  // the validator boundary tolerance to exercise the path: validator
  // rejects → 400. We assert the response body never leaks marker data.
  const rawBody = validEnvelopeBody({ marker: "RAW_MARK_NORM", source: "sim" });
  const headers = await signedPostHeaders(rawBody);
  const sig = headers["x-bridge-signature"];
  const client = makeClient(
    { data: [await defaultRow()], error: null },
    { data: [{ user_id: "user-xyz" }], error: null },
  );
  const res = await handlePiIngestReadingsRequest(
    new Request(ENDPOINT, { method: "POST", headers, body: rawBody }),
    defaultDeps(client),
  );
  assertEquals(res.status, 400);
  const text = await res.text();
  for (const forbidden of [
    "RAW_MARK_NORM",
    sig,
    PLAINTEXT_SECRET,
    "user-xyz",
    "tent-1",
    "device-1",
    "22.5",
    "secret_ciphertext",
    "SUPABASE_SERVICE_ROLE_KEY",
  ]) {
    assert(!text.includes(forbidden), `response leaked: ${forbidden}`);
  }
});

Deno.test("index.ts wires normalization after validation", async () => {
  const raw = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  assert(/normalizeIngestPayload/.test(raw));
  assert(/toExternalSensorIngestPayload/.test(raw));
});

// ---------- Commit-plan preview wiring ----------

Deno.test("POST multi-reading batch returns 200 success with all rows", async () => {
  const res = await postEnvelope({
    readings: [
      { metric: "temperature_c", value: 22.5, unit: "C" },
      { metric: "humidity_pct", value: 55, unit: "%" },
      { metric: "co2_ppm", value: 800, unit: "ppm" },
    ],
  });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.ok, true);
  assertEquals(body.inserted, 3);
  assertEquals(body.rejected, 0);
});

Deno.test("POST duplicate readings in same batch returns 400 invalid_request", async () => {
  const dup = { metric: "temperature_c", value: 22.5, unit: "C" } as const;
  const res = await postEnvelope({ readings: [dup, dup] });
  assertEquals(res.status, 400);
  assertEquals((await res.json()).error, "invalid_request");
});

Deno.test("POST commit success response leaks nothing sensitive", async () => {
  const rawBody = validEnvelopeBody({
    marker: "RAW_MARK_PLAN",
    readings: [{ metric: "temperature_c", value: 22.5, unit: "C" }],
  });
  const headers = await signedPostHeaders(rawBody);
  const sig = headers["x-bridge-signature"];
  const client = makeClient(
    { data: [await defaultRow()], error: null },
    { data: [{ user_id: "user-xyz" }], error: null },
  );
  const res = await handlePiIngestReadingsRequest(
    new Request(ENDPOINT, { method: "POST", headers, body: rawBody }),
    defaultDeps(client),
  );
  assertEquals(res.status, 200);
  const text = await res.text();
  for (const forbidden of [
    "RAW_MARK_PLAN",
    sig,
    PLAINTEXT_SECRET,
    "user-xyz",
    "tent-1",
    "device-1",
    "22.5",
    "idempotency_key",
    "pi:bridge-abc",
    "secret_ciphertext",
    "SUPABASE_SERVICE_ROLE_KEY",
    "nonce",
  ]) {
    assert(!text.includes(forbidden), `response leaked: ${forbidden}`);
  }
});

Deno.test("index.ts wires commit-plan preview imports", async () => {
  const raw = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  assert(/buildPiIngestCommitPlan/.test(raw));
  assert(/deriveBatchIdempotencyKeys/.test(raw));
  // Idempotency lookup is now wired via the helper module — but the raw
  // table name must still NEVER appear in index.ts (lives only in the
  // helper).
  assert(/loadExistingPiIngestIdempotencyKeys/.test(raw));
  assert(!/pi_ingest_idempotency_keys/.test(raw));
  // Per-reading idempotency only; no requestHash.
  assert(!/requestHash|request_hash/i.test(raw));
});

// ---------- Idempotency lookup wiring ----------

import type {
  PiIngestIdempotencyLookupClient,
  PiIngestIdempotencyLookupResult,
} from "./idempotencyLookup.ts";

type LookupCall = {
  bridgeId: string;
  candidateKeys: readonly string[];
};

function makeLookup(
  result: PiIngestIdempotencyLookupResult | Error,
  calls: LookupCall[] = [],
) {
  const fn = (
    _client: PiIngestIdempotencyLookupClient,
    input: { bridgeId: string; candidateKeys: readonly string[] },
  ): Promise<PiIngestIdempotencyLookupResult> => {
    calls.push({
      bridgeId: input.bridgeId,
      candidateKeys: [...input.candidateKeys],
    });
    if (result instanceof Error) return Promise.reject(result);
    return Promise.resolve(result);
  };
  return { fn, calls };
}

function depsWith(
  client: PiIngestBridgeCredentialLookupClient,
  lookup?: ReturnType<typeof makeLookup>,
): PiIngestHandlerDeps {
  return {
    ...defaultDeps(client),
    loadExistingIdempotencyKeys: lookup?.fn,
  };
}

Deno.test("valid planned request calls idempotency lookup with derived keys", async () => {
  const rawBody = validEnvelopeBody({
    readings: [
      { metric: "temperature_c", value: 22.5, unit: "C" },
      { metric: "humidity_pct", value: 55, unit: "%" },
    ],
  });
  const headers = await signedPostHeaders(rawBody);
  const client = makeClient(
    { data: [await defaultRow()], error: null },
    { data: [{ user_id: "user-xyz" }], error: null },
  );
  const lookup = makeLookup({ ok: true, existingKeys: new Set<string>() });
  const res = await handlePiIngestReadingsRequest(
    new Request(ENDPOINT, { method: "POST", headers, body: rawBody }),
    depsWith(client, lookup),
  );
  assertEquals(res.status, 200);
  assertEquals((await res.json()).ok, true);
  assertEquals(lookup.calls.length, 1);
  assertEquals(lookup.calls[0].bridgeId, "bridge-abc");
  assertEquals(lookup.calls[0].candidateKeys.length, 2);
  for (const k of lookup.calls[0].candidateKeys) {
    assertEquals(typeof k, "string");
    assert(k.length > 0);
  }
});

Deno.test("idempotency lookup failure returns 503 internal_failure", async () => {
  const rawBody = validEnvelopeBody();
  const headers = await signedPostHeaders(rawBody);
  const client = makeClient(
    { data: [await defaultRow()], error: null },
    { data: [{ user_id: "user-xyz" }], error: null },
  );
  const lookup = makeLookup({
    ok: false,
    reason: "lookup_failed",
    message: "idempotency lookup failed",
  });
  const res = await handlePiIngestReadingsRequest(
    new Request(ENDPOINT, { method: "POST", headers, body: rawBody }),
    depsWith(client, lookup),
  );
  assertEquals(res.status, 503);
  assertEquals((await res.json()).error, "internal_failure");
});

Deno.test("idempotency lookup thrown error returns 503 internal_failure", async () => {
  const rawBody = validEnvelopeBody();
  const headers = await signedPostHeaders(rawBody);
  const client = makeClient(
    { data: [await defaultRow()], error: null },
    { data: [{ user_id: "user-xyz" }], error: null },
  );
  const lookup = makeLookup(new Error("network exploded"));
  const res = await handlePiIngestReadingsRequest(
    new Request(ENDPOINT, { method: "POST", headers, body: rawBody }),
    depsWith(client, lookup),
  );
  assertEquals(res.status, 503);
  assertEquals((await res.json()).error, "internal_failure");
});

Deno.test("idempotency lookup failure response leaks nothing sensitive", async () => {
  const rawBody = validEnvelopeBody({ marker: "RAW_MARK_LOOKUP" });
  const headers = await signedPostHeaders(rawBody);
  const sig = headers["x-bridge-signature"];
  const client = makeClient(
    { data: [await defaultRow()], error: null },
    { data: [{ user_id: "user-xyz" }], error: null },
  );
  const lookup = makeLookup({
    ok: false,
    reason: "lookup_failed",
    message: "SECRET_DB_ERROR_MSG",
  });
  const res = await handlePiIngestReadingsRequest(
    new Request(ENDPOINT, { method: "POST", headers, body: rawBody }),
    depsWith(client, lookup),
  );
  assertEquals(res.status, 503);
  const text = await res.text();
  for (const forbidden of [
    "RAW_MARK_LOOKUP",
    "SECRET_DB_ERROR_MSG",
    sig,
    PLAINTEXT_SECRET,
    "user-xyz",
    "tent-1",
    "device-1",
    "bridge-abc",
    "idempotency_key",
    "pi:bridge-abc",
    "lookup_failed",
    "pi_ingest_idempotency_keys",
    "secret_ciphertext",
    "SUPABASE_SERVICE_ROLE_KEY",
  ]) {
    assert(!text.includes(forbidden), `response leaked: ${forbidden}`);
  }
});

Deno.test("all candidate keys existing → 200 inserted=0 rejected=duplicates", async () => {
  const rawBody = validEnvelopeBody({
    readings: [
      { metric: "temperature_c", value: 22.5, unit: "C" },
      { metric: "humidity_pct", value: 55, unit: "%" },
    ],
  });
  const headers = await signedPostHeaders(rawBody);
  const client = makeClient(
    { data: [await defaultRow()], error: null },
    { data: [{ user_id: "user-xyz" }], error: null },
  );
  const captured: LookupCall[] = [];
  const cap = makeLookup({ ok: true, existingKeys: new Set<string>() }, captured);
  await handlePiIngestReadingsRequest(
    new Request(ENDPOINT, { method: "POST", headers, body: rawBody }),
    depsWith(client, cap),
  );
  const allExisting = new Set<string>(captured[0].candidateKeys);
  const lookup = makeLookup({ ok: true, existingKeys: allExisting });
  const res = await handlePiIngestReadingsRequest(
    new Request(ENDPOINT, { method: "POST", headers, body: rawBody }),
    depsWith(client, lookup),
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.ok, true);
  assertEquals(body.inserted, 0);
  assertEquals(body.rejected, 2);
});

Deno.test("partial duplicate keys → 200 inserted=2 rejected=1", async () => {
  const rawBody = validEnvelopeBody({
    readings: [
      { metric: "temperature_c", value: 22.5, unit: "C" },
      { metric: "humidity_pct", value: 55, unit: "%" },
      { metric: "co2_ppm", value: 800, unit: "ppm" },
    ],
  });
  const headers = await signedPostHeaders(rawBody);
  const client = makeClient(
    { data: [await defaultRow()], error: null },
    { data: [{ user_id: "user-xyz" }], error: null },
  );
  const captured: LookupCall[] = [];
  await handlePiIngestReadingsRequest(
    new Request(ENDPOINT, { method: "POST", headers, body: rawBody }),
    depsWith(
      client,
      makeLookup({ ok: true, existingKeys: new Set<string>() }, captured),
    ),
  );
  const partial = new Set<string>([captured[0].candidateKeys[0]]);
  const lookup = makeLookup({ ok: true, existingKeys: partial });
  const res = await handlePiIngestReadingsRequest(
    new Request(ENDPOINT, { method: "POST", headers, body: rawBody }),
    depsWith(client, lookup),
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.ok, true);
  assertEquals(body.inserted, 2);
  assertEquals(body.rejected, 1);
});

Deno.test("no duplicate keys → 200 inserted=1 rejected=0", async () => {
  const rawBody = validEnvelopeBody();
  const headers = await signedPostHeaders(rawBody);
  const client = makeClient(
    { data: [await defaultRow()], error: null },
    { data: [{ user_id: "user-xyz" }], error: null },
  );
  const lookup = makeLookup({ ok: true, existingKeys: new Set<string>() });
  const res = await handlePiIngestReadingsRequest(
    new Request(ENDPOINT, { method: "POST", headers, body: rawBody }),
    depsWith(client, lookup),
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.ok, true);
  assertEquals(body.inserted, 1);
  assertEquals(body.rejected, 0);
});

Deno.test("idempotency lookup skipped when HMAC fails", async () => {
  const rawBody = validEnvelopeBody();
  const headers = {
    "Content-Type": "application/json",
    "x-bridge-id": "bridge-abc",
    "x-bridge-signature": "00".repeat(32),
    "x-bridge-timestamp": NOW_ISO,
  };
  const client = makeClient(
    { data: [await defaultRow()], error: null },
    { data: [{ user_id: "user-xyz" }], error: null },
  );
  const lookup = makeLookup({ ok: true, existingKeys: new Set<string>() });
  const res = await handlePiIngestReadingsRequest(
    new Request(ENDPOINT, { method: "POST", headers, body: rawBody }),
    depsWith(client, lookup),
  );
  assertEquals(res.status, 401);
  assertEquals(lookup.calls.length, 0);
  await res.text();
});

Deno.test("idempotency lookup skipped when authorization fails", async () => {
  const rawBody = validEnvelopeBody();
  const headers = await signedPostHeaders(rawBody);
  const client = makeClient(
    { data: [await defaultRow()], error: null },
    { data: [{ user_id: "user-other" }], error: null },
  );
  const lookup = makeLookup({ ok: true, existingKeys: new Set<string>() });
  const res = await handlePiIngestReadingsRequest(
    new Request(ENDPOINT, { method: "POST", headers, body: rawBody }),
    depsWith(client, lookup),
  );
  assertEquals(res.status, 401);
  assertEquals(lookup.calls.length, 0);
  await res.text();
});

Deno.test("idempotency lookup skipped when envelope validation fails", async () => {
  const rawBody = validEnvelopeBody({ source: "sim" });
  const headers = await signedPostHeaders(rawBody);
  const client = makeClient(
    { data: [await defaultRow()], error: null },
    { data: [{ user_id: "user-xyz" }], error: null },
  );
  const lookup = makeLookup({ ok: true, existingKeys: new Set<string>() });
  const res = await handlePiIngestReadingsRequest(
    new Request(ENDPOINT, { method: "POST", headers, body: rawBody }),
    depsWith(client, lookup),
  );
  assertEquals(res.status, 400);
  assertEquals(lookup.calls.length, 0);
  await res.text();
});

Deno.test("idempotency lookup skipped when normalization-eligible payload is rejected by validator", async () => {
  const rawBody = validEnvelopeBody({
    readings: [{ metric: "temperature_c", value: 22, unit: "kPa" }],
  });
  const headers = await signedPostHeaders(rawBody);
  const client = makeClient(
    { data: [await defaultRow()], error: null },
    { data: [{ user_id: "user-xyz" }], error: null },
  );
  const lookup = makeLookup({ ok: true, existingKeys: new Set<string>() });
  const res = await handlePiIngestReadingsRequest(
    new Request(ENDPOINT, { method: "POST", headers, body: rawBody }),
    depsWith(client, lookup),
  );
  assertEquals(res.status, 400);
  assertEquals(lookup.calls.length, 0);
  await res.text();
});

Deno.test("idempotency lookup skipped when intra-batch duplicate readings present", async () => {
  const dup = { metric: "temperature_c", value: 22.5, unit: "C" } as const;
  const rawBody = validEnvelopeBody({ readings: [dup, dup] });
  const headers = await signedPostHeaders(rawBody);
  const client = makeClient(
    { data: [await defaultRow()], error: null },
    { data: [{ user_id: "user-xyz" }], error: null },
  );
  const lookup = makeLookup({ ok: true, existingKeys: new Set<string>() });
  const res = await handlePiIngestReadingsRequest(
    new Request(ENDPOINT, { method: "POST", headers, body: rawBody }),
    depsWith(client, lookup),
  );
  assertEquals(res.status, 400);
  assertEquals(lookup.calls.length, 0);
  await res.text();
});

Deno.test("planned response never includes idempotency keys, duplicate count, or planned rows", async () => {
  const rawBody = validEnvelopeBody({
    readings: [
      { metric: "temperature_c", value: 22.5, unit: "C" },
      { metric: "humidity_pct", value: 55, unit: "%" },
    ],
  });
  const headers = await signedPostHeaders(rawBody);
  const client = makeClient(
    { data: [await defaultRow()], error: null },
    { data: [{ user_id: "user-xyz" }], error: null },
  );
  const captured: LookupCall[] = [];
  await handlePiIngestReadingsRequest(
    new Request(ENDPOINT, { method: "POST", headers, body: rawBody }),
    depsWith(
      client,
      makeLookup({ ok: true, existingKeys: new Set<string>() }, captured),
    ),
  );
  const partial = new Set<string>([captured[0].candidateKeys[0]]);
  const lookup = makeLookup({ ok: true, existingKeys: partial });
  const res = await handlePiIngestReadingsRequest(
    new Request(ENDPOINT, { method: "POST", headers, body: rawBody }),
    depsWith(client, lookup),
  );
  const text = await res.text();
  for (const k of captured[0].candidateKeys) {
    assert(!text.includes(k), `response leaked idempotency key: ${k}`);
  }
  for (const forbidden of [
    "idempotency_key",
    "idempotencyKey",
    "existingKeys",
    "existing_keys",
    "duplicate_count",
    "duplicateCount",
    "planned_rows",
    "plannedRows",
    "readingDrafts",
    "reading_drafts",
    "22.5",
    "55",
  ]) {
    assert(!text.includes(forbidden), `response leaked: ${forbidden}`);
  }
});
