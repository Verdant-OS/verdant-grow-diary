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

/** Rows per directory page. Paged reads are compared against an exact count. */
const DIRECTORY_PAGE_SIZE = 1000;

/**
 * Hard stop on the page loop. A runaway would hang Timeline's directory, and
 * hitting it leaves `complete: false`, so the carry fails closed rather than
 * silently serving a partial account.
 */
const DIRECTORY_MAX_PAGES = 25;

interface DirectoryRead<T> {
  rows: T[] | null;
  /** Whether every row the account holds was actually retrieved. */
  complete: boolean;
}

/** One page of an owner-scoped read, as the Supabase builder returns it. */
type DirectoryPageQuery<T> = (
  from: number,
  to: number,
) => PromiseLike<{ data: T[] | null; error: unknown; count: number | null }>;

/**
 * Read one owner-scoped table in full.
 *
 * PostgREST caps rows server-side and still reports success, so a single
 * unpaged read hands back a SUBSET presented as the whole account. An earlier
 * revision only DETECTED that and dropped the carry — which review correctly
 * showed is the same silent plant loss for the grower, just arrived at more
 * politely. So the rows are actually fetched.
 *
 * Two independent things must both hold, and an earlier revision of this
 * function got the first right while quietly assuming the second:
 *
 *   1. STOPPING is proven against the exact `count`, never against the page
 *      size. "This page came back short" would assume the server's cap is at
 *      least `DIRECTORY_PAGE_SIZE`.
 *   2. ADVANCING moves by the rows the server ACTUALLY returned, never by the
 *      window that was requested — the same assumption, one line further on.
 *      With a server cap of 500, requesting `0..999` yields rows 0-499; a
 *      next window of `1000..1999` skips 500-999 forever. The count check
 *      then reports the read incomplete and the carry is refused, so the
 *      grower loses the plant on every traversal.
 *
 * Rows are ordered by `id` before ranging. Without a deterministic order the
 * ranges are not a stable partition at all: a planner-order change or a
 * concurrent write can hand back one row twice and skip another while the
 * total still satisfies the completeness check. `id` is unique, so it is a
 * total order with no tie-break needed — see AGENTS.md on stable sorting.
 *
 * Takes a query builder rather than a table name so each call site keeps its
 * literal table and its generated row types.
 */
async function readAllPages<T>(query: DirectoryPageQuery<T>): Promise<DirectoryRead<T>> {
  const rows: T[] = [];
  let total: number | null = null;

  let from = 0;
  for (let page = 0; page < DIRECTORY_MAX_PAGES; page += 1) {
    const result = await query(from, from + DIRECTORY_PAGE_SIZE - 1);

    if (result?.error) return { rows: null, complete: false };

    const batch = result?.data ?? [];
    rows.push(...batch);
    if (typeof result?.count === "number") total = result.count;

    if (batch.length === 0) break;
    // By what came back, NOT by what was asked for. See (2) above.
    from += batch.length;
    if (total !== null && rows.length >= total) break;
  }

  // A missing count cannot prove or disprove completeness. Treated as
  // complete to match the pre-existing behaviour of these reads rather than
  // disabling the carry for every account on a server that omits it.
  return { rows, complete: total === null || rows.length >= total };
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
          readAllPages((from, to) =>
            supabase
              .from("plants")
              .select("id,name,tent_id,grow_id,is_archived,last_note", { count: "exact" })
              .eq("user_id", userId)
              .order("id", { ascending: true })
              .range(from, to),
          ),
          // `grow_id` resolves the EFFECTIVE grow of a plant whose own column
          // is null but whose tent belongs to this grow; `is_archived` keeps
          // archived tents out of the CARRY (Sensors never sees them) while
          // the name map below still keeps them for history labels.
          readAllPages((from, to) =>
            supabase
              .from("tents")
              .select("id,name,grow_id,is_archived", { count: "exact" })
              .eq("user_id", userId)
              .order("id", { ascending: true })
              .range(from, to),
          ),
        ]);
        if (cancelled) return;
        setSnapshot({
          key,
          plantNamesById: buildTimelineNameLookup(plantsResult.rows ?? undefined),
          tentNamesById: buildTimelineNameLookup(tentsResult.rows ?? undefined),
          // BOTH reads are required to verify a carry: plants supply the
          // candidates, tents prove the tent is live and can resolve a legacy
          // plant's effective grow. Either one failing or coming back
          // incomplete means verification did not happen — which is not the
          // same as "nothing to carry", and must not be reported as ready.
          // The two NAME maps degrade independently on whatever arrived: a
          // lost label is cosmetic, a lost verification is not.
          carriablePlantTentById:
            !plantsResult.rows ||
            !tentsResult.rows ||
            !plantsResult.complete ||
            !tentsResult.complete
              ? null
              : buildCarriablePlantTentLookup(plantsResult.rows, {
                  growId: activeGrowId,
                  tents: tentsResult.rows,
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
