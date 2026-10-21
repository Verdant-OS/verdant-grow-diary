import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/phenoTables", () => ({ phenoDb: {} }));

import {
  PHENO_HUNT_ADD_CANDIDATES_COPY,
  canOfferAddToPhenoHunt,
  orderPickedPhenoPlantIds,
  phenoCandidateLabelForNumber,
  phenoCandidateOrdinalBaseline,
  phenoHuntAddChangedHunt,
  planNextPhenoCandidateNumbers,
  selectEligiblePhenoHuntPlants,
  type PhenoHuntAddCandidatePlant,
} from "@/lib/phenoHuntAddCandidatesRules";
import {
  addPhenoHuntCandidates,
  listPhenoHuntGrowPlants,
} from "@/lib/phenoHuntAddCandidatesService";
import { defaultCandidateLabel } from "@/lib/phenoHuntService";

const HUNT = { id: "hunt-1", grow_id: "grow-A" };

function plant(over: Partial<PhenoHuntAddCandidatePlant> & { id: string }) {
  return { name: over.id, grow_id: "grow-A", pheno_hunt_id: null, is_archived: false, ...over };
}

describe("phenoHuntAddCandidatesRules", () => {
  const plants = [
    plant({ id: "p-z", name: "Zeta" }),
    plant({ id: "p-other", name: "Other grow", grow_id: "grow-B" }),
    plant({ id: "p-tagged", name: "Tagged", pheno_hunt_id: "hunt-1" }),
    plant({ id: "p-other-hunt", name: "Other hunt", pheno_hunt_id: "hunt-9" }),
    plant({ id: "p-arch", name: "Archived", is_archived: true }),
    plant({ id: "p-b2", name: "beta" }),
    plant({ id: "p-b1", name: "Beta" }),
  ];

  it("keeps only same-grow, unarchived, untagged plants in a stable order", () => {
    const ids = selectEligiblePhenoHuntPlants(plants, HUNT).map((p) => p.id);
    expect(ids).toEqual(["p-b1", "p-b2", "p-z"]);
    expect(selectEligiblePhenoHuntPlants([...plants].reverse(), HUNT).map((p) => p.id)).toEqual(
      ids,
    );
  });

  it("returns nothing for null/invalid inputs or a hunt without a grow", () => {
    expect(selectEligiblePhenoHuntPlants(null, HUNT)).toEqual([]);
    expect(selectEligiblePhenoHuntPlants(plants, null)).toEqual([]);
    expect(selectEligiblePhenoHuntPlants(plants, { grow_id: null })).toEqual([]);
  });

  it("numbers after the current max: 16 candidates -> 17, 18", () => {
    const existing = Array.from({ length: 16 }, (_, i) => i + 1);
    expect(planNextPhenoCandidateNumbers(existing, 2)).toEqual([17, 18]);
    expect(planNextPhenoCandidateNumbers([3, null, 9, undefined], 1)).toEqual([10]);
    expect(planNextPhenoCandidateNumbers(null, 2)).toEqual([1, 2]);
    expect(planNextPhenoCandidateNumbers(existing, 0)).toEqual([]);
  });

  it("counts setup's unnumbered #1..#16 labels in the ordinal baseline", () => {
    const setup = Array.from({ length: 16 }, (_, i) => ({
      candidate_number: null,
      candidate_label: defaultCandidateLabel(i),
    }));
    expect(phenoCandidateOrdinalBaseline(setup)).toBe(16);
    expect(
      phenoCandidateOrdinalBaseline([
        { candidate_number: null, candidate_label: "Keeper A" },
        { candidate_number: null, candidate_label: "Keeper B" },
      ]),
    ).toBe(2);
    expect(
      phenoCandidateOrdinalBaseline([
        { candidate_number: 3, candidate_label: "#3" },
        { candidate_number: null, candidate_label: " #12 " },
      ]),
    ).toBe(12);
    expect(phenoCandidateOrdinalBaseline([{ candidate_number: 30, candidate_label: null }])).toBe(
      30,
    );
    expect(phenoCandidateOrdinalBaseline(null)).toBe(0);
    expect(phenoCandidateOrdinalBaseline([])).toBe(0);
  });

  it("treats a partial failure as a change to the hunt", () => {
    expect(phenoHuntAddChangedHunt({ added: [], failed: [{ reason: "network" }] })).toBe(false);
    expect(
      phenoHuntAddChangedHunt({ added: [], failed: [{ reason: "cleanup_unconfirmed" }] }),
    ).toBe(true);
    expect(phenoHuntAddChangedHunt({ added: [], failed: [{ reason: "relabel_failed" }] })).toBe(
      true,
    );
    expect(phenoHuntAddChangedHunt({ added: [{}], failed: [] })).toBe(true);
  });

  it("labels added candidates the way setup labels them by position", () => {
    expect(phenoCandidateLabelForNumber(17)).toBe("#17");
    expect(phenoCandidateLabelForNumber(17)).toBe(defaultCandidateLabel(16));
  });

  it("orders picks by the eligible list, dropping duplicates and ineligible ids", () => {
    const eligible = selectEligiblePhenoHuntPlants(plants, HUNT);
    expect(orderPickedPhenoPlantIds(["p-z", "p-other", "p-b1", "p-z"], eligible)).toEqual([
      "p-b1",
      "p-z",
    ]);
    expect(orderPickedPhenoPlantIds(null, eligible)).toEqual([]);
  });

  it("offers the plant-page button only for an eligible plant of the hunt's grow", () => {
    expect(canOfferAddToPhenoHunt(plant({ id: "p1" }), HUNT)).toBe(true);
    expect(canOfferAddToPhenoHunt(plant({ id: "p1", pheno_hunt_id: "hunt-1" }), HUNT)).toBe(false);
    expect(canOfferAddToPhenoHunt(plant({ id: "p1", grow_id: "grow-B" }), HUNT)).toBe(false);
    expect(canOfferAddToPhenoHunt(plant({ id: "p1" }), null)).toBe(false);
  });
});

