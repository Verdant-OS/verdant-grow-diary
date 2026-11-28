import { createElement, useContext, useEffect, useRef, type ReactNode } from "react";
import { QueryClientContext } from "@tanstack/react-query";
import { useDiaryEntries } from "@/hooks/use-diary-entries";

type RowsRef = { current: unknown };

function DiaryEntrySource({ rowsRef }: { rowsRef: RowsRef }) {
  const query = useDiaryEntries();
  useEffect(() => {
    rowsRef.current = query.data;
  }, [rowsRef, query.data]);
  return null;
}

/**
 * Recent diary rows for the repeat-note check, read at save time through
 * `rowsRef.current`. The rows go into a ref, not state: Quick Log never
 * re-renders because the diary query returned, so a query (or a test mock)
 * that hands back a fresh array on every call cannot start a render loop.
 * The source is rendered only when a QueryClient is already mounted, so
 * Quick Log tests that have no provider keep working. With a provider, this
 * is the same `diary_entries` query Recent Activity uses.
 */
export function useOptionalDiaryEntries(): {
  rowsRef: { readonly current: unknown };
  source: ReactNode;
} {
  const client = useContext(QueryClientContext);
  const rowsRef = useRef<unknown>(undefined);
  return {
    rowsRef,
    source: client ? createElement(DiaryEntrySource, { rowsRef }) : null,
  };
}
