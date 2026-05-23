// Deno tests for the server-only bridge secret resolver.
//
// These tests run the resolver against synthetic AES-256-GCM
// ciphertexts produced inline. They do NOT touch Supabase, the
// database, env vars (the key provider is injected), or the
// pi-ingest-readings HTTP handler.
import {
  assert,
  assertEquals,
  assertNotEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  defaultEnvKeyProvider,
  type PiIngestSecretKeyProvider,
  resolveBridgeSecret,
} from "./secretResolver.ts";
import type { ResolveBridgeSecretInput } from "../../../src/lib/piIngestServerSecretResolverTypes.ts";

const PLAINTEXT_SECRET = "in-memory-only-hmac-secret-material";
const BRIDGE_ID = "bridge-abc-123";

function randomBytes(len: number): Uint8Array {
  const b = new Uint8Array(len);
  crypto.getRandomValues(b);
  return b;
}

async function encryptForTest(
  plaintext: string,
  keyBytes: Uint8Array,
): Promise<{ ciphertext: Uint8Array; nonce: Uint8Array }> {
  const nonce = randomBytes(12);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes as unknown as BufferSource,
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce as unknown as BufferSource },
    cryptoKey,
    new TextEncoder().encode(plaintext) as unknown as BufferSource,
  );
  return { ciphertext: new Uint8Array(ct), nonce };
}

function fixedKeyProvider(
  bytes: Uint8Array,
  version: number,
): PiIngestSecretKeyProvider {
  return (v) => (v === version ? bytes : null);
}

function baseInput(
  overrides: Partial<ResolveBridgeSecretInput> = {},
): ResolveBridgeSecretInput {
  return {
    bridgeId: BRIDGE_ID,
    secretCiphertext: new Uint8Array([1, 2, 3]),
    secretNonce: new Uint8Array([4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]),
    secretKeyVersion: 1,
    secretStatus: "active_encrypted",
    ...overrides,
  };
}

// ---------- Happy path ----------

Deno.test("resolves active_encrypted credential with valid V1 key (Uint8Array input)", async () => {
  const key = randomBytes(32);
  const { ciphertext, nonce } = await encryptForTest(PLAINTEXT_SECRET, key);
  const result = await resolveBridgeSecret(
    baseInput({ secretCiphertext: ciphertext, secretNonce: nonce }),
    fixedKeyProvider(key, 1),
  );
  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.bridgeId, BRIDGE_ID);
    assertEquals(result.secret, PLAINTEXT_SECRET);
  }
});

Deno.test("resolves active_encrypted credential with valid V2 key", async () => {
  const key = randomBytes(32);
  const { ciphertext, nonce } = await encryptForTest(PLAINTEXT_SECRET, key);
  const result = await resolveBridgeSecret(
    baseInput({
      secretCiphertext: ciphertext,
      secretNonce: nonce,
      secretKeyVersion: 2,
    }),
    fixedKeyProvider(key, 2),
  );
  assertEquals(result.ok, true);
});

Deno.test("accepts base64-encoded ciphertext, nonce, and key", async () => {
  const key = randomBytes(32);
  const { ciphertext, nonce } = await encryptForTest(PLAINTEXT_SECRET, key);
  const toB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
  const result = await resolveBridgeSecret(
    baseInput({
      secretCiphertext: toB64(ciphertext),
      secretNonce: toB64(nonce),
    }),
    () => toB64(key),
  );
  assertEquals(result.ok, true);
  if (result.ok) assertEquals(result.secret, PLAINTEXT_SECRET);
});

Deno.test("accepts hex-encoded 32-byte key string", async () => {
  const key = randomBytes(32);
  const { ciphertext, nonce } = await encryptForTest(PLAINTEXT_SECRET, key);
  const hex = Array.from(key)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const result = await resolveBridgeSecret(
    baseInput({ secretCiphertext: ciphertext, secretNonce: nonce }),
    () => hex,
  );
  assertEquals(result.ok, true);
});

// ---------- Status gates ----------

Deno.test("pending_rotation → inactive_credential", async () => {
  const r = await resolveBridgeSecret(
    baseInput({ secretStatus: "pending_rotation" }),
    () => randomBytes(32),
  );
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.reason, "inactive_credential");
});

