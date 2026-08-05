/**
 * useDiaryEntryAuditTrail — read-only fetch of the audit history for a single
 * diary entry. Sourced from `public.diary_entry_audit_log`, written only by
 * the SECURITY DEFINER trigger on `diary_entries`. RLS scopes rows to the
 * owning grower (operators see all). This hook never writes.
 */
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface DiaryEntryAuditFieldChange {
  from: unknown;
  to: unknown;
}

export interface DiaryEntryAuditRow {
  id: string;
  diary_entry_id: string;
  user_id: string;
  action: "update" | "delete";
  changed_at: string;
  actor_id: string | null;
  changed_fields: Record<string, DiaryEntryAuditFieldChange>;
  previous_snapshot: Record<string, unknown> | null;
}

export function diaryEntryAuditQueryKey(diaryEntryId: string | null | undefined) {
  return ["diary-entry-audit", diaryEntryId ?? null] as const;
}

export function useDiaryEntryAuditTrail(
  diaryEntryId: string | null | undefined,
): UseQueryResult<DiaryEntryAuditRow[], Error> {
  return useQuery({
    queryKey: diaryEntryAuditQueryKey(diaryEntryId),
    enabled: Boolean(diaryEntryId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("diary_entry_audit_log")
        .select(
          "id, diary_entry_id, user_id, action, changed_at, actor_id, changed_fields, previous_snapshot",
        )
        .eq("diary_entry_id", diaryEntryId as string)
        .order("changed_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as DiaryEntryAuditRow[];
    },
  });
}
