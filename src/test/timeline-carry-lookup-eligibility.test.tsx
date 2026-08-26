/**
 * `useTimelineNameDirectory` — the carry lookup's eligibility contract.
 *
 * `plantTentIdsById` is the evidence the Timeline → Sensors handoff runs on:
 * `resolveTimelineSensorHandoffIds` reads it to derive the tent a selected
 * plant belongs to, and drops the plant entirely when the lookup cannot
 * vouch for one. Nothing in `src/test/` covered that map before this file —
 * `use-timeline-name-directory.test.tsx` exercises the two NAME maps only.
 *
 * Salvaged from `claude/one-tent-b6-wire-timeline-carry`, whose own version
 * of these cases never landed while its source files did. Two of that
 * branch's five cases are deliberately NOT reproduced here, because they
 * assert behaviour this hook does not implement — see the note at the end
 * of this file rather than a silently weakened assertion.
 *
 * These assert on the RESOLVED map, never on the hook's source text, per the
 * repo's contract-test standard.
 */
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const GROW = "22222222-3333-4444-8555-666666666666";
const OTHER_GROW = "33333333-4444-4555-8666-777777777777";
const TENT = "11111111-2222-4333-8444-555555555555";
const OTHER_GROW_TENT = "44444444-5555-4666-8777-888888888888";
const USER = "99999999-aaaa-4bbb-8ccc-dddddddddddd";

const PLANT_IN_GROW = "3f7a1e2c-9b04-4d51-8a6e-2c5f70b81d93";
const PLANT_OTHER_GROW = "55555555-6666-4777-8888-999999999999";
const PLANT_LEGACY = "66666666-7777-4888-8999-aaaaaaaaaaaa";

const state = vi.hoisted(() => ({
  plants: [] as Array<Record<string, unknown>>,
  tents: [] as Array<Record<string, unknown>>,
  plantsError: null as unknown,
  tentsError: null as unknown,
  /** Every `.select(...)` argument, in call order, so the read is observable. */
  selects: [] as Array<{ table: string; columns: string }>,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from(table: string) {
      return {
        select(columns: string) {
          state.selects.push({ table, columns });
          return {
            eq: async () =>
              table === "plants"
                ? { data: state.plantsError ? null : state.plants, error: state.plantsError }
                : { data: state.tentsError ? null : state.tents, error: state.tentsError },
          };
        },
      };
    },
  },
}));

import { useTimelineNameDirectory } from "@/hooks/useTimelineNameDirectory";

function renderDirectory() {
  return renderHook(() => useTimelineNameDirectory(USER, GROW));
}

describe("useTimelineNameDirectory · carry lookup eligibility", () => {
  beforeEach(() => {
    state.selects = [];
    state.plantsError = null;
    state.tentsError = null;
    state.tents = [
      { id: TENT, name: "Tent A", grow_id: GROW },
      { id: OTHER_GROW_TENT, name: "Tent B", grow_id: OTHER_GROW },
    ];
    state.plants = [
      { id: PLANT_IN_GROW, name: "In grow", tent_id: TENT, grow_id: GROW },
      { id: PLANT_OTHER_GROW, name: "Other grow", tent_id: OTHER_GROW_TENT, grow_id: OTHER_GROW },
      // A legacy row carries no direct grow_id; its grow comes from its tent.
      { id: PLANT_LEGACY, name: "Legacy", tent_id: TENT, grow_id: null },
    ];
  });

  it("refuses to carry an owned plant that belongs to a DIFFERENT grow", async () => {
    const { result } = renderDirectory();
    await waitFor(() => expect(result.current.plantTentIdsById).not.toBeNull());

    const carry = result.current.plantTentIdsById!;
    expect(carry.get(PLANT_IN_GROW)).toBe(TENT);
    // Owned by the same account, but scoped to another grow: the handoff must
    // not pair it with a tent, or the grower is carried across grows.
    expect(carry.has(PLANT_OTHER_GROW)).toBe(false);
  });

  it("carries a legacy plant whose grow is derived from its tent", async () => {
    const { result } = renderDirectory();
    await waitFor(() => expect(result.current.plantTentIdsById).not.toBeNull());

    // No direct grow_id on the row. The tent supplies it, so the plant is
    // still carriable — dropping it would strand rows written before plants
    // carried a grow of their own.
    expect(result.current.plantTentIdsById!.get(PLANT_LEGACY)).toBe(TENT);
  });

  it("resolves the carry lookup to null — never an empty map — when the plants read fails", async () => {
    state.plantsError = { message: "read failed" };
    const { result } = renderDirectory();

    await waitFor(() => expect(result.current.tentNamesById).not.toBeNull());
    // An empty map and a failed read are opposite facts. An empty map says
    // "this account has no carriable plants", which a consumer may act on;
    // a failed read says nothing at all. Conflating them silently drops the
    // grower's plant on a transient error.
    expect(result.current.plantTentIdsById).toBeNull();
  });

  it("resolves the carry lookup to null when the TENTS read fails", async () => {
    state.tentsError = { message: "read failed" };
    const { result } = renderDirectory();

    await waitFor(() => expect(result.current.plantNamesById).not.toBeNull());
    // The carry needs both halves: without tents it cannot establish which
    // grow a tent belongs to, so neither half vouches for the other.
    expect(result.current.plantTentIdsById).toBeNull();
  });

  it("reads the columns the carry lookup resolves against", async () => {
    const { result } = renderDirectory();
    await waitFor(() => expect(result.current.plantTentIdsById).not.toBeNull());

    // Pins the read, not the source text: trimming `tent_id` or `grow_id`
    // out of the select would leave the lookup unable to scope a plant to a
    // grow, and every map-level assertion above would still be green.
    const plantsSelect = state.selects.find((entry) => entry.table === "plants");
    expect(plantsSelect).toBeDefined();
    for (const column of ["id", "tent_id", "grow_id"]) {
      expect(plantsSelect!.columns).toContain(column);
    }
    const tentsSelect = state.selects.find((entry) => entry.table === "tents");
    expect(tentsSelect).toBeDefined();
    expect(tentsSelect!.columns).toContain("grow_id");
  });
});

/*
 * NOT REPRODUCED FROM THE SOURCE BRANCH, and not silently dropped.
 *
 * Two of that branch's five cases asserted that the carry lookup excludes
 * ARCHIVED and MERGED plants, and that the read fetches the fields the
 * eligibility check judges on. This hook implements neither:
 *
 *   - `buildTimelinePlantTentLookup` filters on grow ownership only. It
 *     never inspects `is_archived` or `merged_into`.
 *   - The read is `select("id,name,tent_id,grow_id")`, so those fields are
 *     not fetched and no such filter could be applied.
 *
 * Writing either case here would fail, and bending it until it passed would
 * pin the absence as though it were the contract. It is recorded in the PR
 * instead, as an open question for the owner: `src/hooks/use-plants.ts`
 * reads `.eq("is_archived", false)`, so a destination built on it offers
 * only active plants — which is the condition under which carrying an
 * archived plant would resolve to no option.
 */
