/**
 * useEcowittIngestAuditProofRows — read-only hook returning EcoWitt ingest
 * audit rows for the current tent + current proof window.
 *
 * Hard constraints:
 *  - SELECT only. No insert/update/delete/upsert.
 *  - Narrow column allowlist: source, tent identifier, rows_received,
 *    rows_inserted, captured_at, created_at. Never selects the owning
 *    auth identifier, bridge token identifier, or any private/raw-payload
 *    field.
 *  - RLS-scoped to the authenticated caller by existing policy
 *    ("Users view own ingest audit"). Permission errors collapse to
 *    "blocked" so the UI can render the unavailable copy.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  ECOWITT_AUDIT_PROOF_WINDOW_MS,
  type EcowittIngestAuditProofRow,
  type EcowittIngestAuditProofStatus,
} from "@/lib/ecowittIngestAuditProofRules";

export interface UseEcowittIngestAuditProofRowsResult {
  status: EcowittIngestAuditProofStatus;
  rows: readonly EcowittIngestAuditProofRow[];
}

export interface UseEcowittIngestAuditProofRowsOptions {
  tentId: string | null | undefined;
  enabled?: boolean;
}

const AUDIT_PROOF_LIMIT = 200;

function classifyError(err: unknown): "blocked" | "error" {
  const code =
    (err as { code?: string | null } | null)?.code ?? null;
  const message =
    typeof (err as { message?: unknown } | null)?.message === "string"
      ? ((err as { message: string }).message ?? "").toLowerCase()
      : "";
  if (
    code === "42501" ||
    code === "PGRST301" ||
    message.includes("permission denied") ||
    message.includes("rls")
  ) {
    return "blocked";
  }
  return "error";
}

export function useEcowittIngestAuditProofRows(
  options: UseEcowittIngestAuditProofRowsOptions,
): UseEcowittIngestAuditProofRowsResult {
  const tentId = options.tentId ?? null;
  const enabled = options.enabled !== false && tentId !== null;

  const query = useQuery({
    queryKey: ["ecowitt_ingest_audit_proof", tentId],
    enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<EcowittIngestAuditProofRow[]> => {
      const windowStartIso = new Date(
        Date.now() - ECOWITT_AUDIT_PROOF_WINDOW_MS,
      ).toISOString();
      const { data, error } = await supabase
        .from("sensor_ingest_audit_log")
        .select(
          "source, tent_id, rows_received, rows_inserted, captured_at, created_at",
        )
        .eq("source", "ecowitt")
        .eq("tent_id", tentId as string)
        .gte("created_at", windowStartIso)
        .order("created_at", { ascending: false })
        .limit(AUDIT_PROOF_LIMIT);
      if (error) throw error;
      return (data ?? []) as EcowittIngestAuditProofRow[];
    },
  });

  if (!enabled) {
    return { status: "unavailable", rows: [] };
  }
  if (query.isLoading || query.isPending) {
    return { status: "loading", rows: [] };
  }
  if (query.isError) {
    return { status: classifyError(query.error), rows: [] };
  }
  const rows = (query.data ?? []) as readonly EcowittIngestAuditProofRow[];
  if (rows.length === 0) {
    return { status: "no_audit_rows", rows };
  }
  return { status: "loaded", rows };
}
