import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  findSimilarNames,
  similarNameWarning,
  type NamedRecord,
} from "@/lib/similarNameWarningRules";

type CachedRow = NamedRecord & { grow_id?: string | null };

/**
 * Same keys as PLANTS_QUERY_KEY / TENTS_QUERY_KEY in src/hooks/use-plants.ts and
 * use-tents.ts, inlined so tests that mock those hook modules keep working;
 * src/test/similar-name-warning-note.test.tsx pins that they stay equal.
 */
export const SIMILAR_NAME_CACHE_KEYS = {
  plant: ["plants"],
  tent: ["tents"],
} as const;

/**
 * Non-blocking near-duplicate name warning under a plant or tent name field
 * (grower bug item 19). Reads only the plant/tent lists already in the query
 * cache: no fetch and no subscription, so dialogs keep their exact read/write
 * behavior.
 * snip: cache-only; if the list was never loaded this session, no warning shows.
 * Upgrade to a dedicated owner-scoped name lookup if growers open these dialogs cold.
 */
export function SimilarNameWarningNote({
  entity,
  candidate,
  growId,
  excludeId,
  testId,
}: {
  entity: "plant" | "tent";
  candidate: string;
  /** Plants only: compare within this grow. */
  growId?: string | null;
  excludeId?: string | null;
  testId: string;
}) {
  const queryClient = useQueryClient();
  // Some test harnesses stub the query client without getQueryData.
  const cached =
    typeof queryClient?.getQueryData === "function"
      ? queryClient.getQueryData<CachedRow[]>(SIMILAR_NAME_CACHE_KEYS[entity])
      : undefined;
  const existing = useMemo(() => {
    const rows = Array.isArray(cached) ? cached : [];
    if (entity === "tent") return rows;
    if (!growId) return [];
    return rows.filter((row) => row?.grow_id === growId);
  }, [cached, entity, growId]);
  const message = useMemo(
    () => similarNameWarning(entity, findSimilarNames({ candidate, existing, excludeId })),
    [entity, candidate, existing, excludeId],
  );
  if (!message) return null;
  return (
    <p className="mt-1 text-xs text-amber-500" role="status" data-testid={testId}>
      {message}
    </p>
  );
}
