import { createElement, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { QueryClientContext } from "@tanstack/react-query";
import { useDiaryEntries } from "@/hooks/use-diary-entries";

function sameDiaryRows(prev: unknown, next: unknown): boolean {
  if (prev === next) return true;
  if (!Array.isArray(prev) || !Array.isArray(next) || prev.length !== next.length) return false;
  for (let i = 0; i < prev.length; i += 1) {
    if (prev[i] !== next[i]) return false;
  }
  return true;
}

function DiaryEntrySource({ onData }: { onData: (data: unknown) => void }) {
  const query = useDiaryEntries();
  useEffect(() => {
    onData(query.data);
  }, [onData, query.data]);
  return null;
}

/**
 * Recent diary rows for the repeat-note check. The source is rendered only
 * when a QueryClient is already mounted, so Quick Log tests that have no
 * provider keep working. With a provider, this is the same `diary_entries`
 * query Recent Activity uses.
 */
export function useOptionalDiaryEntries(): { data: unknown; source: ReactNode } {
  const client = useContext(QueryClientContext);
  const [data, setData] = useState<unknown>(undefined);
  const onData = useCallback((next: unknown) => {
    setData((prev) => (sameDiaryRows(prev, next) ? prev : next));
  }, []);
  return {
    data: client ? data : undefined,
    source: client ? createElement(DiaryEntrySource, { onData }) : null,
  };
}
