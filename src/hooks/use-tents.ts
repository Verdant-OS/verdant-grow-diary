import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const useTents = () =>
  useQuery({
    queryKey: ["tents"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tents")
        .select("*")
        .eq("is_archived", false)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data ?? [];
    },
  });
