/**
 * ggsRealPayloadCommit — thin RPC wrapper that calls the existing
 * `pi_ingest_commit_batch` validated ingest path.
 *
 * HARD CONSTRAINTS:
 *   - Does NOT direct-insert into `sensor_readings`. Only the RPC.
 *   - Does NOT touch alerts, Action Queue, AI, device control.
 *   - Refuses to send rows whose source !== "live".
 *   - Refuses to send rows that lack a raw_payload.source_app.
 *   - Caller is responsible for confirming operator attestation before
 *     calling this function — but we still re-check the row invariants.
 */
import { supabase } from "@/integrations/supabase/client";
import type { GgsRealPayloadCommitRow } from "@/lib/ggsRealPayloadIngestRules";
import { GGS_REAL_PAYLOAD_SOURCE_APP } from "@/lib/ggsRealPayloadIngestRules";

export interface GgsRealPayloadCommitArgs {
  userId: string;
  bridgeId: string;
  tentId: string;
  rows: GgsRealPayloadCommitRow[];
}

export type GgsRealPayloadCommitResult =
  | { ok: true; inserted: number; rejected: number }
  | { ok: false; reason: string; details?: string };

export async function commitGgsRealPayload(
  args: GgsRealPayloadCommitArgs,
): Promise<GgsRealPayloadCommitResult> {
  if (!args.userId || !args.bridgeId || !args.tentId) {
    return { ok: false, reason: "context_missing" };
  }
  if (!Array.isArray(args.rows) || args.rows.length === 0) {
    return { ok: false, reason: "no_rows" };
  }
  for (const r of args.rows) {
    if (r.source !== "live") {
      return { ok: false, reason: "non_canonical_source", details: r.source };
    }
    if (!r.raw_payload || r.raw_payload.source_app !== GGS_REAL_PAYLOAD_SOURCE_APP) {
      return { ok: false, reason: "vendor_provenance_missing" };
    }
    if (!Number.isFinite(r.value)) {
      return { ok: false, reason: "non_finite_value" };
    }
  }

  const { data, error } = await supabase.rpc("pi_ingest_commit_batch", {
    p_user_id: args.userId,
    p_bridge_id: args.bridgeId,
    p_tent_id: args.tentId,
    // RPC expects jsonb; supabase-js serializes the JS array transparently.
    p_rows: args.rows as unknown as Parameters<
      typeof supabase.rpc
    >[1] extends infer _ ? unknown : unknown,
  } as never);

  if (error) {
    return { ok: false, reason: "rpc_error", details: error.message };
  }
  const row = Array.isArray(data) ? data[0] : (data as { inserted?: number; rejected?: number } | null);
  return {
    ok: true,
    inserted: Number(row?.inserted ?? 0),
    rejected: Number(row?.rejected ?? 0),
  };
}
