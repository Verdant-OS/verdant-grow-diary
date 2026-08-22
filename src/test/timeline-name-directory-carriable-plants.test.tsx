/**
 * `useTimelineNameDirectory` — the carry lookup's eligibility contract.
 *
 * Raised in review of the B6 handoff: the directory deliberately includes
 * archived and merged plants so diary history keeps its labels, and the
 * carry lookup was being built from those same rows. `AiDoctorStart` offers
 * only active plants, so a carried archived plant matched no option and
 * vanished with no message — the silent drop this handoff exists to prevent.
 *
 * The fix has two halves that must stay together, and this file pins both:
 * the read fetches the fields `isActivePlant` judges on, and the lookup
 * excludes what they disqualify. Trimming the select back to
 * `id,name,tent_id` would leave `is_archived`/`last_note` undefined, so
 * `isActivePlant` would answer "active" for every row and the defect would
 * return with every assertion still green.
 *
 * These assert on the RESOLVED call and the RESOLVED maps — never on the
 * hook's source text — per the repo's contract-test standard.
 */
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const PLANT_ACTIVE = "3f7a1e2c-9b04-4d51-8a6e-2c5f70b81d93";
const PLANT_ARCHIVED = "aaaaaaaa-1111-4111-8111-111111111111";
const PLANT_MERGED = "cccccccc-3333-4333-8333-333333333333";
const MERGE_TARGET = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const TENT = "11111111-2222-4333-8444-555555555555";
const GROW = "22222222-3333-4444-8555-666666666666";
const OTHER_GROW = "33333333-4444-4555-8666-777777777777";
const OTHER_GROW_TENT = "44444444-5555-4666-8777-888888888888";
const OTHER_GROW_PLANT = "55555555-6666-4777-8888-999999999999";
const LEGACY_PLANT = "66666666-7777-4888-8999-aaaaaaaaaaaa";
const ARCHIVED_TENT = "77777777-8888-4999-8aaa-bbbbbbbbbbbb";
const ARCHIVED_TENT_PLANT = "88888888-9999-4aaa-8bbb-cccccccccccc";

const state = vi.hoisted(() => ({
  /** Every `.select(...)` argument, in call order, so the read is observable. */
  selects: [] as Array<{ table: string; columns: string }>,
  plants: [] as Array<Record<string, unknown>>,
  plantsError: null as unknown,
  tentsError: null as unknown,
}));

/**
 * The mock PROJECTS rows through the requested column list, the way
 * PostgREST does. Returning the full fixture regardless of `.select(...)`
 * would let the two halves of this contract drift apart silently: trimming
 * the select would break production while every assertion here stayed green,
 * because the fixture would keep handing `isActivePlant` fields the real
 * query never asked for.
 */
function project(row: Record<string, unknown>, columns: string): Record<string, unknown> {
  const wanted = columns.split(",").map((c) => c.trim());
  return Object.fromEntries(Object.entries(row).filter(([key]) => wanted.includes(key)));
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from(table: string) {
      return {
        select(columns: string) {
          state.selects.push({ table, columns });
          return {
            eq: async () =>
              table === "plants"
                ? {
                    data: state.plants.map((row) => project(row, columns)),
                    error: state.plantsError,
                  }
                : state.tentsError
                  ? { data: null, error: state.tentsError }
                  : {
                      data: [
                        { id: TENT, name: "Tent A", grow_id: GROW, is_archived: false },
                        {
                          id: OTHER_GROW_TENT,
                          name: "Tent B",
                          grow_id: OTHER_GROW,
                          is_archived: false,
                        },
                        { id: ARCHIVED_TENT, name: "Tent C", grow_id: GROW, is_archived: true },
                      ].map((row) => project(row, columns)),
                      error: null,
                    },
          };
        },
      };
    },
  },
}));

import { useTimelineNameDirectory } from "@/hooks/useTimelineNameDirectory";

