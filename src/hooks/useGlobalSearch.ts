/**
 * Shared global search. Private owner-scoped grows / tents / plants are backed
 * by the RLS-enforced public.verdant_search RPC; public cultivar references are
 * merged in from the bundled Strain Reference Library V1 constants. One hook,
 * one result model, one GlobalSearchDialog — no second search system and no
 * client-side fetch-all of private data.
 */
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
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
import {
  getGlobalSearchPrivateStateEpoch,
  subscribeGlobalSearchPrivateStateClear,
} from "@/lib/globalSearchSession";

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
  const privateStateEpoch = useSyncExternalStore(
    subscribeGlobalSearchPrivateStateClear,
    getGlobalSearchPrivateStateEpoch,
    getGlobalSearchPrivateStateEpoch,
  );
  const hasQuery = trimmed.length > 0;
  // Never execute or expose a stale debounced term after the raw query changes.
  // In particular, the synchronous auth-identity fence clears the raw query
  // before it clears QueryClient; disabling immediately prevents the previous
  // owner's term from being reissued during the 200 ms debounce window.
  const queryReady = hasQuery && trimmed === debounced;
  const effectiveQuery = queryReady ? debounced : "";

  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    // Never retain a stale private term in a post-fence query-cache key while
    // React waits for the debounced value to catch up with the cleared input.
    queryKey: ["global-search", privateStateEpoch, effectiveQuery],
    // TanStack evaluates function-valued `enabled` at fetch time. Comparing
    // against the live epoch closes the synchronous window before React has
    // committed the clear listener's state update.
    enabled: () => queryReady && getGlobalSearchPrivateStateEpoch() === privateStateEpoch,
    queryFn: async (): Promise<PrivateSearchRow[]> => {
      if (getGlobalSearchPrivateStateEpoch() !== privateStateEpoch) return [];
      const { data, error } = await supabase.rpc("verdant_search", {
        q: effectiveQuery,
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
      queryReady
        ? searchCultivarReferences(VERDANT_CULTIVARS, effectiveQuery, MAX_RESULTS)
        : EMPTY_RESULTS,
    [queryReady, effectiveQuery],
  );

  const mergedResults = useMemo(
    () => mergeGlobalSearchResults(data ?? EMPTY_RESULTS, cultivarResults),
    [data, cultivarResults],
  );

  // When the query is empty, return a stable empty reference — not a fresh `[]`.
  const results = queryReady ? mergedResults : EMPTY_RESULTS;

  const retry = useCallback(() => {
    if (queryReady) void refetch();
  }, [queryReady, refetch]);

  return {
    results,
    // Show loading while debouncing a non-empty query, or while fetching.
    isLoading: hasQuery && (!queryReady || isLoading || isFetching),
    isError: queryReady && isError,
    retry,
  };
}
