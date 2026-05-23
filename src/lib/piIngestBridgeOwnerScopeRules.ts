/**
 * Pure pi-ingest bridge owner-scope rules.
 *
 * Confirms a bridge credential and the target tent belong to the same
 * owner before any future endpoint inserts sensor readings. Protects
 * against cross-user tent writes per pi-ingest-readings-contract §8.
 *
 * Hard rules (enforced by static tests):
 * - No Supabase imports.
 * - No secret material on input or output.
 * - No decryption.
 * - Metadata-only authorization support.
 */

import type { BridgeCredentialMetadata } from "./piIngestBridgeCredentialMetadataResolver";

export type BridgeOwnerScopeRejectionReason =
  | "unknown_bridge"
  | "inactive"
  | "missing_tent_owner"
  | "owner_mismatch";

export type BridgeOwnerScopeResult =
  | { ok: true }
  | { ok: false; reason: BridgeOwnerScopeRejectionReason };

export type EvaluateBridgeOwnerScopeInput = {
  credential: BridgeCredentialMetadata | null | undefined;
  tentOwnerUserId: string | null | undefined;
};

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

export function evaluateBridgeOwnerScope(
  input: EvaluateBridgeOwnerScopeInput,
): BridgeOwnerScopeResult {
  const { credential, tentOwnerUserId } =
    input ?? ({} as EvaluateBridgeOwnerScopeInput);

  if (!credential || !isNonEmptyString(credential.userId)) {
    return { ok: false, reason: "unknown_bridge" };
  }

  if (!credential.isActive) {
    return { ok: false, reason: "inactive" };
  }

  if (!isNonEmptyString(tentOwnerUserId)) {
    return { ok: false, reason: "missing_tent_owner" };
  }

  if (credential.userId !== tentOwnerUserId) {
    return { ok: false, reason: "owner_mismatch" };
  }

  return { ok: true };
}
