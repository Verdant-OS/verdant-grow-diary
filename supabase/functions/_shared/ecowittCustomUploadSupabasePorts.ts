/**
 * Service-role wiring for customized-upload ingest.
 *
 * Not registered in supabase/config.toml and not deployed. #2702 merged at
 * 2:40 PM CT on 2026-11-02; registration still needs config.toml, which this
 * change does not edit. `requireLiveSensorEntitlement` runs before any claim
 * bind or reading insert. touchClaim calls reserve_ecowitt_custom_upload_receipt
 * before insert. bindClaim calls bind_ecowitt_custom_upload_claim, which
 * updates only while passkey_sha256 is null, and does not write receipt columns.
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
export const ECOWITT_CUSTOM_UPLOAD_BIND_RPC = "bind_ecowitt_custom_upload_claim" as const;

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
  callBind(
    fn: typeof ECOWITT_CUSTOM_UPLOAD_BIND_RPC,
    args: {
      readonly p_claim_id: string;
      readonly p_passkey_sha256: string;
      readonly p_stationtype: string;
      readonly p_bound_at: string;
    },
  ): Promise<{ readonly data: unknown; readonly error: { readonly message: string } | null }>;
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
  tentChannels(
    tentId: string,
  ): Promise<
    { ok: true; airChannels: readonly number[]; soilChannels: readonly number[] } | { ok: false }
  >;
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
    bindClaim: async (claimId, passkeySha256, stationtype, receivedAt) => {
      const { data, error } = await deps.serviceRole.callBind(ECOWITT_CUSTOM_UPLOAD_BIND_RPC, {
        p_claim_id: claimId,
        p_passkey_sha256: passkeySha256,
        p_stationtype: stationtype,
        p_bound_at: receivedAt,
      });
      if (error) return { ok: false };
      const bound = Array.isArray(data) ? data[0] : data;
      return bound === true ? { ok: true } : { ok: false };
    },
    touchClaim: (claimId, receivedAt, capturedAt) =>
      reserveEcowittCustomUploadReceipt(
        (fn, args) => deps.serviceRole.callReserve(fn, args),
        claimId,
        receivedAt,
        capturedAt,
      ),
    insertReadings: (rows) => deps.serviceRole.insertReadings(rows),
    tentChannels: (tentId) => deps.serviceRole.tentChannels(tentId),
  };
  return handleEcowittCustomUploadRequest(request, ports);
}
