import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { buildTimelineNameLookup } from "@/lib/timelineEvidenceFilterRules";
import {
  buildCarriablePlantTentLookup,
  type CarriablePlantLookupStatus,
} from "@/lib/sensorRoutePlantIntentRules";

export interface TimelineNameDirectory {
  /** id → name over the owner's plants, INCLUDING archived/merged rows. Null while unavailable. */
  plantNamesById: ReadonlyMap<string, string> | null;
  /** id → name over the owner's tents, INCLUDING archived rows. Null while unavailable. */
  tentNamesById: ReadonlyMap<string, string> | null;
  /**
   * plant id → its CURRENT tent id, over the plants that are actually
   * CARRIABLE. Null while unavailable; a carriable plant with no tent maps
   * to null.
   *
   * Two filters are folded in, and both are load-bearing:
   *
   *   - Sourced from `plants.tent_id`, never from diary rows. A diary entry
   *     records the tent an entry was made in, which is history: a plant
   *     moved between tents keeps its old attribution on old entries. Any
   *     consumer asking "which tent is this plant in" must ask the plant
   *     row, because that is what downstream ownership checks validate
   *     against.
   *   - Archived and merged plants are excluded, unlike the two name maps
   *     above. `AiDoctorStart` will not offer them, so carrying one produces
   *     a selection that disappears with no explanation. The names must keep
   *     them (history still refers to those plants); the carry must not.
   */
  carriablePlantTentById: ReadonlyMap<string, string | null> | null;
  /**
   * Whether the carry lookup has settled.
   *
   * The map alone cannot say: `null` means both "still loading" and "read
   * failed", and those need opposite handling. A consumer that holds the
   * handoff on a failed read waits forever; one that proceeds on a pending
   * read drops the grower's plant. Callers must branch on this, not on
   * `carriablePlantTentById === null`.
   */
  carriablePlantTentStatus: CarriablePlantLookupStatus;
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
  const [plantNamesById, setPlantNamesById] = useState<ReadonlyMap<string, string> | null>(null);
  const [tentNamesById, setTentNamesById] = useState<ReadonlyMap<string, string> | null>(null);
  const [carriablePlantTentById, setCarriablePlantTentById] = useState<ReadonlyMap<
    string,
    string | null
  > | null>(null);
  const [carriablePlantTentStatus, setCarriablePlantTentStatus] =
    useState<CarriablePlantLookupStatus>(userId ? "pending" : "unavailable");

  useEffect(() => {
    if (!userId) {
      setPlantNamesById(null);
      setTentNamesById(null);
      setCarriablePlantTentById(null);
      // No signed-in user is terminal, not pending — nothing is in flight.
      setCarriablePlantTentStatus("unavailable");
      return;
    }
    let cancelled = false;
    setCarriablePlantTentStatus("pending");
    (async () => {
      try {
        const [plantsResult, tentsResult] = await Promise.all([
          // `is_archived` and `last_note` are read for eligibility only —
          // `isActivePlant` needs both, and the merge marker lives in the
          // note. The name maps below still keep archived/merged rows.
          supabase
            .from("plants")
            .select("id,name,tent_id,is_archived,last_note")
            .eq("user_id", userId),
          supabase.from("tents").select("id,name").eq("user_id", userId),
        ]);
        if (cancelled) return;
        setPlantNamesById(plantsResult?.error ? null : buildTimelineNameLookup(plantsResult?.data));
        setTentNamesById(tentsResult?.error ? null : buildTimelineNameLookup(tentsResult?.data));
        setCarriablePlantTentById(
          plantsResult?.error ? null : buildCarriablePlantTentLookup(plantsResult?.data),
        );
        setCarriablePlantTentStatus(plantsResult?.error ? "unavailable" : "ready");
      } catch {
        if (cancelled) return;
        setPlantNamesById(null);
        setTentNamesById(null);
        setCarriablePlantTentById(null);
        setCarriablePlantTentStatus("unavailable");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return { plantNamesById, tentNamesById, carriablePlantTentById, carriablePlantTentStatus };
}
