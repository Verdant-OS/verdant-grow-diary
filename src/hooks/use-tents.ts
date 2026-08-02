import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { applyPostgrestAbortSignal, rethrowIfAbortError } from "@/lib/supabaseAbort";

export const useTents = () =>
  useQuery({
    queryKey: ["tents"],
    queryFn: async ({ signal }) => {
      const { data, error } = await applyPostgrestAbortSignal(
        supabase
          .from("tents")
          .select("*")
          .eq("is_archived", false)
          .order("created_at", { ascending: true }),
        signal,
      );

      rethrowIfAbortError(error);
      if (error) throw error;
      return data ?? [];
    },
  });
