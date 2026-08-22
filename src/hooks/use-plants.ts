import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { applyPostgrestAbortSignal, rethrowIfAbortError } from "@/lib/supabaseAbort";
import type { PlantRow } from "@/lib/db";

export const PLANTS_QUERY_KEY = ["plants"] as const;

/** The canonical all-active-plants read shared by the observer and recovery receipt. */
export async function fetchPlants(signal?: AbortSignal): Promise<PlantRow[]> {
  const { data, error } = await applyPostgrestAbortSignal(
    supabase
      .from("plants")
      .select("*")
      .eq("is_archived", false)
      .order("created_at", { ascending: true }),
    signal,
  );

  rethrowIfAbortError(error);
  if (error) throw error;
  return data ?? [];
}

export const usePlants = () =>
  useQuery({
    queryKey: PLANTS_QUERY_KEY,
    queryFn: ({ signal }) => fetchPlants(signal),
  });