describe("useTimelineNameDirectory · carriable plant lookup", () => {
  beforeEach(() => {
    state.selects = [];
    state.plantsError = null;
    state.tentsError = null;
    state.plants = [
      {
        id: PLANT_ACTIVE,
        name: "Alpha",
        tent_id: TENT,
        grow_id: GROW,
        is_archived: false,
        last_note: null,
      },
      {
        id: PLANT_ARCHIVED,
        name: "Beta",
        tent_id: TENT,
        grow_id: GROW,
        is_archived: true,
        last_note: null,
      },
      {
        id: PLANT_MERGED,
        name: "Gamma",
        tent_id: TENT,
        grow_id: GROW,
        is_archived: false,
        last_note: `Merged into ${MERGE_TARGET}`,
      },
      // A LEGACY plant: no `grow_id` of its own, but its tent is in this
      // grow. The repo supports this shape (growRepo BUG-A), and the Doctor
      // still offers it, so the carry must not drop it.
      {
        id: LEGACY_PLANT,
        name: "Epsilon",
        tent_id: TENT,
        grow_id: null,
        is_archived: false,
        last_note: null,
      },
      // An ACTIVE plant in an ARCHIVED tent. Sensors never sees that tent
      // (`fetchTents` filters it out), so carrying it would relocate the
      // grower to a different live tent and then lose the plant.
      {
        id: ARCHIVED_TENT_PLANT,
        name: "Zeta",
        tent_id: ARCHIVED_TENT,
        grow_id: GROW,
        is_archived: false,
        last_note: null,
      },
      // An ACTIVE plant the account owns, in a DIFFERENT grow. Reachable
      // from a bookmarked URL pairing this grow with that plant.
      {
        id: OTHER_GROW_PLANT,
        name: "Delta",
        tent_id: OTHER_GROW_TENT,
        grow_id: OTHER_GROW,
        is_archived: false,
        last_note: null,
      },
    ];
  });

  afterEach(() => vi.clearAllMocks());

  it("reads the archive and merge fields the eligibility check needs", async () => {
    renderHook(() => useTimelineNameDirectory("user-1", GROW));

    await waitFor(() => expect(state.selects.some((c) => c.table === "plants")).toBe(true));
    const plantsSelect = state.selects.find((c) => c.table === "plants");
    const columns = (plantsSelect?.columns ?? "").split(",").map((c) => c.trim());

    // `isActivePlant` reads both. Either one absent and every row reads as
    // active, which is the silent-regression shape this pin exists for.
    expect(columns).toContain("is_archived");
    expect(columns).toContain("last_note");
    // Still everything the name and tent maps need.
    expect(columns).toContain("id");
    expect(columns).toContain("name");
    expect(columns).toContain("tent_id");
    // Scopes the carry to this page's grow. Absent, an owned plant from
    // another grow is admitted and the handoff relocates the grower.
    expect(columns).toContain("grow_id");

    // The TENTS read must also carry grow_id — it is what resolves the
    // effective grow of a legacy plant whose own column is null.
    const tentsSelect = state.selects.find((c) => c.table === "tents");
    const tentColumns = (tentsSelect?.columns ?? "").split(",").map((c) => c.trim());
    expect(tentColumns).toContain("grow_id");
    // Keeps archived tents out of the CARRY. Sensors' own tent read filters
    // them, so a carried archived tent silently relocates the grower.
    expect(tentColumns).toContain("is_archived");
  });

  it("excludes archived and merged plants from the carry lookup only", async () => {
    const { result } = renderHook(() => useTimelineNameDirectory("user-1", GROW));

    await waitFor(() => expect(result.current.carriablePlantTentById).not.toBeNull());

    const carriable = result.current.carriablePlantTentById!;
    expect(carriable.get(PLANT_ACTIVE)).toBe(TENT);
    expect(carriable.has(PLANT_ARCHIVED)).toBe(false);
    expect(carriable.has(PLANT_MERGED)).toBe(false);
    // Alpha (own grow) and Epsilon (grow via its tent) — both carriable.
    // Zeta is excluded: active plant, right grow, but an ARCHIVED tent.
    expect(carriable.has(ARCHIVED_TENT_PLANT)).toBe(false);
    expect(carriable.size).toBe(2);

    // The NAME map must keep them: diary history still refers to those
    // plants, and dropping them would replace a real name with a fragment.
    const names = result.current.plantNamesById!;
    expect(names.get(PLANT_ACTIVE)).toBe("Alpha");
    expect(names.get(PLANT_ARCHIVED)).toBe("Beta");
    expect(names.get(PLANT_MERGED)).toBe("Gamma");
    // The other-grow plant keeps its name too — history can reference it.
    expect(names.get(OTHER_GROW_PLANT)).toBe("Delta");
    expect(names.get(ARCHIVED_TENT_PLANT)).toBe("Zeta");
    // Tent names keep archived tents too — history labels need them.
    expect(result.current.tentNamesById!.get(ARCHIVED_TENT)).toBe("Tent C");
  });

  it("refuses to carry an owned plant from a DIFFERENT grow", async () => {
    // Reachable from a bookmarked URL pairing this grow's `growId` with
    // another grow's `plantId`. The carry would derive the other grow's
    // tent, and `Sensors.tsx:211` derives its grow FROM the selected tent —
    // so the grower would silently leave the grow they were reading. That
    // is worse than a dropped selection: it moves them.
    const { result } = renderHook(() => useTimelineNameDirectory("user-1", GROW));

    await waitFor(() => expect(result.current.carriablePlantTentById).not.toBeNull());

    expect(result.current.carriablePlantTentById!.has(OTHER_GROW_PLANT)).toBe(false);
    // The in-grow plant is unaffected, so this is scope and not a blanket ban.
    expect(result.current.carriablePlantTentById!.get(PLANT_ACTIVE)).toBe(TENT);
  });

  it("carries a legacy plant whose grow comes from its tent, end to end", async () => {
    // The hook half of the BUG-A case: proves the tents read, the grow_id
    // column, and the effective-grow resolution are actually wired together,
    // not just correct in the pure module.
    const { result } = renderHook(() => useTimelineNameDirectory("user-1", GROW));

    await waitFor(() => expect(result.current.carriablePlantTentById).not.toBeNull());
    expect(result.current.carriablePlantTentById!.get(LEGACY_PLANT)).toBe(TENT);
  });

  it("resolves the carry lookup to null — never an empty map — on a failed read", async () => {
    state.plantsError = { message: "network down" };
    const { result } = renderHook(() => useTimelineNameDirectory("user-1", GROW));

    await waitFor(() => expect(state.selects.length).toBeGreaterThan(0));
    await waitFor(() => expect(result.current.tentNamesById).not.toBeNull());

    // An empty map would read as "this plant is in no tent" and silently
    // drop a valid carry; null means "unavailable" and fails closed instead.
    expect(result.current.carriablePlantTentById).toBeNull();
    expect(result.current.plantNamesById).toBeNull();
  });

  it("names pending and ready as distinct states, not both as a null map", async () => {
    // Raised in review: `null` meant BOTH "still loading" and "read failed",
    // and they need opposite handling — a consumer that holds on a failed
    // read waits forever; one that proceeds while pending drops the plant.
    const { result } = renderHook(() => useTimelineNameDirectory("user-1", GROW));

    // Before the read resolves the map is null AND the status says why.
    expect(result.current.carriablePlantTentById).toBeNull();
    expect(result.current.carriablePlantTentStatus).toBe("pending");

    await waitFor(() => expect(result.current.carriablePlantTentStatus).toBe("ready"));
    expect(result.current.carriablePlantTentById).not.toBeNull();
  });

  it("reports a failed TENTS read as unavailable, not an empty ready carry", async () => {
    // Raised in review. Both reads are required to verify a carry: plants
    // supply the candidates, tents prove the tent is live and resolve a
    // legacy plant's effective grow. Degrading to an empty tent list built
    // an EMPTY map — and an empty map is not null, so the status said
    // "ready" and Timeline enabled the handoff with the plant silently
    // removed. Verification failed must not present as nothing-to-carry.
    state.tentsError = { message: "tents read failed" };
    const { result } = renderHook(() => useTimelineNameDirectory("user-1", GROW));

    await waitFor(() => expect(result.current.carriablePlantTentStatus).toBe("unavailable"));
    expect(result.current.carriablePlantTentById).toBeNull();

    // Plant NAMES survive: a lost label is cosmetic, a lost verification is
    // not, so the two degrade independently.
    expect(result.current.plantNamesById!.get(PLANT_ACTIVE)).toBe("Alpha");
    expect(result.current.tentNamesById).toBeNull();
  });

  it("reports a failed read as unavailable, never as pending", async () => {
    state.plantsError = { message: "network down" };
    const { result } = renderHook(() => useTimelineNameDirectory("user-1", GROW));

    await waitFor(() => expect(result.current.carriablePlantTentStatus).toBe("unavailable"));
    // Terminal: the map is null and stays null, so a consumer must proceed
    // tent-only rather than wait for a resolution that is not coming.
    expect(result.current.carriablePlantTentById).toBeNull();
  });

  it("reports a signed-out session as unavailable, since nothing is in flight", async () => {
    const { result } = renderHook(() => useTimelineNameDirectory(null, GROW));
    expect(result.current.carriablePlantTentStatus).toBe("unavailable");
    await waitFor(() => expect(result.current.carriablePlantTentById).toBeNull());
  });

  it("never publishes the PREVIOUS grow's map when the grow changes", async () => {
    // Raised in review: `pending` was set inside the effect, so the first
    // render for a new activeGrowId still published the old grow's map as
    // "ready" — Timeline would show an enabled tent-only CTA for one render
    // and lose the plant if clicked. React runs effects after paint, so the
    // key must be compared during render, not repaired afterwards.
    const { result, rerender } = renderHook(
      ({ growId }: { growId: string }) => useTimelineNameDirectory("user-1", growId),
      { initialProps: { growId: GROW } },
    );

    await waitFor(() => expect(result.current.carriablePlantTentStatus).toBe("ready"));
    expect(result.current.carriablePlantTentById!.get(PLANT_ACTIVE)).toBe(TENT);

    // Simulates Back/Forward between two filtered grow URLs on a MOUNTED
    // Timeline. The very next render must not carry the old grow forward.
    rerender({ growId: OTHER_GROW });

    expect(result.current.carriablePlantTentStatus).toBe("pending");
    expect(result.current.carriablePlantTentById).toBeNull();
    // Names are keyed too — showing another grow's plant names would be a
    // quieter version of the same bug.
    expect(result.current.plantNamesById).toBeNull();
  });

  it("clears the carry lookup when there is no signed-in user", async () => {
    const { result } = renderHook(() => useTimelineNameDirectory(null, GROW));
    await waitFor(() => expect(result.current.carriablePlantTentById).toBeNull());
    expect(state.selects).toHaveLength(0);
  });
});
