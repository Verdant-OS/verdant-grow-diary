import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  buildTimelineNameLookup,
  buildTimelinePlantTentLookup,
} from "@/lib/timelineEvidenceFilterRules";

export interface TimelineNameDirectory {
  /** id → name over the owner's plants, INCLUDING archived/merged rows. Null while unavailable. */
  plantNamesById: ReadonlyMap<string, string> | null;
  /** plant id → current tent id over the same owner-scoped rows. Null while unavailable. */
  plantTentIdsById: ReadonlyMap<string, string> | null;
  /** id → name over the owner's tents, INCLUDING archived rows. Null while unavailable. */
  tentNamesById: ReadonlyMap<string, string> | null;
}

/**
 * Read-only id → name directory for Timeline filter labels.
 *
 * Deliberately omits the `is_archived = false` filter the active-entity
 * hooks use: diary history keeps referencing plants/tents after they are
 * archived or merged away, and those rows still carry their names. Both
 * reads filter on `user_id = userId` explicitly — RLS alone is not
 * enough here, because additive operator policies ("Operators view all
 * plants") would otherwise pull every grower's rows into this
 * owner-facing page and could crowd the owner's own records out of the
 * bounded response. A failed or unavailable read resolves to `null`
 * (never an empty map); unresolved ids keep the presenter's neutral
 * fragment label either way.
 */
export function useTimelineNameDirectory(userId: string | null): TimelineNameDirectory {
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);
  const [plantNamesById, setPlantNamesById] = useState<ReadonlyMap<string, string> | null>(null);
  const [plantTentIdsById, setPlantTentIdsById] = useState<ReadonlyMap<string, string> | null>(
    null,
  );
  const [tentNamesById, setTentNamesById] = useState<ReadonlyMap<string, string> | null>(null);

  useEffect(() => {
    if (!userId) {
      setLoadedUserId(null);
      setPlantNamesById(null);
      setPlantTentIdsById(null);
      setTentNamesById(null);
      return;
    }
    // A direct account transition must not expose the prior owner's directory
    // for even one render while the replacement read is in flight.
    setLoadedUserId(null);
    let cancelled = false;
    (async () => {
      try {
        const [plantsResult, tentsResult] = await Promise.all([
          supabase.from("plants").select("id,name,tent_id").eq("user_id", userId),
          supabase.from("tents").select("id,name").eq("user_id", userId),
        ]);
        if (cancelled) return;
        setPlantNamesById(plantsResult?.error ? null : buildTimelineNameLookup(plantsResult?.data));
        setPlantTentIdsById(
          plantsResult?.error || tentsResult?.error
            ? null
            : buildTimelinePlantTentLookup(plantsResult?.data, tentsResult?.data),
        );
        setTentNamesById(tentsResult?.error ? null : buildTimelineNameLookup(tentsResult?.data));
        setLoadedUserId(userId);
      } catch {
        if (cancelled) return;
        setLoadedUserId(null);
        setPlantNamesById(null);
        setPlantTentIdsById(null);
        setTentNamesById(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (!userId || loadedUserId !== userId) {
    return { plantNamesById: null, plantTentIdsById: null, tentNamesById: null };
  }
  return { plantNamesById, plantTentIdsById, tentNamesById };
}
