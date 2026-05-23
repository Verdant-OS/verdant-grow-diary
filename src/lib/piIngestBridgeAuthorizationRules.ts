/**
 * Pure pi-ingest bridge authorization composer.
 *
 * Runs owner-scope and tent-scope checks in a fixed, safe order so the
 * future endpoint cannot accidentally check tent access before verifying
 * the bridge and tent share the same owner.
 *
 * Order:
 *   1. Owner scope (bridge owner === tent owner)
 *   2. Tent scope  (tent in allowedTentIds)
 *
 * Hard rules (enforced by static tests):
 * - No Supabase imports.
 * - No secret material on input or output.
 * - No decryption.
 * - Metadata-only authorization support.
 */

import type { BridgeCredentialMetadata } from "./piIngestBridgeCredentialMetadataResolver";
import {
  evaluateBridgeOwnerScope,
  type BridgeOwnerScopeRejectionReason,
} from "./piIngestBridgeOwnerScopeRules";
import {
  evaluateBridgeTentScope,
  type BridgeTentScopeRejectionReason,
} from "./piIngestBridgeTentScopeRules";

export type BridgeAuthorizationStage = "owner" | "tent";

export type BridgeAuthorizationResult =
  | { ok: true }
  | {
      ok: false;
      stage: "owner";
      reason: BridgeOwnerScopeRejectionReason;
    }
  | {
      ok: false;
      stage: "tent";
      reason: BridgeTentScopeRejectionReason;
    };

export type EvaluateBridgeAuthorizationInput = {
  credential: BridgeCredentialMetadata | null | undefined;
  tentId: string | null | undefined;
  tentOwnerUserId: string | null | undefined;
};

export function evaluateBridgeAuthorization(
  input: EvaluateBridgeAuthorizationInput,
): BridgeAuthorizationResult {
  const { credential, tentId, tentOwnerUserId } =
    input ?? ({} as EvaluateBridgeAuthorizationInput);

  const owner = evaluateBridgeOwnerScope({ credential, tentOwnerUserId });
  if (owner.ok === false) {
    return { ok: false, stage: "owner", reason: owner.reason };
  }

  const tent = evaluateBridgeTentScope({ credential, tentId });
  if (tent.ok === false) {
    return { ok: false, stage: "tent", reason: tent.reason };
  }

  return { ok: true };
}
