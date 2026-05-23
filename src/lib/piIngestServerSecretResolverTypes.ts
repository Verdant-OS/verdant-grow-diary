/**
 * pi-ingest server-only bridge secret resolver — TYPES/CONTRACTS ONLY.
 *
 * This module defines the input/output/failure types for the future
 * server-only bridge secret resolver that will eventually run inside
 * the `pi-ingest-readings` Edge Function.
 *
 * STRICT SCOPE:
 * - Types/contracts only. No runtime logic.
 * - No encryption. No decryption. No env reads.
 * - No Supabase client. No service_role.
 * - Must not import any crypto API.
 * - Must not be used in browser/client bundles for resolution; types
 *   may be imported by shared modules for shape compatibility only.
 *
 * See docs/pi-ingest-server-secret-resolver-implementation-plan.md.
 */

export type BridgeSecretStatus =
  | "pending_rotation"
  | "active_encrypted"
  | "disabled";

export type ResolveBridgeSecretInput = {
  bridgeId: string;
  secretCiphertext: Uint8Array | string;
  secretNonce: Uint8Array | string;
  secretKeyVersion: number;
  secretStatus: BridgeSecretStatus;
};

export type ResolvedBridgeSecret = {
  ok: true;
  bridgeId: string;
  secret: string;
};

export type BridgeSecretResolverFailureReason =
  | "missing_credential"
  | "inactive_credential"
  | "missing_ciphertext"
  | "missing_nonce"
  | "missing_key_version"
  | "unknown_key_version"
  | "missing_env_key"
  | "decrypt_failed"
  | "invalid_secret_status";

export type BridgeSecretResolverFailure = {
  ok: false;
  reason: BridgeSecretResolverFailureReason;
  message: string;
};

export type BridgeSecretResolverResult =
  | ResolvedBridgeSecret
  | BridgeSecretResolverFailure;

/**
 * Runtime sentinel listing every failure reason in the union. Used by
 * static tests to assert the union shape without introducing resolver
 * logic. Do NOT use to build HTTP responses or to drive control flow.
 */
export const BRIDGE_SECRET_RESOLVER_FAILURE_REASONS: readonly BridgeSecretResolverFailureReason[] =
  [
    "missing_credential",
    "inactive_credential",
    "missing_ciphertext",
    "missing_nonce",
    "missing_key_version",
    "unknown_key_version",
    "missing_env_key",
    "decrypt_failed",
    "invalid_secret_status",
  ] as const;

/**
 * Runtime sentinel listing every allowed bridge secret status value.
 */
export const BRIDGE_SECRET_STATUSES: readonly BridgeSecretStatus[] = [
  "pending_rotation",
  "active_encrypted",
  "disabled",
] as const;
