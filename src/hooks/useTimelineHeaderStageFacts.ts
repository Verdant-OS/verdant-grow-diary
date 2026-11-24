import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  isTimelineHeaderRecordInGrow,
  resolveTimelineHeaderPlantGrowId,
} from "@/lib/timelineHeaderStageRules";

export interface TimelineHeaderStageFacts {
  /** Scoped plant's stage and start. Null when unscoped, loading, unavailable or another grow's. */
  plant: { stage: string | null; started_at: string | null } | null;
  /** Scoped tent's stage. Null when unscoped, loading, unavailable or another grow's. */
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
 * plant or tent.
 *
 * - Owner-scoped like `useTimelineNameDirectory` (additive operator RLS
 *   policies must not pull another grower's row).
 * - Grow-scoped: a plant counts only when its effective grow (its own
 *   `grow_id`, or its tent's for a legacy null-grow plant) is the active
 *   grow; a tent only when its `grow_id` is. Another grow's record never
 *   supplies this header.
 * - Gated on the proven grow id, so nothing is read while grow ownership is
 *   pending, and a result is dropped as soon as its scope is left, so a
 *   previous scope's facts never reappear while a fresh read is in flight.
 * - A failed read leaves that record null, and the header falls back to
 *   the grow.
 */
export function useTimelineHeaderStageFacts(
  userId: string | null,
  growId: string | null,
  plantId: string | null,
  tentId: string | null,
): TimelineHeaderStageFacts {
  const scopeKey =
    userId && growId && (plantId || tentId)
      ? `${userId}|${growId}|${plantId ?? ""}|${tentId ?? ""}`
      : null;
  const [loaded, setLoaded] = useState<{ key: string; facts: TimelineHeaderStageFacts } | null>(
    null,
  );

  useEffect(() => {
    if (!scopeKey || !userId || !growId) return;
    let cancelled = false;
    (async () => {
      const facts: TimelineHeaderStageFacts = { plant: null, tent: null };
      try {
        const [plantResult, tentResult] = await Promise.all([
          plantId
            ? supabase
                .from("plants")
                .select("stage,started_at,grow_id,tent_id")
                .eq("id", plantId)
                .eq("user_id", userId)
            : Promise.resolve(null),
          tentId
            ? supabase.from("tents").select("stage,grow_id").eq("id", tentId).eq("user_id", userId)
            : Promise.resolve(null),
        ]);
        const tentRow = firstRow(tentResult);
        const plantRow = firstRow(plantResult);
        if (plantRow) {
          let plantTentGrowId: unknown = null;
          const plantTentId = text(plantRow.tent_id);
          if (plantRow.grow_id == null && plantTentId) {
            const plantTentRow =
              plantTentId === tentId
                ? tentRow
                : firstRow(
                    await supabase
                      .from("tents")
                      .select("grow_id")
                      .eq("id", plantTentId)
                      .eq("user_id", userId),
                  );
            plantTentGrowId = plantTentRow?.grow_id ?? null;
          }
          const plantGrowId = resolveTimelineHeaderPlantGrowId(plantRow.grow_id, plantTentGrowId);
          if (isTimelineHeaderRecordInGrow(plantGrowId, growId)) {
            facts.plant = { stage: text(plantRow.stage), started_at: text(plantRow.started_at) };
          }
        }
        if (tentRow && isTimelineHeaderRecordInGrow(tentRow.grow_id, growId)) {
          facts.tent = { stage: text(tentRow.stage) };
        }
      } catch {
        // Unavailable reads leave the header on the grow.
      }
      if (!cancelled) setLoaded({ key: scopeKey, facts });
    })();
    return () => {
      cancelled = true;
      // Leaving a scope drops its result, so returning to it later shows
      // nothing scoped until its fresh read lands.
      setLoaded(null);
    };
  }, [scopeKey, userId, growId, plantId, tentId]);

  if (!scopeKey || !loaded || loaded.key !== scopeKey) return EMPTY;
  return loaded.facts;
}
