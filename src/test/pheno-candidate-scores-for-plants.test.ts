import { beforeEach, describe, expect, it, vi } from "vitest";

let result: { data: unknown[] | null; error: unknown } = { data: [], error: null };
const inCalls: Array<[string, string[]]> = [];

function makeBuilder() {
  const builder: Record<string, unknown> = {};
  builder.select = () => builder;
  builder.in = (column: string, values: string[]) => {
    inCalls.push([column, values]);
    return builder;
  };
  builder.order = () => builder;
  (builder as { then: unknown }).then = (
    resolve: (value: { data: unknown[] | null; error: unknown }) => unknown,
  ) => resolve(result);
  return builder;
}

vi.mock("@/integrations/supabase/phenoTables", () => ({
  phenoDb: { from: vi.fn(() => makeBuilder()) },
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getUser: vi.fn() } },
}));

import { listCandidateScoresForPlants } from "@/lib/phenoCandidateScoresService";

beforeEach(() => {
  result = { data: [], error: null };
  inCalls.length = 0;
});

describe("listCandidateScoresForPlants", () => {
  it("loads bounded plant and hunt ids, deduplicates refs, and keeps exact current pairs", async () => {
    result = {
      data: [
        {
          plant_id: "plant-1",
          hunt_id: "hunt-current",
          traits: { vigor: 4 },
          note: "current",
          updated_at: "2026-07-30T12:00:00.000Z",
        },
        {
          plant_id: "plant-1",
          hunt_id: "hunt-old",
          traits: { vigor: 1 },
          note: "stale",
          updated_at: "2026-07-30T13:00:00.000Z",
        },
        {
          plant_id: "not-requested",
          hunt_id: "hunt-current",
          traits: { vigor: 5 },
          note: "cross product row",
          updated_at: "2026-07-30T14:00:00.000Z",
        },
      ],
      error: null,
    };

    await expect(
      listCandidateScoresForPlants([
        { plantId: "plant-1", huntId: "hunt-current" },
        { plantId: "plant-1", huntId: "hunt-current" },
      ]),
    ).resolves.toEqual({
      "plant-1": {
        plantId: "plant-1",
        huntId: "hunt-current",
        traits: { vigor: 4 },
        note: "current",
        updatedAt: "2026-07-30T12:00:00.000Z",
      },
    });
    expect(inCalls).toEqual([
      ["plant_id", ["plant-1"]],
      ["hunt_id", ["hunt-current"]],
    ]);
  });

  it("returns an empty map without querying for blank refs", async () => {
    await expect(
      listCandidateScoresForPlants([
        { plantId: "", huntId: "hunt-1" },
        { plantId: "plant-1", huntId: " " },
      ]),
    ).resolves.toEqual({});
    expect(inCalls).toEqual([]);
  });

  it("throws the typed fail-closed read error", async () => {
    result = { data: null, error: { code: "42501" } };
    await expect(
      listCandidateScoresForPlants([{ plantId: "plant-1", huntId: "hunt-1" }]),
    ).rejects.toMatchObject({
      name: "PhenoEvidenceReadError",
      source: "candidate_scores",
    });
  });
});
