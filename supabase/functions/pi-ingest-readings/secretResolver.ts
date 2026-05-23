// Server-only bridge secret resolver for pi-ingest-readings.
//
// MUST run only inside this Edge Function path. MUST NOT be imported
// from anywhere under src/. MUST NOT touch Supabase, the database,
// sensor_readings, pi_ingest_idempotency_keys, alerts, or action_queue.
// MUST NOT log decrypted secret material, ciphertext, nonce, env key
// names, or key bytes. Decrypted secrets exist only in-memory for one
// request and the caller MUST drop the reference immediately after
// HMAC verification.
//
// See:
// - docs/pi-ingest-server-secret-resolver-contract.md
// - docs/pi-ingest-server-secret-resolver-implementation-plan.md
// - docs/pi-ingest-secret-key-management.md

import type {
  BridgeSecretResolverFailure,
  BridgeSecretResolverFailureReason,
  BridgeSecretResolverResult,
  ResolveBridgeSecretInput,
} from "../../../src/lib/piIngestServerSecretResolverTypes.ts";

/**
 * Injectable provider that returns raw key material for a given key
 * version. The provider hides env-var access from the resolver so the
 * resolver can be unit-tested without env mutation.
 *
 * Allowed return shapes:
 * - 32 raw bytes (Uint8Array) — used directly
 * - base64-encoded 32 bytes (string)
 * - 64-char hex string (32 bytes)
 * Anything else (null/undefined/empty/wrong-length) is treated as a
 * missing env key and the resolver fails closed.
 */
export type PiIngestSecretKeyProvider = (
  version: number,
) => string | Uint8Array | null | undefined;

const KNOWN_KEY_VERSIONS: ReadonlySet<number> = new Set([1, 2]);

function envKeyNameForVersion(version: number): string | null {
  if (!Number.isInteger(version) || version < 1) return null;
  return `PI_INGEST_SECRET_KEY_V${version}`;
}

/**
 * Default key provider that reads PI_INGEST_SECRET_KEY_V{N} from the
 * Edge Function runtime environment. Returns null when the env var is
 * unset or empty. This is the ONLY place in the Edge Function path
 * that reads these env vars.
 */
export const defaultEnvKeyProvider: PiIngestSecretKeyProvider = (version) => {
  const name = envKeyNameForVersion(version);
  if (!name) return null;
  // @ts-ignore Deno global is provided by the Edge Function runtime.
  const denoEnv = typeof Deno !== "undefined" ? Deno.env : undefined;
  if (!denoEnv || typeof denoEnv.get !== "function") return null;
  const value = denoEnv.get(name);
  return value && value.length > 0 ? value : null;
};

function fail(
  reason: BridgeSecretResolverFailureReason,
  message: string,
): BridgeSecretResolverFailure {
  return { ok: false, reason, message };
}

function base64ToBytes(b64: string): Uint8Array | null {
  try {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

function coerceInputBytes(
  value: Uint8Array | string | null | undefined,
): Uint8Array | null {
  if (value == null) return null;
  if (value instanceof Uint8Array) return value.byteLength > 0 ? value : null;
  if (typeof value === "string") {
    if (value.length === 0) return null;
    const bytes = base64ToBytes(value);
    return bytes && bytes.byteLength > 0 ? bytes : null;
  }
  return null;
}

function normalizeKeyBytes(
  raw: string | Uint8Array | null | undefined,
): Uint8Array | null {
  if (raw == null) return null;
  if (raw instanceof Uint8Array) {
    return raw.byteLength === 32 ? raw : null;
  }
  if (typeof raw !== "string" || raw.length === 0) return null;
  // Try base64 first.
  const b64 = base64ToBytes(raw);
  if (b64 && b64.byteLength === 32) return b64;
  // Then hex.
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    const out = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      out[i] = parseInt(raw.slice(i * 2, i * 2 + 2), 16);
    }
    return out;
  }
  return null;
}

/**
 * Resolve a stored encrypted bridge credential into a single in-memory
 * HMAC secret string. Fails closed on every error path. Never returns
 * ciphertext, nonce, key version, env key name, or key bytes.
 *
 * The caller MUST drop the returned `secret` reference immediately
 * after `verifyBridgeRequest`.
 */
export async function resolveBridgeSecret(
  input: ResolveBridgeSecretInput,
  keyProvider: PiIngestSecretKeyProvider = defaultEnvKeyProvider,
): Promise<BridgeSecretResolverResult> {
  if (
    !input ||
    typeof input.bridgeId !== "string" ||
    input.bridgeId.trim().length === 0
  ) {
    return fail("missing_credential", "missing credential");
  }

  const status = input.secretStatus;
  if (status === "disabled" || status === "pending_rotation") {
    return fail("inactive_credential", "credential not active");
  }
  if (status !== "active_encrypted") {
    return fail("invalid_secret_status", "invalid secret status");
  }

  const ciphertext = coerceInputBytes(input.secretCiphertext);
  if (!ciphertext) return fail("missing_ciphertext", "missing ciphertext");

  const nonce = coerceInputBytes(input.secretNonce);
  if (!nonce) return fail("missing_nonce", "missing nonce");

  const version = input.secretKeyVersion;
  if (
    typeof version !== "number" ||
    !Number.isInteger(version) ||
    version < 1
  ) {
    return fail("missing_key_version", "missing key version");
  }

  if (!KNOWN_KEY_VERSIONS.has(version)) {
    return fail("unknown_key_version", "unknown key version");
  }

  let rawKey: string | Uint8Array | null | undefined;
  try {
    rawKey = keyProvider(version);
  } catch {
    return fail("missing_env_key", "missing env key");
  }
  if (rawKey == null || (typeof rawKey === "string" && rawKey.length === 0)) {
    return fail("missing_env_key", "missing env key");
  }

  const keyBytes = normalizeKeyBytes(rawKey);
  if (!keyBytes) return fail("missing_env_key", "missing env key");

  try {
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyBytes,
      { name: "AES-GCM" },
      false,
      ["decrypt"],
    );
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: nonce },
      cryptoKey,
      ciphertext,
    );
    const text = new TextDecoder().decode(plain);
    if (!text || text.length === 0) {
      return fail("decrypt_failed", "decrypt failed");
    }
    return { ok: true, bridgeId: input.bridgeId, secret: text };
  } catch {
    // Never leak underlying error details.
    return fail("decrypt_failed", "decrypt failed");
  }
}