type Op = [string, ...unknown[]];
interface Call {
  table: string;
  ops: Op[];
}

/** Chainable fake Supabase client: records every call; `respond` decides results. */
function fakeClient(respond: (call: Call) => { data: unknown; error: unknown }) {
  const calls: Call[] = [];
  const client = {
    from(table: string) {
      const call: Call = { table, ops: [] };
      calls.push(call);
      const builder: Record<string, unknown> = {};
      for (const name of ["select", "update", "eq", "is", "not", "order", "limit", "range"]) {
        builder[name] = (...args: unknown[]) => {
          call.ops.push([name, ...args]);
          return builder;
        };
      }
      builder.maybeSingle = () => Promise.resolve(respond(call));
      builder.then = (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) =>
        Promise.resolve(respond(call)).then(ok, ko);
      return builder;
    },
  };
  return { client: client as never, calls };
}

const has = (call: Call, ...op: Op) =>
  call.ops.some((o) => JSON.stringify(o) === JSON.stringify(op));
const updateOf = (call: Call) =>
  call.ops.find((o) => o[0] === "update")?.[1] as Record<string, unknown> | undefined;

type Result = { data: unknown; error: unknown };
/** Candidates numbered 1..n with matching labels (the shape after numbering). */
const numbered = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ candidate_number: i + 1, candidate_label: `#${i + 1}` }));

function huntDb(opts: {
  max: number[];
  candidates?: { candidate_number: number | null; candidate_label: string | null }[];
  tagOk?: (plantId: string) => boolean;
  untag?: () => Result;
  relabel?: () => Result;
}) {
  let maxIdx = 0;
  return fakeClient((call) => {
    if (call.table === "pheno_hunts") return { data: HUNT, error: null };
    const upd = updateOf(call);
    const id = call.ops.find((o) => o[0] === "eq" && o[1] === "id")?.[2] as string;
    if (!upd) {
      if (opts.candidates) return { data: opts.candidates, error: null };
      return { data: numbered(opts.max[Math.min(maxIdx++, opts.max.length - 1)]), error: null };
    }
    if ("pheno_hunt_id" in upd && upd.pheno_hunt_id === "hunt-1") {
      return { data: (opts.tagOk ?? (() => true))(id) ? { id } : null, error: null };
    }
    if ("pheno_hunt_id" in upd && upd.pheno_hunt_id === null) {
      return opts.untag ? opts.untag() : { data: { id }, error: null };
    }
    if ("candidate_label" in upd) {
      return opts.relabel ? opts.relabel() : { data: { id }, error: null };
    }
    return { data: null, error: null };
  });
}

