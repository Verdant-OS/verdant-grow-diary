// Server-only contract for the encrypted bridge credential row that a
// future DB lookup inside this Edge Function will return.
//
// CONTRACT/TYPES ONLY. No Supabase client. No DB read/write. No env
// reads. No logging. Used only to type the row passed into
// `resolveBridgeSecret` and to derive non-sensitive metadata.
//
// Public metadata MUST NOT include ciphertext, nonce, key version, or
// any decrypted secret material. The resolver in `secretResolver.ts`
// is the only consumer that ever sees raw plaintext.

import type { ResolveBridgeSecretInput } from "../../../src/lib/piIngestServerSecretResolverTypes.ts";

export type PiIngestBridgeSecretStatus =
  | "pending_rotation"
  | "active_encrypted"
  | "disabled";

/**
 * Snake-case row shape, as it will arrive from a future server-side
 * SELECT against `public.pi_ingest_bridge_credentials`.
 *
 * `secret_ciphertext` / `secret_nonce` may be either raw bytes (when
 * fetched as `bytea`) or a base64 string (when fetched as text). The
 * resolver accepts both shapes.
 */
export type PiIngestBridgeCredentialRow = {
  bridge_id: string;
  user_id: string;
  is_active: boolean;
  secret_ciphertext: Uint8Array | string | null;
  secret_nonce: Uint8Array | string | null;
  secret_key_version: number | null;
  secret_status: PiIngestBridgeSecretStatus;
  allowed_tent_ids: string[];
  last_used_at: string | null;
};

/**
 * Camel-case, non-sensitive metadata shape that is safe to expose to
 * downstream Edge Function code paths (logs, telemetry, response
 * envelopes). MUST NOT include ciphertext, nonce, key version, or any
 * decrypted secret material.
 */
export type PiIngestBridgeCredentialPublicMetadata = {
  bridgeId: string;
  userId: string;
  isActive: boolean;
  secretStatus: PiIngestBridgeSecretStatus;
  allowedTentIds: string[];
  lastUsedAt: string | null;
};

const ALLOWED_STATUSES: ReadonlySet<PiIngestBridgeSecretStatus> = new Set([
  "pending_rotation",
  "active_encrypted",
  "disabled",
]);

function assertValidStatus(status: unknown): PiIngestBridgeSecretStatus {
  if (
    typeof status === "string" &&
    ALLOWED_STATUSES.has(status as PiIngestBridgeSecretStatus)
  ) {
    return status as PiIngestBridgeSecretStatus;
  }
  throw new Error("invalid_secret_status");
}

/**
 * Project a credential row into the input shape consumed by
 * `resolveBridgeSecret`. Pure mapping — no decryption, no env reads,
 * no logging. Empty/missing encrypted fields are forwarded as empty
 * inputs so the resolver fails closed with the matching `missing_*`
 * reason.
 */
export function toResolveBridgeSecretInput(
  row: PiIngestBridgeCredentialRow,
): ResolveBridgeSecretInput {
  return {
    bridgeId: row.bridge_id,
    secretCiphertext: row.secret_ciphertext ?? new Uint8Array(),
    secretNonce: row.secret_nonce ?? new Uint8Array(),
    secretKeyVersion: row.secret_key_version ?? 0,
    secretStatus: assertValidStatus(row.secret_status),
  };
}

/**
 * Project a credential row into a non-sensitive metadata object.
 * Strips ciphertext, nonce, and key version. Safe to surface to
 * downstream Edge Function code, structured logs, and ingest
 * telemetry.
 */
export function toBridgeCredentialMetadata(
  row: PiIngestBridgeCredentialRow,
): PiIngestBridgeCredentialPublicMetadata {
  return {
    bridgeId: row.bridge_id,
    userId: row.user_id,
    isActive: row.is_active,
    secretStatus: assertValidStatus(row.secret_status),
    allowedTentIds: [...(row.allowed_tent_ids ?? [])],
    lastUsedAt: row.last_used_at,
  };
}