Deno.test("disabled → inactive_credential", async () => {
  const r = await resolveBridgeSecret(
    baseInput({ secretStatus: "disabled" }),
    () => randomBytes(32),
  );
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.reason, "inactive_credential");
});

Deno.test("unknown secret_status → invalid_secret_status", async () => {
  const r = await resolveBridgeSecret(
    // deno-lint-ignore no-explicit-any
    baseInput({ secretStatus: "bogus" as any }),
    () => randomBytes(32),
  );
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.reason, "invalid_secret_status");
});

// ---------- Field gates ----------

Deno.test("empty bridgeId → missing_credential", async () => {
  const r = await resolveBridgeSecret(
    baseInput({ bridgeId: "   " }),
    () => randomBytes(32),
  );
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.reason, "missing_credential");
});

Deno.test("empty ciphertext → missing_ciphertext", async () => {
  const r = await resolveBridgeSecret(
    baseInput({ secretCiphertext: new Uint8Array() }),
    () => randomBytes(32),
  );
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.reason, "missing_ciphertext");
});

Deno.test("empty nonce → missing_nonce", async () => {
  const r = await resolveBridgeSecret(
    baseInput({ secretNonce: new Uint8Array() }),
    () => randomBytes(32),
  );
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.reason, "missing_nonce");
});

Deno.test("non-positive key version → missing_key_version", async () => {
  const r = await resolveBridgeSecret(
    baseInput({ secretKeyVersion: 0 }),
    () => randomBytes(32),
  );
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.reason, "missing_key_version");
});

// ---------- Key resolution ----------

Deno.test("unknown key version (>=3) → unknown_key_version", async () => {
  const r = await resolveBridgeSecret(
    baseInput({ secretKeyVersion: 99 }),
    () => randomBytes(32),
  );
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.reason, "unknown_key_version");
});

Deno.test("known version but provider returns null → missing_env_key", async () => {
  const r = await resolveBridgeSecret(baseInput(), () => null);
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.reason, "missing_env_key");
});

Deno.test("known version but provider returns wrong-length bytes → missing_env_key", async () => {
  const r = await resolveBridgeSecret(baseInput(), () => randomBytes(16));
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.reason, "missing_env_key");
});

Deno.test("key provider throw → missing_env_key", async () => {
  const r = await resolveBridgeSecret(baseInput(), () => {
    throw new Error("env access denied");
  });
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.reason, "missing_env_key");
});

// ---------- Decryption ----------

Deno.test("tampered ciphertext → decrypt_failed", async () => {
  const key = randomBytes(32);
  const { ciphertext, nonce } = await encryptForTest(PLAINTEXT_SECRET, key);
  const tampered = new Uint8Array(ciphertext);
  tampered[0] ^= 0xff;
  const r = await resolveBridgeSecret(
    baseInput({ secretCiphertext: tampered, secretNonce: nonce }),
    fixedKeyProvider(key, 1),
  );
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.reason, "decrypt_failed");
});

Deno.test("wrong key → decrypt_failed", async () => {
  const key = randomBytes(32);
  const wrongKey = randomBytes(32);
  const { ciphertext, nonce } = await encryptForTest(PLAINTEXT_SECRET, key);
  const r = await resolveBridgeSecret(
    baseInput({ secretCiphertext: ciphertext, secretNonce: nonce }),
    fixedKeyProvider(wrongKey, 1),
  );
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.reason, "decrypt_failed");
});

// ---------- Output hygiene ----------

Deno.test("failure result never contains secret/ciphertext/nonce/key material", async () => {
  const key = randomBytes(32);
  const { ciphertext, nonce } = await encryptForTest(PLAINTEXT_SECRET, key);
  const tampered = new Uint8Array(ciphertext);
  tampered[0] ^= 0xff;
  const r = await resolveBridgeSecret(
    baseInput({ secretCiphertext: tampered, secretNonce: nonce }),
    fixedKeyProvider(key, 1),
  );
  const json = JSON.stringify(r);
  for (const forbidden of [
    PLAINTEXT_SECRET,
    btoa(String.fromCharCode(...key)),
    btoa(String.fromCharCode(...nonce)),
    btoa(String.fromCharCode(...tampered)),
    "PI_INGEST_SECRET_KEY",
  ]) {
    assert(
      !json.includes(forbidden),
      `failure result leaked forbidden token: ${forbidden}`,
    );
  }
});

