/**
 * Production Supabase adapters for the operator GGS commit handler.
 *
 * This is the only module in the function that knows table/RPC names. It
 * performs metadata-only reads, verifies auth with auth.getUser, and calls
 * the unchanged private write RPC exactly once after the handler authorizes
 * the request through JWT, operator-role, and tent-ownership checks.
 */
import type {
  OperatorGgsBridgeTokenContext,
  OperatorGgsCommitBatchInput,
  OperatorGgsRealPayloadCommitDeps,
  OperatorGgsTentAuthority,
} from "./handler.ts";
import { GGS_REAL_PAYLOAD_EXPECTED_ROW_COUNT } from "../_shared/lib/lib/ggsRealPayloadIngestRules.ts";

export interface OperatorGgsAuthedClient {
  auth: {
    getUser: () => Promise<{
      data: { user: { id: string } | null } | null;
      error: unknown | null;
    }>;
  };
}

export interface OperatorGgsAdminClient {
  // Supabase's generated Edge query-builder type resolves to never for this
  // isolated structural seam. Tests inject the same runtime method surface.
  // deno-lint-ignore no-explicit-any
  from(table: string): any;
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: unknown | null }>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseSingleRow(
  data: unknown,
): { ok: true; value: Record<string, unknown> | null } | { ok: false } {
  if (data == null) return { ok: true, value: null };
  if (!Array.isArray(data) || data.length > 1) return { ok: false };
  if (data.length === 0) return { ok: true, value: null };
  if (!isPlainObject(data[0])) return { ok: false };
  return { ok: true, value: data[0] };
}

function parseTentAuthority(
  data: unknown,
): { ok: true; value: OperatorGgsTentAuthority | null } | { ok: false } {
  const parsed = parseSingleRow(data);
  if (!parsed.ok) return { ok: false };
  if (!parsed.value) return { ok: true, value: null };
  const userId = parsed.value.user_id;
  if (typeof userId !== "string" || !userId) return { ok: false };
  return { ok: true, value: { userId } };
}

function parseBridgeTokenContext(
  data: unknown,
): { ok: true; value: OperatorGgsBridgeTokenContext | null } | { ok: false } {
  const parsed = parseSingleRow(data);
  if (!parsed.ok) return { ok: false };
  if (!parsed.value) return { ok: true, value: null };
  const row = parsed.value;
  if (
    typeof row.id !== "string" ||
    typeof row.user_id !== "string" ||
    typeof row.tent_id !== "string" ||
    typeof row.expires_at !== "string" ||
    (row.revoked_at !== null && typeof row.revoked_at !== "string")
  ) {
    return { ok: false };
  }
  return {
    ok: true,
    value: {
      id: row.id,
      userId: row.user_id,
      tentId: row.tent_id,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
    },
  };
}

function parseCommitCounts(
  data: unknown,
):
  { ok: true; inserted: number; rejected: number } | { ok: false; reason: "commit_not_confirmed" } {
  let row: Record<string, unknown> | null = null;
  if (Array.isArray(data)) {
    if (data.length !== 1 || !isPlainObject(data[0])) {
      return { ok: false, reason: "commit_not_confirmed" };
    }
    row = data[0];
  } else if (isPlainObject(data)) {
    row = data;
  }
  if (!row) return { ok: false, reason: "commit_not_confirmed" };
  const inserted = row.inserted;
  const rejected = row.rejected;
  if (
    typeof inserted !== "number" ||
    !Number.isSafeInteger(inserted) ||
    typeof rejected !== "number" ||
    !Number.isSafeInteger(rejected) ||
    inserted !== GGS_REAL_PAYLOAD_EXPECTED_ROW_COUNT ||
    rejected !== 0
  ) {
    return { ok: false, reason: "commit_not_confirmed" };
  }
  return { ok: true, inserted, rejected };
}

function isInvalidCredentialError(error: unknown): boolean {
  if (!isPlainObject(error)) return false;
  if (error.name === "AuthRetryableFetchError") return false;
  const status = error.status;
  return status === 400 || status === 401 || status === 403;
}

export function buildOperatorGgsRealPayloadCommitDeps(
  authed: OperatorGgsAuthedClient,
  admin: OperatorGgsAdminClient,
  now?: () => Date,
): OperatorGgsRealPayloadCommitDeps {
  return {
    now,
    getVerifiedUserId: async () => {
      try {
        const { data, error } = await authed.auth.getUser();
        if (error) {
          return isInvalidCredentialError(error) ? { ok: true, value: null } : { ok: false };
        }
        const id = data?.user?.id;
        return {
          ok: true,
          value: typeof id === "string" && id.length > 0 ? id : null,
        };
      } catch {
        return { ok: false };
      }
    },
    hasOperatorRole: async (userId) => {
      try {
        const { data, error } = await admin.rpc("has_role", {
          _user_id: userId,
          _role: "operator",
        });
        if (error) return { ok: false };
        return { ok: true, value: data === true };
      } catch {
        return { ok: false };
      }
    },
    loadTentAuthority: async (tentId) => {
      try {
        const response = await admin.from("tents").select("user_id").eq("id", tentId).limit(2);
        if (response.error) return { ok: false };
        return parseTentAuthority(response.data);
      } catch {
        return { ok: false };
      }
    },
    loadBridgeTokenContext: async (bridgeId) => {
      try {
        const response = await admin
          .from("bridge_tokens")
          .select("id,user_id,tent_id,expires_at,revoked_at")
          .eq("id", bridgeId)
          .limit(2);
        if (response.error) return { ok: false };
        return parseBridgeTokenContext(response.data);
      } catch {
        return { ok: false };
      }
    },
    commitBatch: async (input: OperatorGgsCommitBatchInput) => {
      try {
        const { data, error } = await admin.rpc("pi_ingest_commit_batch", {
          p_user_id: input.userId,
          p_bridge_id: input.bridgeId,
          p_tent_id: input.tentId,
          p_rows: input.rows,
        });
        if (error) return { ok: false, reason: "commit_failed" };
        return parseCommitCounts(data);
      } catch {
        return { ok: false, reason: "commit_failed" };
      }
    },
  };
}
