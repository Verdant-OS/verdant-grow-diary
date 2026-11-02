/**
 * Claim-link client. The caller injects the RPC port. This module does not
 * import Supabase and does not keep the raw token after returning it.
 */

export interface EcowittClaimRpcResult {
  readonly data: unknown;
  readonly error: { readonly message: string } | null;
}

export const ECOWITT_OPEN_CLAIM_COLUMNS =
  "id,bound_at,revoked_at,last_received_at,interval_seconds";

export interface EcowittClaimRpcClient {
  rpc(
    fn:
      | "create_ecowitt_custom_upload_claim"
      | "revoke_ecowitt_custom_upload_claim"
      | "rotate_ecowitt_custom_upload_claim",
    args: { readonly p_tent_id?: string; readonly p_claim_id?: string },
  ): Promise<EcowittClaimRpcResult>;
}

export interface EcowittOpenClaimClient {
  from(table: "ecowitt_custom_upload_claims"): {
    select(columns: string): {
      eq(
        column: "tent_id",
        value: string,
      ): {
        is(
          column: "revoked_at",
          value: null,
        ): {
          maybeSingle(): Promise<EcowittClaimRpcResult>;
        };
      };
    };
  };
}

export interface EcowittOpenClaim {
  readonly id: string;
  readonly boundAt: string | null;
  readonly revokedAt: string | null;
  readonly lastReceivedAt: string | null;
  readonly intervalSeconds: number;
}

export type EcowittClaimCreateResult =
  | { readonly ok: true; readonly claimId: string; readonly uploadToken: string }
  | { readonly ok: false; readonly reason: "tent_missing" | "rpc_failed" | "malformed_response" };

function readCreatedToken(data: unknown): { claimId: string; uploadToken: string } | null {
  const row = Array.isArray(data) ? data[0] : data;
  if (row === null || typeof row !== "object") return null;
  const record = row as Record<string, unknown>;
  const claimId = record.claim_id;
  const uploadToken = record.upload_token;
  if (typeof claimId !== "string" || typeof uploadToken !== "string") return null;
  if (!/^[0-9a-f]{32,128}$/.test(uploadToken)) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(claimId)) {
    return null;
  }
  return { claimId, uploadToken };
}

export async function createEcowittCustomUploadClaim(
  client: EcowittClaimRpcClient,
  tentId: string | null,
): Promise<EcowittClaimCreateResult> {
  if (tentId === null || tentId === "") return { ok: false, reason: "tent_missing" };
  const { data, error } = await client.rpc("create_ecowitt_custom_upload_claim", {
    p_tent_id: tentId,
  });
  if (error) return { ok: false, reason: "rpc_failed" };
  const created = readCreatedToken(data);
  if (created === null) return { ok: false, reason: "malformed_response" };
  return { ok: true, claimId: created.claimId, uploadToken: created.uploadToken };
}

function readBoolean(data: unknown): boolean | null {
  const value = Array.isArray(data) ? data[0] : data;
  return typeof value === "boolean" ? value : null;
}

function readRotatedToken(data: unknown): string | null {
  const value = Array.isArray(data) ? data[0] : data;
  if (typeof value !== "string" || !/^[0-9a-f]{32,128}$/.test(value)) return null;
  return value;
}

export async function revokeEcowittCustomUploadClaim(
  client: EcowittClaimRpcClient,
  claimId: string | null,
): Promise<
  | { readonly ok: true; readonly revoked: boolean }
  | { readonly ok: false; readonly reason: "claim_missing" | "rpc_failed" | "malformed_response" }
> {
  if (claimId === null || claimId === "") return { ok: false, reason: "claim_missing" };
  const { data, error } = await client.rpc("revoke_ecowitt_custom_upload_claim", {
    p_claim_id: claimId,
  });
  if (error) return { ok: false, reason: "rpc_failed" };
  const revoked = readBoolean(data);
  if (revoked === null) return { ok: false, reason: "malformed_response" };
  return { ok: true, revoked };
}

export async function rotateEcowittCustomUploadClaim(
  client: EcowittClaimRpcClient,
  claimId: string | null,
): Promise<
  | { readonly ok: true; readonly uploadToken: string }
  | { readonly ok: false; readonly reason: "claim_missing" | "rpc_failed" | "malformed_response" }
> {
  if (claimId === null || claimId === "") return { ok: false, reason: "claim_missing" };
  const { data, error } = await client.rpc("rotate_ecowitt_custom_upload_claim", {
    p_claim_id: claimId,
  });
  if (error) return { ok: false, reason: "rpc_failed" };
  const uploadToken = readRotatedToken(data);
  if (uploadToken === null) return { ok: false, reason: "malformed_response" };
  return { ok: true, uploadToken };
}

function readOpenClaim(data: unknown): EcowittOpenClaim | null {
  const row = Array.isArray(data) ? data[0] : data;
  if (row === null || typeof row !== "object") return null;
  const record = row as Record<string, unknown>;
  if (typeof record.id !== "string") return null;
  if ("token_sha256" in record || "passkey_sha256" in record) return null;
  const boundAt = record.bound_at;
  const revokedAt = record.revoked_at;
  const lastReceivedAt = record.last_received_at;
  const intervalSeconds = record.interval_seconds;
  if (boundAt !== null && typeof boundAt !== "string") return null;
  if (revokedAt !== null && typeof revokedAt !== "string") return null;
  if (lastReceivedAt !== null && typeof lastReceivedAt !== "string") return null;
  if (typeof intervalSeconds !== "number" || !Number.isFinite(intervalSeconds)) return null;
  return {
    id: record.id,
    boundAt,
    revokedAt,
    lastReceivedAt,
    intervalSeconds,
  };
}

export async function loadOpenEcowittCustomUploadClaim(
  client: EcowittOpenClaimClient,
  tentId: string | null,
): Promise<
  | { readonly ok: true; readonly claim: EcowittOpenClaim | null }
  | { readonly ok: false; readonly reason: "tent_missing" | "rpc_failed" | "malformed_response" }
> {
  if (tentId === null || tentId === "") return { ok: false, reason: "tent_missing" };
  const { data, error } = await client
    .from("ecowitt_custom_upload_claims")
    .select(ECOWITT_OPEN_CLAIM_COLUMNS)
    .eq("tent_id", tentId)
    .is("revoked_at", null)
    .maybeSingle();
  if (error) return { ok: false, reason: "rpc_failed" };
  if (data === null) return { ok: true, claim: null };
  const claim = readOpenClaim(data);
  if (claim === null) return { ok: false, reason: "malformed_response" };
  return { ok: true, claim };
}
