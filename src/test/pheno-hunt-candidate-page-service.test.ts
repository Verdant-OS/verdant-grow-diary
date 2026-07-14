/**
 * pheno-hunt-candidate-page-service — the bounded, server-paginated candidate
 * read. Verifies deterministic server ORDER BY, count:"exact" honest totals,
 * candidate_number threading, preserved server order, and that each filter
 * (text / strain / stage / decision / sex) reaches the query builder. The real
 * DB round-trip is covered by the runtime harness; here we pin the query shape.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

interface Recorded {
  table: string;
  calls: Array<[string, ...unknown[]]>;
}

const recorded: Recorded[] = [];
// Per-table canned results, keyed by table name (last write wins per test).
const results: Record<string, { data: unknown; error: unknown; count?: number }> = {};

function makeBuilder(table: string) {
  const rec: Recorded = { table, calls: [] };
  recorded.push(rec);
  const result = () => results[table] ?? { data: [], error: null, count: 0 };
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "or", "ilike", "not", "order", "range", "limit"]) {
    builder[m] = (...args: unknown[]) => {
      rec.calls.push([m, ...args]);
      return builder;
    };
  }
  (builder as { then: unknown }).then = (resolve: (v: unknown) => unknown) => resolve(result());
  (builder as { maybeSingle: unknown }).maybeSingle = () => Promise.resolve(result());
  return builder;
}

vi.mock("@/integrations/supabase/phenoTables", () => ({
  phenoDb: { from: (t: string) => makeBuilder(t) },
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (t: string) => makeBuilder(t) },
}));
const listLatestSex = vi.fn().mockResolvedValue({});
vi.mock("@/lib/phenoSexObservationService", () => ({
  listLatestSexObservationsForHunt: (...a: unknown[]) => listLatestSex(...a),
}));

import { loadPhenoHuntCandidatePage } from "@/lib/phenoHuntCandidatesService";

function plantsResult(rows: unknown[], count: number) {
  results["plants"] = { data: rows, error: null, count };
}
function callsFor(table: string): Array<[string, ...unknown[]]> {
  return recorded.filter((r) => r.table === table).flatMap((r) => r.calls);
}
function firstOrder(table: string): Array<[string, ...unknown[]]> {
  return callsFor(table).filter((c) => c[0] === "order");
}

beforeEach(() => {
  recorded.length = 0;
  for (const k of Object.keys(results)) delete results[k];
  listLatestSex.mockReset().mockResolvedValue({});
});

describe("loadPhenoHuntCandidatePage — bounds & ordering", () => {
  it("requests count:exact, deterministic order, and a bounded range", async () => {
    plantsResult(
      [
        {
          id: "p2",
          name: "B",
          candidate_label: null,
          candidate_number: 2,
          strain: null,
          stage: null,
          grow_id: null,
          tent_id: null,
          photo_url: null,
          is_archived: false,
        },
        {
          id: "p1",
          name: "A",
          candidate_label: null,
          candidate_number: 5,
          strain: null,
          stage: null,
          grow_id: null,
          tent_id: null,
          photo_url: null,
          is_archived: false,
        },
      ],
      42,
    );
    const res = await loadPhenoHuntCandidatePage({ huntId: "h1", page: 2, pageSize: 30 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.total).toBe(42);
    expect(res.page).toBe(2);
    expect(res.pageSize).toBe(30);

    const plantCalls = callsFor("plants");
    // count:"exact" on select
    const select = plantCalls.find((c) => c[0] === "select");
    expect(select?.[2]).toEqual({ count: "exact" });
    // ordered candidate_number NULLS LAST, then label, name, id
    const orders = firstOrder("plants").map((c) => c[1]);
    expect(orders).toEqual(["candidate_number", "candidate_label", "name", "id"]);
    // bounded range for page 2 @ size 30 → [60, 89]
    const range = plantCalls.find((c) => c[0] === "range");
    expect(range?.slice(1)).toEqual([60, 89]);
  });

  it("preserves the server row order (no client re-sort) and threads candidate_number", async () => {
    // Server returns p2(#2) before p1(#5); preserveOrder keeps that order even
    // though 2 < 5 would already agree — the point is the adapter does not sort.
    plantsResult(
      [
        {
          id: "p2",
          name: "Zeta",
          candidate_label: "Zeta",
          candidate_number: 2,
          strain: null,
          stage: null,
          grow_id: null,
          tent_id: null,
          photo_url: null,
          is_archived: false,
        },
        {
          id: "p1",
          name: "Alpha",
          candidate_label: "Alpha",
          candidate_number: 5,
          strain: null,
          stage: null,
          grow_id: null,
          tent_id: null,
          photo_url: null,
          is_archived: false,
        },
      ],
      2,
    );
    const res = await loadPhenoHuntCandidatePage({ huntId: "h1", page: 0, pageSize: 30 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.candidates.map((c) => c.candidateId)).toEqual(["p2", "p1"]);
    expect(res.candidates.map((c) => c.candidateNumber)).toEqual([2, 5]);
  });

  it("clamps an over-large pageSize and normalizes a negative page", async () => {
    plantsResult([], 0);
    const res = await loadPhenoHuntCandidatePage({ huntId: "h1", page: -3, pageSize: 9999 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.page).toBe(0);
    expect(res.pageSize).toBe(100); // MAX_PAGE_SIZE
  });

  it("returns an error for a missing hunt id", async () => {
    const res = await loadPhenoHuntCandidatePage({ huntId: "   ", page: 0, pageSize: 30 });
    expect(res.ok).toBe(false);
  });
});

describe("loadPhenoHuntCandidatePage — honest filters reach the query", () => {
  it("pushes text search to an OR over label/name (and candidate_number when numeric)", async () => {
    plantsResult([], 0);
    await loadPhenoHuntCandidatePage({
      huntId: "h1",
      page: 0,
      pageSize: 30,
      filters: { text: "5" },
    });
    const or = callsFor("plants").find((c) => c[0] === "or");
    expect(or?.[1]).toContain("candidate_label.ilike.*5*");
    expect(or?.[1]).toContain("name.ilike.*5*");
    expect(or?.[1]).toContain("candidate_number.eq.5");
  });

  it("sanitizes PostgREST-significant characters out of free text", async () => {
    plantsResult([], 0);
    await loadPhenoHuntCandidatePage({
      huntId: "h1",
      page: 0,
      pageSize: 30,
      filters: { text: "a,b()%*." },
    });
    const or = callsFor("plants").find((c) => c[0] === "or");
    // commas/parens/%/*/. stripped → collapsed to "a b"
    expect(or?.[1]).toContain("candidate_label.ilike.*a b*");
    expect(String(or?.[1])).not.toContain("(");
  });

  it("applies strain (ilike) and stage (eq) filters", async () => {
    plantsResult([], 0);
    await loadPhenoHuntCandidatePage({
      huntId: "h1",
      page: 0,
      pageSize: 30,
      filters: { strain: "Blue", stage: "flower" },
    });
    const calls = callsFor("plants");
    expect(calls.some((c) => c[0] === "ilike" && c[1] === "strain")).toBe(true);
    expect(calls.some((c) => c[0] === "eq" && c[1] === "stage" && c[2] === "flower")).toBe(true);
  });

  it("intersects candidate ids for a keeper-decision filter", async () => {
    plantsResult([], 0);
    results["pheno_keeper_decisions"] = {
      data: [
        { plant_id: "p1", decision: "keep" },
        { plant_id: "p2", decision: "keep" },
      ],
      error: null,
    };
    await loadPhenoHuntCandidatePage({
      huntId: "h1",
      page: 0,
      pageSize: 30,
      filters: { decision: "keep" },
    });
    const inCall = callsFor("plants").find((c) => c[0] === "in" && c[1] === "id");
    expect(inCall?.[2]).toEqual(["p1", "p2"]);
  });

  it("excludes decided candidates for the 'undecided' filter", async () => {
    plantsResult([], 0);
    results["pheno_keeper_decisions"] = {
      data: [{ plant_id: "p9", decision: "cull" }],
      error: null,
    };
    await loadPhenoHuntCandidatePage({
      huntId: "h1",
      page: 0,
      pageSize: 30,
      filters: { decision: "undecided" },
    });
    const notCall = callsFor("plants").find((c) => c[0] === "not");
    expect(notCall?.[1]).toBe("id");
    expect(notCall?.[2]).toBe("in");
    expect(notCall?.[3]).toBe("(p9)");
  });

  it("intersects candidate ids for a sex filter via the latest-sex view", async () => {
    plantsResult([], 0);
    listLatestSex.mockResolvedValue({
      p1: { plantId: "p1", sex: "female" },
      p2: { plantId: "p2", sex: "male" },
    });
    await loadPhenoHuntCandidatePage({
      huntId: "h1",
      page: 0,
      pageSize: 30,
      filters: { sex: "female" },
    });
    const inCall = callsFor("plants").find((c) => c[0] === "in" && c[1] === "id");
    expect(inCall?.[2]).toEqual(["p1"]);
  });
});
