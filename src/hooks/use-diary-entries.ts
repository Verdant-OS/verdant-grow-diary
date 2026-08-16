import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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

export const useDiaryEntries = () =>
  useQuery({
    queryKey: ["diary_entries"],
    queryFn: fetchDiaryEntries,
  });
