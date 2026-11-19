import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import { selectWithRetractionCompat } from "@/lib/quick-log/retractionFilterCompat";

export async function fetchDiaryEntries() {
  const { data, error } = await selectWithRetractionCompat((withRetractionFilter) => {
    let query = supabase.from("diary_entries").select("*");
    if (withRetractionFilter) query = query.is("retracted_at", null);
    return query.order("entry_at", { ascending: false });
  });

  if (error) throw error;
  return data ?? [];
}

/**
 * Cache key for the signed-in grower's diary list. The owner id keeps one
 * account's cached diary from ever being served to another; the
 * `["diary_entries"]` prefix keeps every existing prefix invalidation working.
 */
export function diaryEntriesQueryKey(ownerId: string | null | undefined) {
  return ["diary_entries", ownerId ?? "anon"] as const;
}

export const useDiaryEntries = (options?: { enabled?: boolean }) => {
  const { user } = useAuth();
  const ownerId = user?.id ?? null;
  return useQuery({
    queryKey: diaryEntriesQueryKey(ownerId),
    queryFn: fetchDiaryEntries,
    // Wait for sign-in so an anonymous read never fills the owner's cache.
    enabled: (options?.enabled ?? true) && ownerId !== null,
  });
};