describe("addPhenoHuntCandidates", () => {
  it("tags conditionally, numbers 17 and 18, and never writes existing candidates", async () => {
    const { client, calls } = huntDb({ max: [16] });
    const assignNumber = vi.fn(async ({ candidateNumber }: { candidateNumber: number }) => ({
      ok: true as const,
      candidateNumber,
    }));
    const result = await addPhenoHuntCandidates(
      { huntId: "hunt-1", plantIds: ["p1", "p2"] },
      { client, assignNumber },
    );
    expect(result.failed).toEqual([]);
    expect(result.added).toEqual([
      { plantId: "p1", candidateNumber: 17, candidateLabel: "#17" },
      { plantId: "p2", candidateNumber: 18, candidateLabel: "#18" },
    ]);
    const tags = calls.filter((c) => updateOf(c)?.pheno_hunt_id === "hunt-1");
    expect(tags).toHaveLength(2);
    for (const tag of tags) {
      expect(has(tag, "eq", "grow_id", "grow-A")).toBe(true);
      expect(has(tag, "eq", "is_archived", false)).toBe(true);
      expect(has(tag, "is", "pheno_hunt_id", null)).toBe(true);
    }
    // Every plants write targets one of the picked ids.
    for (const c of calls.filter((c) => c.table === "plants" && updateOf(c))) {
      const id = c.ops.find((o) => o[0] === "eq" && o[1] === "id")?.[2];
      expect(["p1", "p2"]).toContain(id);
    }
  });

  it("uses the hunt's grow from the database, and rejects a zero-row tag as ineligible", async () => {
    const { client } = huntDb({ max: [16], tagOk: (id) => id !== "p-other-grow" });
    const assignNumber = vi.fn(async ({ candidateNumber }: { candidateNumber: number }) => ({
      ok: true as const,
      candidateNumber,
    }));
    const result = await addPhenoHuntCandidates(
      { huntId: "hunt-1", plantIds: ["p-other-grow", "p1"] },
      { client, assignNumber },
    );
    expect(result.failed).toEqual([{ plantId: "p-other-grow", reason: "ineligible" }]);
    expect(result.added).toEqual([{ plantId: "p1", candidateNumber: 17, candidateLabel: "#17" }]);
    expect(assignNumber).toHaveBeenCalledTimes(1);
  });

  it("re-reads the max and retries on a duplicate number, then aligns the label", async () => {
    const { client, calls } = huntDb({ max: [16, 17] });
    const assignNumber = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, reason: "duplicate", error: "dup" })
      .mockResolvedValueOnce({ ok: true, candidateNumber: 18 });
    const result = await addPhenoHuntCandidates(
      { huntId: "hunt-1", plantIds: ["p1"] },
      { client, assignNumber },
    );
    expect(assignNumber.mock.calls.map((c) => c[0].candidateNumber)).toEqual([17, 18]);
    expect(result.added).toEqual([{ plantId: "p1", candidateNumber: 18, candidateLabel: "#18" }]);
    const relabel = calls.find(
      (c) => updateOf(c)?.candidate_label === "#18" && !("pheno_hunt_id" in updateOf(c)!),
    );
    expect(relabel && has(relabel, "eq", "id", "p1")).toBe(true);
  });

  it("gives up after the bounded number of duplicate retries and untags", async () => {
    const { client, calls } = huntDb({ max: [16, 17, 18, 19] });
    const assignNumber = vi.fn().mockResolvedValue({ ok: false, reason: "duplicate", error: "d" });
    const result = await addPhenoHuntCandidates(
      { huntId: "hunt-1", plantIds: ["p1"] },
      { client, assignNumber },
    );
    expect(assignNumber).toHaveBeenCalledTimes(3);
    expect(result.failed).toEqual([{ plantId: "p1", reason: "duplicate" }]);
    expect(calls.some((c) => updateOf(c)?.pheno_hunt_id === null)).toBe(true);
  });

  it("rolls back the tag on an entitlement failure and stops further writes", async () => {
    const { client, calls } = huntDb({ max: [16] });
    const assignNumber = vi
      .fn()
      .mockResolvedValue({ ok: false, reason: "entitlement", error: "pro" });
    const result = await addPhenoHuntCandidates(
      { huntId: "hunt-1", plantIds: ["p1", "p2"] },
      { client, assignNumber },
    );
    expect(result.added).toEqual([]);
    expect(result.failed).toEqual([
      { plantId: "p1", reason: "entitlement" },
      { plantId: "p2", reason: "entitlement" },
    ]);
    const rollback = calls.find((c) => updateOf(c)?.pheno_hunt_id === null);
    expect(rollback).toBeDefined();
    expect(updateOf(rollback!)).toEqual({ pheno_hunt_id: null, candidate_label: null });
    expect(has(rollback!, "eq", "id", "p1")).toBe(true);
    expect(has(rollback!, "eq", "pheno_hunt_id", "hunt-1")).toBe(true);
    expect(has(rollback!, "is", "candidate_number", null)).toBe(true);
    expect(calls.filter((c) => updateOf(c)?.pheno_hunt_id === "hunt-1")).toHaveLength(1);
    expect(PHENO_HUNT_ADD_CANDIDATES_COPY.entitlement).toMatch(/Nothing was changed/);
  });

  it("numbers after setup's unnumbered #1..#16 candidates: 17 and 18, never #1", async () => {
    const setup = Array.from({ length: 16 }, (_, i) => ({
      candidate_number: null,
      candidate_label: defaultCandidateLabel(i),
    }));
    const { client } = huntDb({ max: [0], candidates: setup });
    const assignNumber = vi.fn(async ({ candidateNumber }: { candidateNumber: number }) => ({
      ok: true as const,
      candidateNumber,
    }));
    const result = await addPhenoHuntCandidates(
      { huntId: "hunt-1", plantIds: ["ashato-3", "ozp-3"] },
      { client, assignNumber },
    );
    expect(assignNumber.mock.calls.map((c) => c[0].candidateNumber)).toEqual([17, 18]);
    expect(result.added.map((a) => a.candidateLabel)).toEqual(["#17", "#18"]);
  });

  it.each([
    ["an error", () => ({ data: null, error: { message: "denied" } })],
    ["zero rows", () => ({ data: null, error: null })],
    [
      "a rejected request",
      () => {
        throw new Error("offline");
      },
    ],
  ])("reports an unconfirmed cleanup on %s and stops writing", async (_label, untag) => {
    const { client, calls } = huntDb({ max: [16], untag });
    const assignNumber = vi.fn().mockResolvedValue({ ok: false, reason: "network", error: "x" });
    const result = await addPhenoHuntCandidates(
      { huntId: "hunt-1", plantIds: ["p1", "p2"] },
      { client, assignNumber },
    );
    expect(result.added).toEqual([]);
    expect(result.failed).toEqual([
      { plantId: "p1", reason: "cleanup_unconfirmed" },
      { plantId: "p2", reason: "network" },
    ]);
    expect(calls.filter((c) => updateOf(c)?.pheno_hunt_id === "hunt-1")).toHaveLength(1);
    expect(PHENO_HUNT_ADD_CANDIDATES_COPY.cleanup_unconfirmed).not.toMatch(/Nothing was changed/);
  });

  it.each([
    ["an error", () => ({ data: null, error: { message: "denied" } })],
    ["zero rows", () => ({ data: null, error: null })],
  ])(
    "does not report a stale label as success when the relabel returns %s",
    async (_l, relabel) => {
      const { client, calls } = huntDb({ max: [16, 17], relabel });
      const assignNumber = vi
        .fn()
        .mockResolvedValueOnce({ ok: false, reason: "duplicate", error: "dup" })
        .mockResolvedValueOnce({ ok: true, candidateNumber: 18 });
      const result = await addPhenoHuntCandidates(
        { huntId: "hunt-1", plantIds: ["p1"] },
        { client, assignNumber },
      );
      expect(result.added).toEqual([]);
      expect(result.failed).toEqual([{ plantId: "p1", reason: "relabel_failed" }]);
      const relabelCall = calls.find((c) => updateOf(c)?.candidate_label === "#18");
      expect(relabelCall && has(relabelCall, "eq", "candidate_number", 18)).toBe(true);
    },
  );

  it("writes nothing when the hunt is not visible or input is empty", async () => {
    const { client, calls } = fakeClient(() => ({ data: null, error: null }));
    const assignNumber = vi.fn();
    expect(
      await addPhenoHuntCandidates(
        { huntId: "hunt-x", plantIds: ["p1"] },
        { client, assignNumber },
      ),
    ).toEqual({ added: [], failed: [{ plantId: "p1", reason: "hunt_not_found" }] });
    expect(
      await addPhenoHuntCandidates({ huntId: "hunt-1", plantIds: [] }, { client, assignNumber }),
    ).toEqual({ added: [], failed: [] });
    expect(calls.some((c) => updateOf(c))).toBe(false);
    expect(assignNumber).not.toHaveBeenCalled();
  });
});

