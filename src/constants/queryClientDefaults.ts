/**
 * App-wide React Query freshness defaults.
 *
 * Without these every mount, tab switch and reconnect re-read the full diary
 * and sensor lists, because React Query treats data as stale immediately.
 * Saves still refresh straight away through explicit invalidation, and hooks
 * that set their own `staleTime` keep it.
 */
export const QUERY_STALE_TIME_MS = 60_000;

export const QUERY_CLIENT_DEFAULT_OPTIONS = {
  queries: {
    staleTime: QUERY_STALE_TIME_MS,
    refetchOnWindowFocus: false,
  },
} as const;
