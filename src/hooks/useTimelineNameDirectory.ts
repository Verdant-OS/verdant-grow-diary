import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { buildTimelineNameLookup } from "@/lib/timelineEvidenceFilterRules";

export interface TimelineNameDirectory {
  /** id → name over the owner's plants, INCLUDING archived/merged rows. Null while unavailable. */
  plantNamesById: ReadonlyMap<string, string> | null;
  /** id → name over the owner's tents, INCLUDING archived rows. Null while unavailable. */
  tentNamesById: ReadonlyMap<string, string> | null;
}

/**
 * Read-only id → name directory for Timeline filter labels.
 *
 * Deliberately omits the `is_archived = false` filter the active-entity
 * hooks use: diary history keeps referencing plants/tents after they are
 * archived or merged away, and those rows still carry their names. RLS
 * scopes both reads to the signed-in owner. A failed or unavailable read
 * resolves to `null` (never an empty map), so the presenter falls back to
 * the neutral fragment label instead of mislabeling entities as archived.
 */
export function useTimelineNameDirectory(userId: string | null): TimelineNameDirectory {
  const [plantNamesById, setPlantNamesById] = useState<ReadonlyMap<string, string> | null>(null);
  const [tentNamesById, setTentNamesById] = useState<ReadonlyMap<string, string> | null>(null);

  useEffect(() => {
    if (!userId) {
      setPlantNamesById(null);
      setTentNamesById(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [plantsResult, tentsResult] = await Promise.all([
          supabase.from("plants").select("id,name"),
          supabase.from("tents").select("id,name"),
        ]);
        if (cancelled) return;
        setPlantNamesById(plantsResult?.error ? null : buildTimelineNameLookup(plantsResult?.data));
        setTentNamesById(tentsResult?.error ? null : buildTimelineNameLookup(tentsResult?.data));
      } catch {
        if (cancelled) return;
        setPlantNamesById(null);
        setTentNamesById(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return { plantNamesById, tentNamesById };
}
