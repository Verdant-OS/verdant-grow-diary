// Deno-level fail-closed tests for the pi-ingest-readings Edge Function
// skeleton. Calls the exported handler directly with synthetic Request
// objects — no server, no Supabase client, no network.
import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { CORS_HEADERS, handlePiIngestReadingsRequest } from "./index.ts";

const ENDPOINT = "http://localhost/functions/v1/pi-ingest-readings";

function bodyThatThrowsIfRead(): ReadableStream<Uint8Array> {
  return new ReadableStream({
    pull() {
      throw new Error(
        "handler must not read the request body in the fail-closed skeleton",
      );
    },
  });
}

Deno.test("OPTIONS returns 200 with CORS headers", async () => {
  const res = handlePiIngestReadingsRequest(
    new Request(ENDPOINT, { method: "OPTIONS" }),
  );
  assertEquals(res.status, 200);
  assertEquals(
    res.headers.get("Access-Control-Allow-Origin"),
    CORS_HEADERS["Access-Control-Allow-Origin"],
  );
  assertEquals(
    res.headers.get("Access-Control-Allow-Methods"),
    CORS_HEADERS["Access-Control-Allow-Methods"],
  );
  assert(
    (res.headers.get("Access-Control-Allow-Headers") ?? "").includes(
      "x-bridge-signature",
    ),
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
    assertEquals(body.ok, false);
    assertEquals(body.error, "method_not_allowed");
  });
}

Deno.test("POST returns 503 secret_resolver_not_implemented", async () => {
  const res = await handlePiIngestReadingsRequest(
    new Request(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tent_id: "x", readings: [] }),
    }),
  );
  assertEquals(res.status, 503);
  const body = await res.json();
  assertEquals(body.ok, false);
  assertEquals(body.error, "secret_resolver_not_implemented");
});

Deno.test("POST does not read the request body", async () => {
  const req = new Request(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: bodyThatThrowsIfRead(),
  });
  const res = await handlePiIngestReadingsRequest(req);
  assertEquals(res.status, 503);
  await res.text();
  assertEquals(req.bodyUsed, false);
});

Deno.test("POST response body does not leak sensitive material", async () => {
  const secretMarker = "SUPER_SECRET_BRIDGE_KEY_ABC123";
  const sigMarker = "deadbeefsignature";
  const rawMarker = "RAW_PAYLOAD_MARKER_XYZ";
  const res = await handlePiIngestReadingsRequest(
    new Request(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-bridge-signature": sigMarker,
      },
      body: JSON.stringify({ secret: secretMarker, raw: rawMarker }),
    }),
  );
  const text = await res.text();
  for (const forbidden of [
    secretMarker,
    sigMarker,
    rawMarker,
    "PI_INGEST_SECRET_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "service_role",
    "stack",
    "at handlePiIngestReadingsRequest",
    "secret_ciphertext",
    "secret_hash",
  ]) {
    assert(
      !text.includes(forbidden),
      `response leaked forbidden token: ${forbidden}`,
    );
  }
  assertStringIncludes(text, "secret_resolver_not_implemented");
});

Deno.test("source file has no DB/crypto/Supabase surfaces", async () => {
  const src = await Deno.readTextFile(
    new URL("./index.ts", import.meta.url),
  );
  const forbidden: Array<[string, RegExp]> = [
    [".from(", /\.from\(/],
    [".insert(", /\.insert\(/],
    [".upsert(", /\.upsert\(/],
    [".rpc(", /\.rpc\(/],
    ["service_role", /service_role/i],
    ["createClient", /\bcreateClient\s*\(/],
    ["crypto.subtle.decrypt", /crypto\.subtle\.decrypt\s*\(/],
    ["createDecipheriv", /\bcreateDecipheriv\s*\(/],
    ["PI_INGEST_SECRET_KEY env read", /Deno\.env\.get\(\s*["']PI_INGEST_SECRET_KEY/],
    ["secret_hash -> secret", /secret\s*:\s*[A-Za-z_.]*\.?secret_hash\b/],
    ["secret_ciphertext -> secret", /secret\s*:\s*[A-Za-z_.]*\.?secret_ciphertext\b/],
    ["sensor_readings", /\bsensor_readings\b/],
    ["pi_ingest_idempotency_keys", /\bpi_ingest_idempotency_keys\b/],
    ["alerts table", /from\(\s*["']alerts["']\s*\)/],
    ["action_queue table", /from\(\s*["']action_queue["']\s*\)/],
    ["request.json", /\brequest\.json\s*\(|\breq\.json\s*\(/],
    ["request.text", /\brequest\.text\s*\(|\breq\.text\s*\(/],
    ["request.formData", /\brequest\.formData\s*\(|\breq\.formData\s*\(/],
    ["request.arrayBuffer", /\brequest\.arrayBuffer\s*\(|\breq\.arrayBuffer\s*\(/],
    ["ok:true success path", /ok\s*:\s*true/],
  ];
  for (const [label, re] of forbidden) {
    assert(!re.test(src), `index.ts contains forbidden surface: ${label}`);
  }
});
