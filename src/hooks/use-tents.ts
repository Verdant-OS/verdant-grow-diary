import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { applyPostgrestAbortSignal, rethrowIfAbortError } from "@/lib/supabaseAbort";
import type { TentRow } from "@/lib/db";

export const TENTS_QUERY_KEY = ["tents"] as const;

/** The canonical all-active-tents read shared by the observer and recovery receipt. */
export async function fetchTents(signal?: AbortSignal): Promise<TentRow[]> {
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
}

export const useTents = () =>
  useQuery({
    queryKey: TENTS_QUERY_KEY,
    queryFn: ({ signal }) => fetchTents(signal),
  });