describe("listPhenoHuntGrowPlants", () => {
  it("filters eligibility server-side and pages in a stable order past 500 plants", async () => {
    const page1 = Array.from({ length: 500 }, (_, i) => plant({ id: `p${i}` }));
    const page2 = [plant({ id: "late-1" }), plant({ id: "late-2" })];
    let page = 0;
    const { client, calls } = fakeClient(() => ({
      data: page++ === 0 ? page1 : page2,
      error: null,
    }));
    const result = await listPhenoHuntGrowPlants("grow-A", { client });
    expect(result.ok && result.plants.length).toBe(502);
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(has(call, "eq", "grow_id", "grow-A")).toBe(true);
      expect(has(call, "eq", "is_archived", false)).toBe(true);
      expect(has(call, "is", "pheno_hunt_id", null)).toBe(true);
      expect(has(call, "order", "name", { ascending: true })).toBe(true);
      expect(has(call, "order", "id", { ascending: true })).toBe(true);
    }
    expect(has(calls[0], "range", 0, 499)).toBe(true);
    expect(has(calls[1], "range", 500, 999)).toBe(true);
  });

  it("fails closed on a read error", async () => {
    const { client } = fakeClient(() => ({ data: null, error: { message: "x" } }));
    expect(await listPhenoHuntGrowPlants("grow-A", { client })).toEqual({ ok: false });
  });
});
