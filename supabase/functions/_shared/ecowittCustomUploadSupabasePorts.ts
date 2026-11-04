/**
 * Service-role wiring for customized-upload ingest.
 *
 * Not registered in supabase/config.toml and not deployed. There is no Edge
 * entry and no caller of handleEcowittCustomUploadWithEntitlement yet, so
 * end-to-end storage is unproven. `requireLiveSensorEntitlement` runs before
 * commit. commitIngest calls commit_ecowitt_custom_upload_ingest, which
 * rechecks the claim, reserves the receipt, binds the first sender, and
 * inserts readings in one transaction. A Postgres 23505 means every row
 * collided, so the receipt rolls back and the response is duplicate with
 * stored 0. partial:<n> keeps the rows that did not collide.
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
export const ECOWITT_CUSTOM_UPLOAD_COMMIT_RPC = "commit_ecowitt_custom_upload_ingest" as const;

export function classifyEcowittReadingInsertError(
  error: { readonly code?: string; readonly message?: string } | null,
): "duplicate" | "failed" | null {
  if (error === null) return null;
  if (error.code === "23505") return "duplicate";
  return "failed";
}

export function ecowittServiceRoleInsertResult(
  error: { readonly code?: string; readonly message?: string } | null,
): { ok: true } | { ok: false; reason: "duplicate" | "failed" } {
  const classified = classifyEcowittReadingInsertError(error);
  if (classified === null) return { ok: true };
  return { ok: false, reason: classified };
}

export type EcowittReserveReceipt =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason:
        "rate_limited" | "duplicate_captured_at" | "claim_not_found" | "store_failed";
    };

export function ecowittCustomUploadReadingsRpcPayload(
  rows: readonly EcowittCustomUploadStoredReading[],
): ReadonlyArray<{
  readonly metric: EcowittCustomUploadStoredReading["metric"];
  readonly value: number;
  readonly quality: EcowittCustomUploadStoredReading["quality"];
  readonly raw_payload: EcowittCustomUploadStoredReading["rawPayload"];
}> {
  return rows.map((row) => ({
    metric: row.metric,
    value: row.value,
    quality: row.quality,
    raw_payload: row.rawPayload,
  }));
}

export type EcowittCommitResult =
  | { readonly ok: true; readonly stored: number; readonly reason: "stored" | "partial" }
  | {
      readonly ok: false;
      readonly reason:
        | "duplicate"
        | "store_failed"
        | "rate_limited"
        | "duplicate_captured_at"
        | "claim_not_found"
        | "passkey_mismatch";
    };

export function readEcowittCommitResult(data: unknown, submitted: number): EcowittCommitResult {
  const value = Array.isArray(data) ? data[0] : data;
  if (value === "ok") return { ok: true, stored: submitted, reason: "stored" };
  if (typeof value === "string" && value.startsWith("partial:")) {
    const stored = Number(value.slice("partial:".length));
    if (Number.isInteger(stored) && stored > 0 && stored < submitted) {
      return { ok: true, stored, reason: "partial" };
    }
  }
  if (
    value === "rate_limited" ||
    value === "duplicate_captured_at" ||
    value === "claim_not_found" ||
    value === "passkey_mismatch"
  ) {
    return { ok: false, reason: value };
  }
  return { ok: false, reason: "store_failed" };
}

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
  if (error) return { ok: false, reason: "store_failed" };
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
  ): Promise<{ ok: true } | { ok: false; reason: "duplicate" | "failed" }>;
  callCommit(
    fn: typeof ECOWITT_CUSTOM_UPLOAD_COMMIT_RPC,
    args: {
      readonly p_claim_id: string;
      readonly p_received_at: string;
      readonly p_captured_at: string;
      readonly p_passkey_sha256: string;
      readonly p_stationtype: string;
      readonly p_readings: ReturnType<typeof ecowittCustomUploadReadingsRpcPayload>;
    },
  ): Promise<{
    readonly data: unknown;
    readonly error: { readonly code?: string; readonly message: string } | null;
  }>;
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
    commitIngest: async (input) => {
      const { data, error } = await deps.serviceRole.callCommit(ECOWITT_CUSTOM_UPLOAD_COMMIT_RPC, {
        p_claim_id: input.claimId,
        p_received_at: input.receivedAt,
        p_captured_at: input.capturedAt,
        p_passkey_sha256: input.passkeySha256,
        p_stationtype: input.stationtype,
        p_readings: ecowittCustomUploadReadingsRpcPayload(input.rows),
      });
      if (error) {
        const classified = classifyEcowittReadingInsertError(error);
        if (classified === "duplicate") return { ok: false, reason: "duplicate" };
        return { ok: false, reason: "store_failed" };
      }
      return readEcowittCommitResult(data, input.rows.length);
    },
    tentChannels: (tentId) => deps.serviceRole.tentChannels(tentId),
  };
  return handleEcowittCustomUploadRequest(request, ports);
}
