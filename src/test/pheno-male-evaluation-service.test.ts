import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * phenoMaleEvaluationService unit tests.
 *
 * The phenoDb client is mocked with a queue-driven thenable builder: every
 * awaited chain (`.limit()`, `.single()`, or the builder itself) shifts the
 * next canned `{ data, error }` off `resultQueue`, so a read-then-write flow
 * (lookup → insert/update) is exercised by queuing two results in order. Each
 * `.insert(...)` / `.update(...)` payload is captured for assertion.
 */
let resultQueue: Array<{ data: unknown; error: unknown }> = [];
const fromCalls: string[] = [];
const writes: Array<{ table: string; op: string; payload: unknown }> = [];
let currentTable = "";

function nextResult() {
  return resultQueue.length > 0 ? resultQueue.shift()! : { data: null, error: null };
}

function makeBuilder(table: string) {
  const builder: Record<string, unknown> = {};
  const passthrough = () => builder;
  builder.select = passthrough;
  builder.eq = passthrough;
  builder.is = passthrough;
  builder.in = passthrough;
  builder.order = passthrough;
  builder.limit = () => builder; // terminal-but-chainable; resolved via .then
  builder.single = () => builder;
  builder.maybeSingle = () => builder;
  builder.insert = (payload: unknown) => {
    writes.push({ table, op: "insert", payload });
    return builder;
  };
  builder.update = (payload: unknown) => {
    writes.push({ table, op: "update", payload });
    return builder;
  };
  (builder as { then: unknown }).then = (
    resolve: (value: { data: unknown; error: unknown }) => unknown,
  ) => resolve(nextResult());
  return builder;
}

let userId: string | null = "user-1";

vi.mock("@/integrations/supabase/phenoTables", () => ({
  phenoDb: {
    from: vi.fn((table: string) => {
      fromCalls.push(table);
      currentTable = table;
      return makeBuilder(table);
    }),
  },
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getUser: vi.fn(async () => ({ data: { user: userId ? { id: userId } : null } })) } },
}));

import {
  serializeRatings,
  deserializeRatings,
  saveMaleEvaluation,
  recordPollenViabilityTest,
  getMaleEvaluation,
} from "@/lib/phenoMaleEvaluationService";

beforeEach(() => {
  resultQueue = [];
  fromCalls.length = 0;
  writes.length = 0;
  currentTable = "";
  userId = "user-1";
});

describe("serializeRatings / deserializeRatings", () => {
  it("keeps only valid in-range integer scores and round-trips them", () => {
    const obj = serializeRatings([
      { key: "vigor", score: 8 },
      { key: "structure", score: 10 },
      { key: "bad_high", score: 11 }, // out of range → dropped
      { key: "bad_frac", score: 7.5 }, // non-integer → dropped
      { key: "", score: 5 }, // blank key → dropped
      { key: "missing" }, // no score → dropped
    ]);
    expect(obj).toEqual({ vigor: 8, structure: 10 });

    const back = deserializeRatings(obj);
    expect(back).toEqual([
      { key: "vigor", score: 8 },
      { key: "structure", score: 10 },
    ]);
  });

  it("deserialize is defensive against corrupt jsonb", () => {
    expect(deserializeRatings(null)).toEqual([]);
    expect(deserializeRatings(["vigor", 8])).toEqual([]);
    expect(deserializeRatings({ vigor: "eight" })).toEqual([]);
  });
});

