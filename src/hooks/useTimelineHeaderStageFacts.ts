import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface TimelineHeaderStageFacts {
  /** The scoped plant's own stage and start. Null while unscoped, loading or unavailable. */
  plant: { stage: string | null; started_at: string | null } | null;
  /** The scoped tent's own stage. Null while unscoped, loading or unavailable. */
  tent: { stage: string | null } | null;
}

const EMPTY: TimelineHeaderStageFacts = { plant: null, tent: null };

function firstRow(result: unknown): Record<string, unknown> | null {
  if (!result || typeof result !== "object") return null;
  const { data, error } = result as { data?: unknown; error?: unknown };
  if (error || !Array.isArray(data) || data.length === 0) return null;
  const row = data[0];
  return row && typeof row === "object" ? (row as Record<string, unknown>) : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/**
 * Read-only stage facts for the Timeline header when the page is scoped to a
 * plant or tent. Owner-scoped like `useTimelineNameDirectory` (additive
 * operator RLS policies must not pull another grower's row), gated on the
 * proven grow id so nothing is read while grow ownership is pending, and
 * reset synchronously on any scope change so a previous plant's stage never
 * shows under a new one. A failed read leaves that record null, and the
 * header falls back to the grow.
 */
export function useTimelineHeaderStageFacts(
  userId: string | null,
  growId: string | null,
  plantId: string | null,
  tentId: string | null,
): TimelineHeaderStageFacts {
  const scopeKey = userId && growId ? `${userId}|${growId}|${plantId ?? ""}|${tentId ?? ""}` : null;
  const [loaded, setLoaded] = useState<{ key: string; facts: TimelineHeaderStageFacts } | null>(
    null,
  );

  useEffect(() => {
    if (!scopeKey || !userId || (!plantId && !tentId)) return;
    let cancelled = false;
    (async () => {
      const facts: TimelineHeaderStageFacts = { plant: null, tent: null };
      try {
        const [plantResult, tentResult] = await Promise.all([
          plantId
            ? supabase
                .from("plants")
                .select("stage,started_at")
                .eq("id", plantId)
                .eq("user_id", userId)
            : Promise.resolve(null),
          tentId
            ? supabase.from("tents").select("stage").eq("id", tentId).eq("user_id", userId)
            : Promise.resolve(null),
        ]);
        const plantRow = firstRow(plantResult);
        if (plantRow) {
          facts.plant = { stage: text(plantRow.stage), started_at: text(plantRow.started_at) };
        }
        const tentRow = firstRow(tentResult);
        if (tentRow) facts.tent = { stage: text(tentRow.stage) };
      } catch {
        // Unavailable reads leave the header on the grow.
      }
      if (!cancelled) setLoaded({ key: scopeKey, facts });
    })();
    return () => {
      cancelled = true;
    };
  }, [scopeKey, userId, plantId, tentId]);

  if (!scopeKey || !loaded || loaded.key !== scopeKey) return EMPTY;
  return loaded.facts;
}
