/**
 * Pure pi-ingest bridge tent-scope rules.
 *
 * Given a resolved bridge metadata record and an incoming envelope's
 * tent id, decide whether the bridge is allowed to submit readings for
 * that tent.
 *
 * Hard rules (enforced by static tests):
 * - No Supabase imports.
 * - No secret material on input or output.
 * - No decryption.
 * - Metadata-only authorization support.
 */

import type { BridgeCredentialMetadata } from "./piIngestBridgeCredentialMetadataResolver";

export type BridgeTentScopeRejectionReason =
  | "unknown_bridge"
  | "inactive"
  | "missing_tent_id"
  | "tent_not_allowed";

export type BridgeTentScopeResult =
  | { ok: true }
  | { ok: false; reason: BridgeTentScopeRejectionReason };

export type EvaluateBridgeTentScopeInput = {
  credential: BridgeCredentialMetadata | null | undefined;
  tentId: string | null | undefined;
};

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

export function evaluateBridgeTentScope(
  input: EvaluateBridgeTentScopeInput,
): BridgeTentScopeResult {
  const { credential, tentId } = input ?? ({} as EvaluateBridgeTentScopeInput);

  if (!credential) {
    return { ok: false, reason: "unknown_bridge" };
  }

  if (!credential.isActive) {
    return { ok: false, reason: "inactive" };
  }

  if (!isNonEmptyString(tentId)) {
    return { ok: false, reason: "missing_tent_id" };
  }

  const allowed = credential.allowedTentIds;
  if (
    !Array.isArray(allowed) ||
    allowed.length === 0 ||
    !allowed.includes(tentId)
  ) {
    return { ok: false, reason: "tent_not_allowed" };
  }

  return { ok: true };
}