describe("saveMaleEvaluation", () => {
  it("inserts a new card (no existing) with a serialized ratings object and null hunt", async () => {
    resultQueue = [
      { data: [], error: null }, // lookup → none
      { data: { id: "eval-new" }, error: null }, // insert → id
    ];
    const res = await saveMaleEvaluation({
      plantId: "plant-9",
      ratings: [{ key: "vigor", score: 6 }],
      strainLineage: "  Chem D x i95  ",
    });
    expect(res).toEqual({ ok: true, id: "eval-new" });
    const insert = writes.find((w) => w.op === "insert");
    expect(insert?.table).toBe("pheno_male_evaluations");
    expect(insert?.payload).toMatchObject({
      user_id: "user-1",
      hunt_id: null,
      plant_id: "plant-9",
      ratings: { vigor: 6 },
      strain_lineage: "Chem D x i95",
    });
  });

  it("updates in place when a card already exists (replace semantics)", async () => {
    resultQueue = [
      { data: [{ id: "eval-existing" }], error: null }, // lookup → found
      { data: null, error: null }, // update → ok
    ];
    const res = await saveMaleEvaluation({
      plantId: "plant-9",
      huntId: "hunt-1",
      ratings: [{ key: "vigor", score: 9 }],
    });
    expect(res).toEqual({ ok: true, id: "eval-existing" });
    const update = writes.find((w) => w.op === "update");
    expect(update?.payload).toMatchObject({ ratings: { vigor: 9 }, strain_lineage: null });
    expect(writes.some((w) => w.op === "insert")).toBe(false);
  });

  it("requires sign-in and a plant", async () => {
    userId = null;
    expect(await saveMaleEvaluation({ plantId: "p" })).toEqual({
      ok: false,
      error: "Sign in to save this evaluation.",
    });
    userId = "user-1";
    expect(await saveMaleEvaluation({ plantId: "  " })).toEqual({
      ok: false,
      error: "Choose the male you're evaluating.",
    });
  });
});

describe("recordPollenViabilityTest", () => {
  it("rejects an out-of-range germination % before touching the DB", async () => {
    const res = await recordPollenViabilityTest({ evaluationId: "eval-1", germinationPct: 140 });
    expect(res).toEqual({ ok: false, error: "Germination % must be between 0 and 100." });
    expect(writes.length).toBe(0);
  });

  it("normalizes an unknown result to untested and appends the row", async () => {
    resultQueue = [{ data: { id: "test-1" }, error: null }];
    const res = await recordPollenViabilityTest({
      evaluationId: "eval-1",
      result: "totally-bogus",
      germinationPct: 82,
    });
    expect(res).toEqual({ ok: true, id: "test-1" });
    const insert = writes.find((w) => w.op === "insert");
    expect(insert?.table).toBe("pheno_pollen_viability_tests");
    expect(insert?.payload).toMatchObject({
      evaluation_id: "eval-1",
      result: "untested",
      germination_pct: 82,
    });
  });
});

describe("getMaleEvaluation", () => {
  it("composes the card + viability tests into the pure model summary", async () => {
    resultQueue = [
      {
        data: [
          {
            id: "eval-1",
            hunt_id: null,
            plant_id: "plant-9",
            strain_lineage: "Chem D",
            ratings: { vegetative_vigor_structure: 8 },
            note: null,
          },
        ],
        error: null,
      },
      {
        // viability tests, most-recent-first (service reverses to Test1/Test2 order)
        data: [
          { id: "t2", evaluation_id: "eval-1", result: "viable", germination_pct: 90, note: null, tested_at: null, created_at: "2026-07-09T02:00:00Z" },
          { id: "t1", evaluation_id: "eval-1", result: "viable", germination_pct: 88, note: null, tested_at: null, created_at: "2026-07-09T01:00:00Z" },
        ],
        error: null,
      },
    ];

    const loaded = await getMaleEvaluation({ plantId: "plant-9", maleLabel: "Male A" });
    expect(loaded?.evaluationId).toBe("eval-1");
    expect(loaded?.summary.maleLabel).toBe("Male A");
    expect(loaded?.summary.strainLineage).toBe("Chem D");
    expect(loaded?.summary.ratedAxes.find((a) => a.key === "vegetative_vigor_structure")?.score).toBe(8);
    // two viable reads → confirmed
    expect(loaded?.summary.pollenViability.status).toBe("confirmed");
  });

  it("returns null when the grower has no card for this male", async () => {
    resultQueue = [{ data: [], error: null }];
    expect(await getMaleEvaluation({ plantId: "plant-9" })).toBeNull();
  });
});
