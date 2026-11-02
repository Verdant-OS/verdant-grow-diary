/**
 * Claim-link client. The caller injects the RPC port. This module does not
 * import Supabase and does not keep the raw token after returning it.
 */

export interface EcowittClaimRpcResult {
  readonly data: unknown;
  readonly error: { readonly message: string } | null;
}

export interface EcowittClaimRpcClient {
  rpc(
    fn: "create_ecowitt_custom_upload_claim",
    args: { readonly p_tent_id: string },
  ): Promise<EcowittClaimRpcResult>;
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
