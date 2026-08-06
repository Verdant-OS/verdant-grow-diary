/**
 * Shared global search. Private owner-scoped grows / tents / plants are backed
 * by the RLS-enforced public.verdant_search RPC; public cultivar references are
 * merged in from the bundled Strain Reference Library V1 constants. One hook,
 * one result model, one GlobalSearchDialog — no second search system and no
 * client-side fetch-all of private data.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { VERDANT_CULTIVARS } from "@/constants/verdantCultivars";
import {
  mergeGlobalSearchResults,
  searchCultivarReferences,
  type GlobalSearchEntityType,
  type GlobalSearchResult,
  type PrivateSearchRow,
} from "@/lib/globalSearchResults";

export type {
  GlobalSearchEntityType,
  GlobalSearchMatchKind,
  GlobalSearchResult,
  PrivateSearchEntityType,
  PrivateSearchRow,
} from "@/lib/globalSearchResults";

const DEBOUNCE_MS = 200;
const MAX_RESULTS = 20;

/** Stable empty list — a fresh `[]` each render re-fires dialog effects that
 *  depend on `results` / derived array identity and can max-update-depth / OOM
 *  Vitest when GlobalSearchDialog mounts under pages that also subscribe to
 *  the router (e.g. CultivarsIndex + useSearchParams). */
const EMPTY_RESULTS: GlobalSearchResult[] = [];

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
  retry: () => void;
}

export function useGlobalSearch(query: string): UseGlobalSearchReturn {
  const trimmed = query.trim();
  const debounced = useDebouncedValue(trimmed, DEBOUNCE_MS);
  const enabled = debounced.length > 0;

  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: ["global-search", debounced],
    enabled,
    queryFn: async (): Promise<PrivateSearchRow[]> => {
      const { data, error } = await supabase.rpc("verdant_search", {
        q: debounced,
        max_results: MAX_RESULTS,
      });
      if (error) throw error;
      // Preserve RPC ordering (exact → prefix → fuzzy) for private entities.
      return (data ?? []) as PrivateSearchRow[];
    },
    staleTime: 30_000,
    retry: false,
  });

  // Public cultivar references resolve synchronously from bundled constants and
  // stay available even if the private RPC is loading or fails — a private
  // failure must never be presented as a verified empty result.
  const cultivarResults = useMemo(
    () =>
      enabled ? searchCultivarReferences(VERDANT_CULTIVARS, debounced, MAX_RESULTS) : EMPTY_RESULTS,
    [enabled, debounced],
  );

  const mergedResults = useMemo(
    () => mergeGlobalSearchResults(data ?? EMPTY_RESULTS, cultivarResults),
    [data, cultivarResults],
  );

  // When the query is empty, return a stable empty reference — not a fresh `[]`.
  const results = enabled ? mergedResults : EMPTY_RESULTS;

  const retry = useCallback(() => {
    if (enabled) void refetch();
  }, [enabled, refetch]);

  return {
    results,
    // Show loading while debouncing a non-empty query, or while fetching.
    isLoading: enabled && (isLoading || isFetching || trimmed !== debounced),
    isError,
    retry,
  };
}
