// Deno tests for the server-only bridge credential row contract.
// Verifies pure mapping behavior, metadata hygiene (no secret
// material), and that the module declares no forbidden surfaces.
import {
  assert,
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  type PiIngestBridgeCredentialRow,
  toBridgeCredentialMetadata,
  toResolveBridgeSecretInput,
} from "./bridgeCredentialRow.ts";

function baseRow(
  overrides: Partial<PiIngestBridgeCredentialRow> = {},
): PiIngestBridgeCredentialRow {
  return {
    bridge_id: "bridge-abc",
    user_id: "user-xyz",
    is_active: true,
    secret_ciphertext: new Uint8Array([1, 2, 3, 4]),
    secret_nonce: new Uint8Array([5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]),
    secret_key_version: 1,
    secret_status: "active_encrypted",
    allowed_tent_ids: ["tent-1", "tent-2"],
    last_used_at: "2026-05-23T00:00:00Z",
    ...overrides,
  };
}

// ---------- toResolveBridgeSecretInput ----------

Deno.test("maps bytes ciphertext/nonce through unchanged", () => {
  const row = baseRow();
  const input = toResolveBridgeSecretInput(row);
  assertEquals(input.bridgeId, "bridge-abc");
  assertEquals(input.secretCiphertext, row.secret_ciphertext);
  assertEquals(input.secretNonce, row.secret_nonce);
  assertEquals(input.secretKeyVersion, 1);
  assertEquals(input.secretStatus, "active_encrypted");
});

Deno.test("maps base64 string ciphertext/nonce through unchanged", () => {
  const row = baseRow({
    secret_ciphertext: "Y2lwaGVydGV4dA==",
    secret_nonce: "bm9uY2Vub25jZW5vbmM=",
  });
  const input = toResolveBridgeSecretInput(row);
  assertEquals(input.secretCiphertext, "Y2lwaGVydGV4dA==");
  assertEquals(input.secretNonce, "bm9uY2Vub25jZW5vbmM=");
});

Deno.test("null ciphertext/nonce become empty bytes (resolver fails closed)", () => {
  const row = baseRow({ secret_ciphertext: null, secret_nonce: null });
  const input = toResolveBridgeSecretInput(row);
  assert(input.secretCiphertext instanceof Uint8Array);
  assert(input.secretNonce instanceof Uint8Array);
  assertEquals((input.secretCiphertext as Uint8Array).byteLength, 0);
  assertEquals((input.secretNonce as Uint8Array).byteLength, 0);
});

Deno.test("null secret_key_version becomes 0 (resolver fails closed)", () => {
  const row = baseRow({ secret_key_version: null });
  const input = toResolveBridgeSecretInput(row);
  assertEquals(input.secretKeyVersion, 0);
});

Deno.test("forwards each allowed status verbatim", () => {
  for (const s of ["active_encrypted", "pending_rotation", "disabled"] as const) {
    const input = toResolveBridgeSecretInput(baseRow({ secret_status: s }));
    assertEquals(input.secretStatus, s);
  }
});

Deno.test("invalid secret_status throws", () => {
  assertThrows(
    // deno-lint-ignore no-explicit-any
    () => toResolveBridgeSecretInput(baseRow({ secret_status: "bogus" as any })),
    Error,
    "invalid_secret_status",
  );
});

// ---------- toBridgeCredentialMetadata ----------

Deno.test("metadata exposes only non-sensitive fields", () => {
  const row = baseRow();
  const meta = toBridgeCredentialMetadata(row);
  assertEquals(meta, {
    bridgeId: "bridge-abc",
    userId: "user-xyz",
    isActive: true,
    secretStatus: "active_encrypted",
    allowedTentIds: ["tent-1", "tent-2"],
    lastUsedAt: "2026-05-23T00:00:00Z",
  });
  for (const forbidden of [
    "secretCiphertext",
    "secretNonce",
    "secretKeyVersion",
    "secret",
    "secret_ciphertext",
    "secret_nonce",
    "secret_key_version",
    "secret_hash",
  ]) {
    assert(
      !(forbidden in (meta as Record<string, unknown>)),
      `metadata leaked forbidden field: ${forbidden}`,
    );
  }
});

Deno.test("metadata JSON serialization contains no secret tokens", () => {
  const row = baseRow({
    secret_ciphertext: "Y2lwaGVydGV4dC1tYXJrZXI=",
    secret_nonce: "bm9uY2UtbWFya2Vy",
  });
  const json = JSON.stringify(toBridgeCredentialMetadata(row));
  for (const forbidden of [
    "Y2lwaGVydGV4dC1tYXJrZXI=",
    "bm9uY2UtbWFya2Vy",
    "secret_ciphertext",
    "secret_nonce",
    "secret_key_version",
    "secret_hash",
  ]) {
    assert(
      !json.includes(forbidden),
      `metadata JSON leaked forbidden token: ${forbidden}`,
    );
  }
});

Deno.test("metadata defensively copies allowed_tent_ids", () => {
  const row = baseRow({ allowed_tent_ids: ["t1"] });
  const meta = toBridgeCredentialMetadata(row);
  meta.allowedTentIds.push("mutated");
  assertEquals(row.allowed_tent_ids, ["t1"]);
});

Deno.test("metadata throws on invalid status", () => {
  assertThrows(
    // deno-lint-ignore no-explicit-any
    () => toBridgeCredentialMetadata(baseRow({ secret_status: "bogus" as any })),
    Error,
    "invalid_secret_status",
  );
});

// ---------- Source guardrails ----------

Deno.test("bridgeCredentialRow.ts source contains no forbidden surfaces", async () => {
  const src = await Deno.readTextFile(
    new URL("./bridgeCredentialRow.ts", import.meta.url),
  );
  const forbidden: Array<[string, RegExp]> = [
    ["createClient", /\bcreateClient\s*\(/],
    ["service_role", /service_role/i],
    ["supabase-js import", /from\s+["'][^"']*supabase-js[^"']*["']/],
    ["Deno.env.get", /\bDeno\.env\.(get|set|delete)\s*\(/],
    ["crypto.subtle", /\bcrypto\.subtle\b/],
    ["createDecipheriv", /\bcreateDecipheriv\s*\(/],
    ["sensor_readings table", /\bsensor_readings\b/],
    ["idempotency table", /\bpi_ingest_idempotency_keys\b/],
    ["alerts table from()", /from\(\s*["']alerts["']\s*\)/],
    ["action_queue table from()", /from\(\s*["']action_queue["']\s*\)/],
    ["secret_hash mapping", /secret_hash/],
    ["plaintext secret field on row", /\bsecret\s*:\s*string\b/],
    ["console.log of secret", /console\.(log|info|warn|error)\s*\([^)]*\bsecret\b/i],
    ["React import", /from\s+["']react["']/],
    ["resolveBridgeSecret call", /\bresolveBridgeSecret\s*\(/],
  ];
  for (const [label, re] of forbidden) {
    assert(!re.test(src), `bridgeCredentialRow.ts contains forbidden surface: ${label}`);
  }
});

Deno.test("index.ts imports bridgeCredentialRow + resolver behind auth gate", async () => {
  const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  assert(/secret_resolver_not_implemented|auth_ok_pipeline_not_implemented/.test(src));
  assert(/from\s+["']\.\/bridgeCredentialRow(\.ts)?["']/.test(src));
  assert(/from\s+["']\.\/secretResolver(\.ts)?["']/.test(src));
  assert(!/ok\s*:\s*true/.test(src));
});
