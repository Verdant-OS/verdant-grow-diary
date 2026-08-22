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
  carriablePlantTentById: ReadonlyMap<string, string> | null;
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

interface DirectorySnapshot {
  key: string;
  plantNamesById: ReadonlyMap<string, string> | null;
  tentNamesById: ReadonlyMap<string, string> | null;
  carriablePlantTentById: ReadonlyMap<string, string> | null;
}

/** Identity of the read a snapshot belongs to. Compared during render. */
function directoryKey(userId: string | null, activeGrowId: string | null): string {
  return `${userId ?? ""}\u0000${activeGrowId ?? ""}`;
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
export function useTimelineNameDirectory(
  userId: string | null,
  activeGrowId: string | null,
): TimelineNameDirectory {
  // One keyed snapshot rather than four independent pieces of state.
  //
  // Raised in review: `pending` was set INSIDE the effect, so the render that
  // first saw a new `activeGrowId` — a Back/Forward between two filtered grow
  // URLs, say — still published the PREVIOUS grow's map with status "ready".
  // Timeline would then render an enabled, tent-only CTA for one render and
  // lose the plant if clicked, because the new plant is absent from the stale
  // map. React runs effects after paint, so no effect-based fix closes that
  // window; the key has to be compared during render.
  const [snapshot, setSnapshot] = useState<DirectorySnapshot | null>(null);

  const key = directoryKey(userId, activeGrowId);
  const fresh = snapshot?.key === key;

  useEffect(() => {
    if (!userId || !activeGrowId) {
      setSnapshot({ key, plantNamesById: null, tentNamesById: null, carriablePlantTentById: null });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [plantsResult, tentsResult] = await Promise.all([
          // `is_archived`, `last_note` and `grow_id` are read for carry
          // ELIGIBILITY only — `isActivePlant` needs the first two (the merge
          // marker lives in the note) and the third scopes the carry to this
          // page's grow. The read itself stays account-wide, because the name
          // maps below must keep archived, merged, and other-grow rows.
          supabase
            .from("plants")
            .select("id,name,tent_id,grow_id,is_archived,last_note")
            .eq("user_id", userId),
          // `grow_id` resolves the EFFECTIVE grow of a plant whose own column
          // is null but whose tent belongs to this grow; `is_archived` keeps
          // archived tents out of the CARRY (Sensors never sees them) while
          // the name map below still keeps them for history labels.
          supabase.from("tents").select("id,name,grow_id,is_archived").eq("user_id", userId),
        ]);
        if (cancelled) return;
        setSnapshot({
          key,
          plantNamesById: plantsResult?.error ? null : buildTimelineNameLookup(plantsResult?.data),
          tentNamesById: tentsResult?.error ? null : buildTimelineNameLookup(tentsResult?.data),
          // BOTH reads are required to verify a carry: plants supply the
          // candidates, tents prove the tent is live and can resolve a legacy
          // plant's effective grow. A failed tents read used to degrade to an
          // empty tent list, which produced an EMPTY map — and an empty map
          // is not null, so the status below called it "ready" and Timeline
          // enabled the handoff with the plant silently removed. That is
          // "verification failed" wearing the costume of "nothing to carry".
          // The two NAME maps still degrade independently: a lost label is
          // cosmetic, a lost verification is not.
          carriablePlantTentById:
            plantsResult?.error || tentsResult?.error
              ? null
              : buildCarriablePlantTentLookup(plantsResult?.data, {
                  growId: activeGrowId,
                  tents: tentsResult?.data ?? [],
                }),
        });
      } catch {
        if (cancelled) return;
        setSnapshot({
          key,
          plantNamesById: null,
          tentNamesById: null,
          carriablePlantTentById: null,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key, userId, activeGrowId]);

  // A snapshot for a DIFFERENT key is not stale data to show — it is another
  // grow's. Publish nothing until this key's read lands.
  if (!fresh) {
    return {
      plantNamesById: null,
      tentNamesById: null,
      carriablePlantTentById: null,
      carriablePlantTentStatus: userId && activeGrowId ? "pending" : "unavailable",
    };
  }

  return {
    plantNamesById: snapshot.plantNamesById,
    tentNamesById: snapshot.tentNamesById,
    carriablePlantTentById: snapshot.carriablePlantTentById,
    // A settled read whose plant half failed is terminal, not pending.
    carriablePlantTentStatus: snapshot.carriablePlantTentById ? "ready" : "unavailable",
  };
}
