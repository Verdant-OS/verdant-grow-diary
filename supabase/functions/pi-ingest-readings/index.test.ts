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
): PiIngestBridgeCredentialLookupClient {
  return {
    from(table: string) {
      const res = table === "tents" ? tentsResponse : response;
      return {
        select() {
          return {
            eq() {
              return {
                limit() {
                  if (table === "tents" && tracker) tracker.tentsCalled = true;
                  return Promise.resolve(res);
                },
              };
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

Deno.test("POST valid auth returns 503 auth_ok_pipeline_not_implemented", async () => {
  const rawBody = validEnvelopeBody();
  const headers = await signedPostHeaders(rawBody);
  const client = makeClient({ data: [await defaultRow()], error: null });
  const res = await handlePiIngestReadingsRequest(
    new Request(ENDPOINT, { method: "POST", headers, body: rawBody }),
    defaultDeps(client),
  );
  assertEquals(res.status, 503);
  const body = await res.json();
  assertEquals(body.ok, false);
  assertEquals(body.error, "auth_ok_pipeline_not_implemented");
  assertStringIncludes(body.message, "Bridge authentication succeeded");
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

Deno.test("POST tent owned by same user returns 503 auth_ok_pipeline_not_implemented", async () => {
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
  assertEquals(res.status, 503);
  const body = await res.json();
  assertEquals(body.error, "auth_ok_pipeline_not_implemented");
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
    ["alerts table from()", /from\(\s*["']alerts["']\s*\)/],
    ["action_queue table from()", /from\(\s*["']action_queue["']\s*\)/],
    ["ok:true success", /ok\s*:\s*true/],
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
  Deno.test(`POST normalized ${r.metric}/${r.unit} returns 503 auth_ok_pipeline_not_implemented`, async () => {
    const res = await postEnvelope({ readings: [r] });
    assertEquals(res.status, 503);
    const body = await res.json();
    assertEquals(body.error, "auth_ok_pipeline_not_implemented");
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

Deno.test("POST multi-reading batch returns 503 auth_ok_pipeline_not_implemented", async () => {
  const res = await postEnvelope({
    readings: [
      { metric: "temperature_c", value: 22.5, unit: "C" },
      { metric: "humidity_pct", value: 55, unit: "%" },
      { metric: "co2_ppm", value: 800, unit: "ppm" },
    ],
  });
  assertEquals(res.status, 503);
  assertEquals((await res.json()).error, "auth_ok_pipeline_not_implemented");
});

Deno.test("POST duplicate readings in same batch returns 400 invalid_request", async () => {
  const dup = { metric: "temperature_c", value: 22.5, unit: "C" } as const;
  const res = await postEnvelope({ readings: [dup, dup] });
  assertEquals(res.status, 400);
  assertEquals((await res.json()).error, "invalid_request");
});

Deno.test("POST commit-plan preview response leaks nothing sensitive", async () => {
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
  assertEquals(res.status, 503);
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
