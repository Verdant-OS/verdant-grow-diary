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

const state = vi.hoisted(() => ({
  /** Every `.select(...)` argument, in call order, so the read is observable. */
  selects: [] as Array<{ table: string; columns: string }>,
  plants: [] as Array<Record<string, unknown>>,
  plantsError: null as unknown,
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
                : { data: [{ id: TENT, name: "Tent A" }], error: null },
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
    state.plants = [
      { id: PLANT_ACTIVE, name: "Alpha", tent_id: TENT, is_archived: false, last_note: null },
      { id: PLANT_ARCHIVED, name: "Beta", tent_id: TENT, is_archived: true, last_note: null },
      {
        id: PLANT_MERGED,
        name: "Gamma",
        tent_id: TENT,
        is_archived: false,
        last_note: `Merged into ${MERGE_TARGET}`,
      },
    ];
  });

  afterEach(() => vi.clearAllMocks());

  it("reads the archive and merge fields the eligibility check needs", async () => {
    renderHook(() => useTimelineNameDirectory("user-1"));

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
  });

  it("excludes archived and merged plants from the carry lookup only", async () => {
    const { result } = renderHook(() => useTimelineNameDirectory("user-1"));

    await waitFor(() => expect(result.current.carriablePlantTentById).not.toBeNull());

    const carriable = result.current.carriablePlantTentById!;
    expect(carriable.get(PLANT_ACTIVE)).toBe(TENT);
    expect(carriable.has(PLANT_ARCHIVED)).toBe(false);
    expect(carriable.has(PLANT_MERGED)).toBe(false);
    expect(carriable.size).toBe(1);

    // The NAME map must keep them: diary history still refers to those
    // plants, and dropping them would replace a real name with a fragment.
    const names = result.current.plantNamesById!;
    expect(names.get(PLANT_ACTIVE)).toBe("Alpha");
    expect(names.get(PLANT_ARCHIVED)).toBe("Beta");
    expect(names.get(PLANT_MERGED)).toBe("Gamma");
  });

  it("resolves the carry lookup to null — never an empty map — on a failed read", async () => {
    state.plantsError = { message: "network down" };
    const { result } = renderHook(() => useTimelineNameDirectory("user-1"));

    await waitFor(() => expect(state.selects.length).toBeGreaterThan(0));
    await waitFor(() => expect(result.current.tentNamesById).not.toBeNull());

    // An empty map would read as "this plant is in no tent" and silently
    // drop a valid carry; null means "unavailable" and fails closed instead.
    expect(result.current.carriablePlantTentById).toBeNull();
    expect(result.current.plantNamesById).toBeNull();
  });

  it("clears the carry lookup when there is no signed-in user", async () => {
    const { result } = renderHook(() => useTimelineNameDirectory(null));
    await waitFor(() => expect(result.current.carriablePlantTentById).toBeNull());
    expect(state.selects).toHaveLength(0);
  });
});
