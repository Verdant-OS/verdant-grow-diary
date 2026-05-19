import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const useDiaryEntries = () =>
  useQuery({
    queryKey: ["diary_entries"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("diary_entries")
        .select("*")
        .order("entry_at", { ascending: false });

      if (error) throw error;
      return data ?? [];
    },
  });
