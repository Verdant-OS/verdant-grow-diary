/**
 * Service-role wiring for customized-upload ingest.
 *
 * Registered by supabase/functions/ecowitt-custom-upload. Not deployed here.
 * `requireLiveSensorEntitlement` runs before any claim
 * bind or reading insert. touchClaim calls reserve_ecowitt_custom_upload_receipt
 * before insert. bindClaim must not write last_received_at or last_captured_at.
 * This module does not read a client-supplied user id from the gateway body.
 */
import { requireLiveSensorEntitlement } from "./liveSensorEntitlementGate.ts";
import type { LovableBillingEnvironment } from "./lib/lib/entitlements/lovablePaddleAdapter.ts";
import {
  handleEcowittCustomUploadRequest,
  sha256Hex,
  type EcowittCustomUploadPorts,
} from "./ecowittCustomUploadHttp.ts";
import type {
  EcowittCustomUploadClaim,
  EcowittCustomUploadStoredReading,
} from "./ecowittCustomUploadIngestRules.ts";

export const ECOWITT_CUSTOM_UPLOAD_RESERVE_RPC = "reserve_ecowitt_custom_upload_receipt" as const;

export type EcowittReserveReceipt =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason: "rate_limited" | "duplicate_captured_at" | "claim_not_found";
    };

export function readEcowittReserveReceipt(data: unknown): EcowittReserveReceipt {
  const value = Array.isArray(data) ? data[0] : data;
  if (value === "ok") return { ok: true };
  if (
    value === "rate_limited" ||
    value === "duplicate_captured_at" ||
    value === "claim_not_found"
  ) {
    return { ok: false, reason: value };
  }
  return { ok: false, reason: "claim_not_found" };
}

export async function reserveEcowittCustomUploadReceipt(
  rpc: (
    fn: typeof ECOWITT_CUSTOM_UPLOAD_RESERVE_RPC,
    args: {
      readonly p_claim_id: string;
      readonly p_received_at: string;
      readonly p_captured_at: string;
    },
  ) => Promise<{ readonly data: unknown; readonly error: { readonly message: string } | null }>,
  claimId: string,
  receivedAt: string,
  capturedAt: string,
): Promise<EcowittReserveReceipt> {
  const { data, error } = await rpc(ECOWITT_CUSTOM_UPLOAD_RESERVE_RPC, {
    p_claim_id: claimId,
    p_received_at: receivedAt,
    p_captured_at: capturedAt,
  });
  if (error) return { ok: false, reason: "claim_not_found" };
  return readEcowittReserveReceipt(data);
}

export interface EcowittCustomUploadServiceRole {
  lookupClaim(tokenSha256: string): Promise<EcowittCustomUploadClaim | null>;
  bindClaim(
    claimId: string,
    passkeySha256: string,
    stationtype: string,
    receivedAt: string,
  ): Promise<{ ok: true } | { ok: false }>;
  callReserve(
    fn: typeof ECOWITT_CUSTOM_UPLOAD_RESERVE_RPC,
    args: {
      readonly p_claim_id: string;
      readonly p_received_at: string;
      readonly p_captured_at: string;
    },
  ): Promise<{ readonly data: unknown; readonly error: { readonly message: string } | null }>;
  insertReadings(
    rows: readonly EcowittCustomUploadStoredReading[],
  ): Promise<{ ok: true } | { ok: false }>;
}

export async function handleEcowittCustomUploadWithEntitlement(
  request: Request,
  deps: {
    readonly supabase: unknown;
    readonly expectedBillingEnvironment: LovableBillingEnvironment;
    readonly now: Date;
    readonly serviceRole: EcowittCustomUploadServiceRole;
  },
): Promise<Response> {
  const ports: EcowittCustomUploadPorts = {
    now: () => deps.now,
    sha256Hex,
    lookupClaim: (tokenSha256) => deps.serviceRole.lookupClaim(tokenSha256),
    entitlement: async (userId, now) => {
      const decision = await requireLiveSensorEntitlement(
        deps.supabase,
        userId,
        deps.expectedBillingEnvironment,
        now,
      );
      if (decision.ok) return "allowed";
      if (decision.reason === "upgrade_required") return "upgrade_required";
      return "lookup_failed";
    },
    bindClaim: (claimId, passkeySha256, stationtype, receivedAt) =>
      deps.serviceRole.bindClaim(claimId, passkeySha256, stationtype, receivedAt),
    touchClaim: (claimId, receivedAt, capturedAt) =>
      reserveEcowittCustomUploadReceipt(
        (fn, args) => deps.serviceRole.callReserve(fn, args),
        claimId,
        receivedAt,
        capturedAt,
      ),
    insertReadings: (rows) => deps.serviceRole.insertReadings(rows),
  };
  return handleEcowittCustomUploadRequest(request, ports);
}
