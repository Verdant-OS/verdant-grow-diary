import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { rethrowIfAbortError } from "@/lib/supabaseAbort";

export const useTents = () =>
  useQuery({
    queryKey: ["tents"],
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .from("tents")
        .select("*")
        .eq("is_archived", false)
        .order("created_at", { ascending: true })
        .abortSignal(signal);

      rethrowIfAbortError(error);
      if (error) throw error;
      return data ?? [];
    },
  });
