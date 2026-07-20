/**
 * Deterministic keyset-paginated one-tent irrigation ledger.
 *
 * Reads canonical grow_events (watering + feeding) via an embedded join and
 * paginates by keyset `occurred_at DESC, id DESC` — the cursor is the RAW
 * occurred_at string from the DB row (never a Date round-trip), double-quoted in
 * the .or() filter, so no row is dropped or duplicated at equal timestamps.
 * Fetches pageSize+1 to derive hasMore from the RAW set. Distinct loading /
 * whole-query-error / partial-older-error / empty-success / populated states.
 */
import { useInfiniteQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import {
  IRRIGATION_LEDGER_SELECT,
  buildIrrigationLedger,
  buildKeysetPage,
  type IrrigationCursor,
  type IrrigationLedgerRow,
} from "@/lib/irrigation/irrigationLedgerRules";

export const IRRIGATION_LEDGER_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

export interface UseTentIrrigationLedgerOptions {
  tentId: string | null | undefined;
  growId?: string | null;
  plantId?: string | null;
  pageSize?: number;
}

export interface UseTentIrrigationLedgerResult {
  rows: IrrigationLedgerRow[];
  isLoading: boolean;
  /** Whole-query failure (first page could not load). */
  isError: boolean;
  /** Earlier pages loaded, but loading OLDER entries failed — ledger is truncated, not complete. */
  isOlderError: boolean;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  fetchNextPage: () => void;
  refetch: () => void;
}

interface LedgerPage {
  rawRows: Record<string, unknown>[];
  nextCursor: IrrigationCursor | null;
}

function boundedPageSize(size: number | undefined): number {
  const n = Math.floor(size ?? IRRIGATION_LEDGER_PAGE_SIZE);
  return Math.max(1, Math.min(MAX_PAGE_SIZE, Number.isFinite(n) ? n : IRRIGATION_LEDGER_PAGE_SIZE));
}

export function useTentIrrigationLedger(
  opts: UseTentIrrigationLedgerOptions,
): UseTentIrrigationLedgerResult {
  const ownerId = useAuth().user?.id ?? null;
  const tentId = opts.tentId ?? null;
  const plantId = opts.plantId ?? null;
  const pageSize = boundedPageSize(opts.pageSize);
  const enabled = !!ownerId && !!tentId;

  const query = useInfiniteQuery<LedgerPage>({
    queryKey: ["irrigation", "ledger", ownerId ?? "anon", tentId ?? "none", plantId ?? "all", pageSize],
    enabled,
    retry: false,
    initialPageParam: null as IrrigationCursor | null,
    queryFn: async ({ pageParam }) => {
      const cursor = pageParam as IrrigationCursor | null;
      let q = supabase
        .from("grow_events")
        .select(IRRIGATION_LEDGER_SELECT)
        .eq("tent_id", tentId as string)
        .eq("is_deleted", false)
        .in("event_type", ["watering", "feeding"]);
      if (plantId) q = q.eq("plant_id", plantId);
      if (cursor) {
        // Double-quoted timestamptz + uuid so PostgREST parses reserved chars verbatim.
        const ts = cursor.occurredAt;
        const id = cursor.id;
        q = q.or(`occurred_at.lt."${ts}",and(occurred_at.eq."${ts}",id.lt."${id}")`);
      }
      const { data, error } = await q
        .order("occurred_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(pageSize + 1);
      if (error) throw error;
      const { pageRawRows, hasMore, nextCursor } = buildKeysetPage(data ?? [], pageSize);
      return { rawRows: pageRawRows, nextCursor: hasMore ? nextCursor : null };
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

  const rows = useMemo(() => {
    const all = (query.data?.pages ?? []).flatMap((p) => p.rawRows);
    return buildIrrigationLedger(all);
  }, [query.data]);

  const hasLoaded = rows.length > 0;

  return {
    rows,
    isLoading: query.isLoading,
    isError: query.isError && !hasLoaded,
    isOlderError: query.isError && hasLoaded,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: query.hasNextPage ?? false,
    fetchNextPage: () => {
      void query.fetchNextPage();
    },
    refetch: () => {
      void query.refetch();
    },
  };
}
