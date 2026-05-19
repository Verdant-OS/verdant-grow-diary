import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const usePlants = () =>
  useQuery({
    queryKey: ["plants"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plants")
        .select("*")
        .eq("is_archived", false)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data ?? [];
    },
  });
