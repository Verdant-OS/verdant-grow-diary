/**
 * useRetractedQuickLogEntries — owner-facing audit disclosure list
 * (issue #786).
 *
 * Deliberately reads retracted diary mirror rows (retracted_at IS NOT NULL)
 * plus their ledger rows so the grower can always see what was retracted,
 * when, and why. This is the ONE reader that is allowed to see retracted
 * rows; every operational reader excludes them.
 *
 * Safety contract: SELECT-only; owner-scoped by RLS; no entitlement checks.
 */
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import {
  parseQuickLogRevisionRow,
  type QuickLogRevision,
} from "@/lib/quick-log/quickLogRevisionRules";
import {
  decodeQuickLogRevisionDatabaseRows,
  QUICKLOG_REVISION_TABLE,
} from "@/lib/quickLogRevisionService";
import { isMissingRetractedColumnError } from "@/lib/quick-log/retractionFilterCompat";

export interface RetractedQuickLogEntry {
  diaryEntryId: string;
  note: string;
  entryAt: string | null;
  retractedAt: string;
  plantId: string | null;
  tentId: string | null;
  retraction: QuickLogRevision | null;
}

export function buildRetractedQuickLogEntriesQueryKey(growId: string | null) {
  return ["quicklog_retracted_entries", growId ?? "none"] as const;
}

export const RETRACTED_DISCLOSURE_LIMIT = 25;

export interface RetractedQuickLogEntriesResult {
  entries: RetractedQuickLogEntry[];
  /** Exact total of retained retractions for this grow (may exceed entries.length). */
  totalCount: number;
}

export function useRetractedQuickLogEntries(growId: string | null | undefined) {
  const query = useQuery({
    queryKey: buildRetractedQuickLogEntriesQueryKey(growId ?? null),
    enabled: typeof growId === "string" && growId.length > 0,
    queryFn: async (): Promise<RetractedQuickLogEntriesResult> => {
      const { data, error, count } = await supabase
        .from("diary_entries")
        .select("id, note, entry_at, retracted_at, plant_id, tent_id", { count: "exact" })
        .eq("grow_id", growId as string)
        .not("retracted_at", "is", null)
        .order("retracted_at", { ascending: false })
        .limit(RETRACTED_DISCLOSURE_LIMIT);
      if (isMissingRetractedColumnError(error)) {
        return { entries: [], totalCount: 0 };
      }
      if (error) throw error;
      const rows = (data ?? []).filter(
        (r): r is typeof r & { retracted_at: string } =>
          typeof r.retracted_at === "string" && r.retracted_at.length > 0,
      );
      const totalCount = typeof count === "number" ? count : rows.length;
      if (rows.length === 0) return { entries: [], totalCount };

      const ids = rows.map((r) => r.id);
      const { data: revData } = await supabase
        .from(QUICKLOG_REVISION_TABLE)
        .select(
          "id, grow_event_id, diary_entry_id, root_id, user_id, actor_id, revision_no, kind, reason_code, reason_note, previous_state, new_state, created_at",
        )
        .eq("kind", "retraction")
        .or(`diary_entry_id.in.(${ids.join(",")}),root_id.in.(${ids.join(",")})`);
      const decoded = decodeQuickLogRevisionDatabaseRows(revData);
      const revisions = decoded.ok
        ? decoded.rows
            .map(parseQuickLogRevisionRow)
            .filter((r): r is QuickLogRevision => r !== null)
        : [];
      const byDiaryId = new Map<string, QuickLogRevision>();
      for (const rev of revisions) {
        if (rev.diaryEntryId) byDiaryId.set(rev.diaryEntryId, rev);
        byDiaryId.set(rev.rootId, byDiaryId.get(rev.rootId) ?? rev);
      }

      return {
        entries: rows.map((r) => ({
          diaryEntryId: r.id,
          note: r.note,
          entryAt: r.entry_at ?? null,
          retractedAt: r.retracted_at,
          plantId: r.plant_id ?? null,
          tentId: r.tent_id ?? null,
          retraction: byDiaryId.get(r.id) ?? null,
        })),
        totalCount,
      };
    },
  });
  return {
    entries: query.data?.entries ?? [],
    totalCount: query.data?.totalCount ?? 0,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
