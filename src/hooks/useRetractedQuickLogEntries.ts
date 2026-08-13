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
  type QuickLogRevisionRow,
} from "@/lib/quick-log/quickLogRevisionRules";

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

const RETRACTED_DISCLOSURE_LIMIT = 25;

export function useRetractedQuickLogEntries(growId: string | null | undefined) {
  const query = useQuery({
    queryKey: buildRetractedQuickLogEntriesQueryKey(growId ?? null),
    enabled: typeof growId === "string" && growId.length > 0,
    queryFn: async (): Promise<RetractedQuickLogEntry[]> => {
      const { data, error } = await supabase
        .from("diary_entries")
        .select("id, note, entry_at, retracted_at, plant_id, tent_id")
        .eq("grow_id", growId as string)
        .not("retracted_at", "is", null)
        .order("retracted_at", { ascending: false })
        .limit(RETRACTED_DISCLOSURE_LIMIT);
      if (error) throw error;
      const rows = (data ?? []).filter(
        (r): r is typeof r & { retracted_at: string } =>
          typeof r.retracted_at === "string" && r.retracted_at.length > 0,
      );
      if (rows.length === 0) return [];

      const ids = rows.map((r) => r.id);
      const { data: revData } = await supabase
        .from("quicklog_entry_revisions")
        .select(
          "id, grow_event_id, diary_entry_id, root_id, user_id, actor_id, revision_no, kind, reason_code, reason_note, previous_state, new_state, created_at",
        )
        .eq("kind", "retraction")
        .or(`diary_entry_id.in.(${ids.join(",")}),root_id.in.(${ids.join(",")})`);
      const revisions = ((revData ?? []) as QuickLogRevisionRow[])
        .map(parseQuickLogRevisionRow)
        .filter((r): r is QuickLogRevision => r !== null);
      const byDiaryId = new Map<string, QuickLogRevision>();
      for (const rev of revisions) {
        if (rev.diaryEntryId) byDiaryId.set(rev.diaryEntryId, rev);
        byDiaryId.set(rev.rootId, byDiaryId.get(rev.rootId) ?? rev);
      }

      return rows.map((r) => ({
        diaryEntryId: r.id,
        note: r.note,
        entryAt: r.entry_at ?? null,
        retractedAt: r.retracted_at,
        plantId: r.plant_id ?? null,
        tentId: r.tent_id ?? null,
        retraction: byDiaryId.get(r.id) ?? null,
      }));
    },
  });
  return {
    entries: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
