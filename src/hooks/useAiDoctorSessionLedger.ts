/**
 * useAiDoctorSessionLedger — read-only hook for the AI Doctor Session
 * Integrity Ledger (`/doctor/sessions?view=ledger`).
 *
 * Fetches ONLY the metadata fields needed to prove persistence and frozen
 * scope/evidence context for the signed-in owner's saved sessions, plus the
 * minimal grow/tent/plant name lookups needed to label that scope. Never
 * selects `user_id`, `question`, `analysis`, `diagnosis`,
 * `suggested_actions`, raw/displayed confidence, context data, photo URLs,
 * or model/provider payloads.
 *
 * Safety envelope:
 *   - Read-only. No insert/update/upsert/delete/rpc. No functions.invoke.
 *   - Owner-scoped via existing RLS (auth.uid()) only — no service role, no
 *     staff/admin bypass, no cross-user lookup.
 *   - Never fetches `sensor_readings` or any live telemetry table. Grow/
 *     tent/plant lookups are metadata (id/name/is_archived) only.
 */
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  buildAiDoctorSessionLedgerViewModel,
  type AiDoctorLedgerEntry,
  type AiDoctorLedgerSessionRow,
} from "@/lib/aiDoctorSessionLedgerViewModel";

export const AI_DOCTOR_SESSION_LEDGER_PAGE_SIZE = 25;

// Metadata-only select. Deliberately excludes user_id, question, analysis,
// diagnosis, suggested_actions, raw/displayed confidence, context data, and
// any photo/model payload — see aiDoctorSessionLedgerViewModel.ts.
const LEDGER_SESSION_SELECT =
  "id,created_at,grow_id,tent_id,plant_id,sensor_snapshot_status,sensor_snapshot_reason_code,counts_as_healthy_evidence,sensor_evidence_mode,sensor_evidence_evaluated_at";

export interface AiDoctorSessionLedgerPage {
  entries: AiDoctorLedgerEntry[];
  page: number;
  pageSize: number;
  hasMore: boolean;
}

function uniqueIds(values: ReadonlyArray<string | null | undefined>): string[] {
  const set = new Set<string>();
  for (const v of values) {
    if (typeof v === "string" && v.length > 0) set.add(v);
  }
  return [...set];
}

interface ScopeNameRow {
  id: string;
  name: string | null;
  is_archived: boolean | null;
}

/**
 * Owner-scoped id -> name lookup for a single scope table. Archived rows are
 * deliberately excluded from the returned map so the ledger renders
 * "Archived or unavailable" for them — identical treatment to a reference
 * that no longer resolves at all. RLS (not this function) is what actually
 * prevents cross-owner reads; this only decides archived-vs-shown.
 */
async function fetchScopeNameMap(
  table: "grows" | "tents" | "plants",
  ids: readonly string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (ids.length === 0) return map;
  const { data, error } = await supabase
    .from(table)
    .select("id,name,is_archived")
    .in("id", ids as string[]);
  if (error) throw error;
  for (const row of (data ?? []) as ScopeNameRow[]) {
    if (row.is_archived) continue;
    if (typeof row.name === "string" && row.name.length > 0) {
      map.set(row.id, row.name);
    }
  }
  return map;
}

function safePage(page: number): number {
  return Number.isFinite(page) && page >= 0 ? Math.floor(page) : 0;
}

export function useAiDoctorSessionLedger(
  page: number = 0,
): UseQueryResult<AiDoctorSessionLedgerPage> {
  const pageSize = AI_DOCTOR_SESSION_LEDGER_PAGE_SIZE;
  const currentPage = safePage(page);
  const from = currentPage * pageSize;
  // Fetch one extra row to detect "hasMore" without a separate count query.
  const to = from + pageSize;

  return useQuery({
    queryKey: ["ai_doctor_sessions", "ledger", currentPage, pageSize],
    queryFn: async (): Promise<AiDoctorSessionLedgerPage> => {
      const { data, error } = await supabase
        .from("ai_doctor_sessions" as never)
        .select(LEDGER_SESSION_SELECT)
        .order("created_at", { ascending: false })
        .range(from, to);
      if (error) throw error;
      const all = (data ?? []) as AiDoctorLedgerSessionRow[];
      const hasMore = all.length > pageSize;
      const rows = hasMore ? all.slice(0, pageSize) : all;

      const [growNameById, tentNameById, plantNameById] = await Promise.all([
        fetchScopeNameMap("grows", uniqueIds(rows.map((r) => r.grow_id))),
        fetchScopeNameMap("tents", uniqueIds(rows.map((r) => r.tent_id))),
        fetchScopeNameMap("plants", uniqueIds(rows.map((r) => r.plant_id))),
      ]);

      const entries = buildAiDoctorSessionLedgerViewModel(rows, {
        growNameById,
        tentNameById,
        plantNameById,
      });

      return { entries, page: currentPage, pageSize, hasMore };
    },
  });
}