Deno.test("success result exposes secret only, not ciphertext/nonce/key", async () => {
  const key = randomBytes(32);
  const { ciphertext, nonce } = await encryptForTest(PLAINTEXT_SECRET, key);
  const r = await resolveBridgeSecret(
    baseInput({ secretCiphertext: ciphertext, secretNonce: nonce }),
    fixedKeyProvider(key, 1),
  );
  assert(r.ok);
  if (r.ok) {
    const json = JSON.stringify(r);
    for (const forbidden of [
      btoa(String.fromCharCode(...key)),
      btoa(String.fromCharCode(...nonce)),
      btoa(String.fromCharCode(...ciphertext)),
      "secret_ciphertext",
      "secret_nonce",
      "secret_key_version",
      "PI_INGEST_SECRET_KEY",
    ]) {
      assert(
        !json.includes(forbidden),
        `success result leaked forbidden token: ${forbidden}`,
      );
    }
    assertNotEquals(r.secret, "");
  }
});

// ---------- Source guardrails ----------

Deno.test("secretResolver.ts source contains no forbidden surfaces", async () => {
  const src = await Deno.readTextFile(
    new URL("./secretResolver.ts", import.meta.url),
  );
  const forbidden: Array<[string, RegExp]> = [
    ["createClient", /\bcreateClient\s*\(/],
    ["service_role", /service_role/i],
    ["supabase-js import", /from\s+["'][^"']*supabase-js[^"']*["']/],
    ["sensor_readings", /\bsensor_readings\b/],
    ["pi_ingest_idempotency_keys", /\bpi_ingest_idempotency_keys\b/],
    ["alerts table from()", /from\(\s*["']alerts["']\s*\)/],
    ["action_queue table from()", /from\(\s*["']action_queue["']\s*\)/],
    ["secret_hash → secret", /secret\s*:\s*[A-Za-z_.]*\.?secret_hash\b/],
    ["secret_ciphertext → secret", /secret\s*:\s*[A-Za-z_.]*\.?secret_ciphertext\b/],
    ["console.log of secret", /console\.(log|info|warn|error)\s*\([^)]*\bsecret\b/i],
    ["React import", /from\s+["']react["']/],
  ];
  for (const [label, re] of forbidden) {
    assert(!re.test(src), `secretResolver.ts contains forbidden surface: ${label}`);
  }
});

Deno.test("index.ts remains fail-closed and does not consume the resolver", async () => {
  const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  assert(src.includes("secret_resolver_not_implemented"));
  assert(!/from\s+["']\.\/secretResolver(\.ts)?["']/.test(src));
  assert(!/resolveBridgeSecret\s*\(/.test(src));
  assert(!/ok\s*:\s*true/.test(src));
});

// ---------- Default env provider ----------

Deno.test("defaultEnvKeyProvider returns null for invalid versions", () => {
  assertEquals(defaultEnvKeyProvider(0), null);
  assertEquals(defaultEnvKeyProvider(-1), null);
  assertEquals(defaultEnvKeyProvider(1.5), null);
});

Deno.test("defaultEnvKeyProvider returns null when env var unset", () => {
  const original = Deno.env.get("PI_INGEST_SECRET_KEY_V1");
  Deno.env.delete("PI_INGEST_SECRET_KEY_V1");
  try {
    assertEquals(defaultEnvKeyProvider(1), null);
  } finally {
    if (original !== undefined) Deno.env.set("PI_INGEST_SECRET_KEY_V1", original);
  }
});

Deno.test("defaultEnvKeyProvider returns value when env var set", () => {
  const original = Deno.env.get("PI_INGEST_SECRET_KEY_V1");
  Deno.env.set("PI_INGEST_SECRET_KEY_V1", "test-marker-value");
  try {
    assertEquals(defaultEnvKeyProvider(1), "test-marker-value");
  } finally {
    if (original !== undefined) {
      Deno.env.set("PI_INGEST_SECRET_KEY_V1", original);
    } else {
      Deno.env.delete("PI_INGEST_SECRET_KEY_V1");
    }
  }
});
