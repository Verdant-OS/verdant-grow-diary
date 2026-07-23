/**
 * Shared global search. Backed by the public.verdant_search RPC. The
 * Strain Library will reuse this same RPC + the GlobalSearchDialog
 * rather than forking a second search system.
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type GlobalSearchEntityType = "grow" | "tent" | "plant";

export interface GlobalSearchResult {
  entity_type: GlobalSearchEntityType;
  id: string;
  label: string;
  sublabel: string;
  match_kind: "exact" | "prefix" | "fuzzy";
  rank: number;
  score: number;
}

const DEBOUNCE_MS = 200;
const MAX_RESULTS = 20;

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

export interface UseGlobalSearchReturn {
  results: GlobalSearchResult[];
  isLoading: boolean;
  isError: boolean;
}

export function useGlobalSearch(query: string): UseGlobalSearchReturn {
  const trimmed = query.trim();
  const debounced = useDebouncedValue(trimmed, DEBOUNCE_MS);
  const enabled = debounced.length > 0;

  const { data, isLoading, isFetching, isError } = useQuery({
    queryKey: ["global-search", debounced],
    enabled,
    queryFn: async (): Promise<GlobalSearchResult[]> => {
      const { data, error } = await supabase.rpc("verdant_search", {
        q: debounced,
        max_results: MAX_RESULTS,
      });
      if (error) throw error;
      // Preserve RPC ordering (exact → prefix → fuzzy).
      return (data ?? []) as GlobalSearchResult[];
    },
    staleTime: 30_000,
  });

  return {
    results: enabled ? (data ?? []) : [],
    // Show loading while debouncing a non-empty query, or while fetching.
    isLoading: enabled && (isLoading || isFetching || trimmed !== debounced),
    isError,
  };
}
