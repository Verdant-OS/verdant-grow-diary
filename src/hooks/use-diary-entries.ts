import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { selectWithRetractionCompat } from "@/lib/quick-log/retractionFilterCompat";

/**
 * Shared diary reader for Daily Grow Check and other account-wide surfaces.
 * Filters retracted rows when the column exists; retries once without the
 * filter when production is still pre-migration 20260811090000 (Postgres 42703).
 */
export async function fetchDiaryEntries() {
  const { data, error } = await selectWithRetractionCompat((withRetractionFilter) => {
    let q = supabase.from("diary_entries").select("*").order("entry_at", { ascending: false });
    if (withRetractionFilter) q = q.is("retracted_at", null);
    return q;
  });

  if (error) throw error;
  return data ?? [];
}

export const useDiaryEntries = () =>
  useQuery({
    queryKey: ["diary_entries"],
    queryFn: fetchDiaryEntries,
  });
