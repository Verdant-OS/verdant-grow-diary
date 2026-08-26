/**
 * pheno-candidate-diary-evidence-rpc — the candidates' diary evidence read
 * goes through ONE server-side top-N-per-plant RPC call (never one query per
 * plant), stays fail-closed on any read failure, chunks at the server's
 * 100-id cap, and falls back to the per-plant legacy read ONLY on the
 * missing-RPC deploy-window signal. The starvation regression (#1144's
 * deferred end-state) is asserted on the fixture: a prolific candidate's rows
 * arrive in the same payload as its siblings', and every sibling keeps its
 * own entries.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

interface Recorded {
  table: string;
  calls: Array<[string, ...unknown[]]>;
}

const recorded: Recorded[] = [];
const results: Record<string, { data: unknown; error: unknown }> = {};
const resultQueues: Record<string, Array<{ data: unknown; error: unknown }>> = {};
const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
let rpcQueue: Array<{ data: unknown; error: unknown }> = [];
let rpcResult: { data: unknown; error: unknown } = { data: [], error: null };

function makeBuilder(table: string) {
  const rec: Recorded = { table, calls: [] };
  recorded.push(rec);
  const result = () => resultQueues[table]?.shift() ?? results[table] ?? { data: [], error: null };
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "is", "or", "ilike", "not", "order", "range", "limit"]) {
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
  phenoDb: {
    from: (t: string) => makeBuilder(t),
    rpc: (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      return Promise.resolve(rpcQueue.shift() ?? rpcResult);
    },
  },
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (t: string) => makeBuilder(t) },
}));
vi.mock("@/lib/phenoSexObservationService", () => ({
  listLatestSexObservationsForHunt: vi.fn().mockResolvedValue({}),
}));

import { loadPhenoHuntCandidates } from "@/lib/phenoHuntCandidatesService";

const RPC = "pheno_candidate_diary_entries_top_n";

function plantRow(id: string) {
  return {
    id,
    name: `Plant ${id}`,
    candidate_label: null,
    candidate_number: null,
    strain: null,
    stage: null,
    plant_type: null,
    grow_id: null,
    tent_id: null,
    photo_url: null,
    is_archived: false,
  };
}

function diaryRow(id: string, plantId: string, at: string) {
  return { id, plant_id: plantId, entry_at: at, note: `note ${id}`, photo_url: null, details: {} };
}

function huntFixture(plantIds: string[]) {
  results["pheno_hunts"] = {
    data: { id: "h1", name: "Hunt", grow_id: null, tent_id: null },
    error: null,
  };
  results["plants"] = { data: plantIds.map(plantRow), error: null };
}

function diaryQueries() {
  return recorded.filter((r) => r.table === "diary_entries");
}

beforeEach(() => {
  recorded.length = 0;
  rpcCalls.length = 0;
  rpcQueue = [];
  rpcResult = { data: [], error: null };
  for (const k of Object.keys(results)) delete results[k];
  for (const k of Object.keys(resultQueues)) delete resultQueues[k];
});

describe("diary evidence — one RPC, not N queries", () => {
  it("makes exactly one RPC for the page's plants and zero diary_entries queries", async () => {
    huntFixture(["p1", "p2", "p3"]);
    rpcResult = {
      data: [
        // Prolific p1: six newest rows arrive in the SAME payload as the
        // siblings' rows — the server already applied the per-plant limit.
        ...[20, 19, 18, 17, 16, 15].map((d) => diaryRow(`e1-${d}`, "p1", `2026-08-${d}T12:00:00Z`)),
        diaryRow("e2-1", "p2", "2026-08-20T10:00:00Z"),
        diaryRow("e2-2", "p2", "2026-08-19T10:00:00Z"),
        diaryRow("e3-1", "p3", "2026-08-18T10:00:00Z"),
      ],
      error: null,
    };

    const res = await loadPhenoHuntCandidates("h1");
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].fn).toBe(RPC);
    expect(rpcCalls[0].args).toEqual({
      p_plant_ids: ["p1", "p2", "p3"],
      p_limit_per_plant: 40,
    });
    expect(diaryQueries()).toHaveLength(0);

    // Starvation regression: every sibling keeps its OWN entries even though
    // p1 dominates the payload; p1 caps at the 5-entry presentation limit.
    const byId = Object.fromEntries(res.candidates.map((c) => [c.candidateId, c]));
    expect(byId["p1"].quickLogEntries).toHaveLength(5);
    expect(byId["p2"].quickLogEntries).toHaveLength(2);
    expect(byId["p3"].quickLogEntries).toHaveLength(1);
    expect(byId["p2"].quickLogEntries?.[0]?.id).toBe("e2-1");
  });

  it("a hunt with no candidates resolves without any RPC or diary query", async () => {
    huntFixture([]);
    const res = await loadPhenoHuntCandidates("h1");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.candidates).toEqual([]);
    expect(rpcCalls).toHaveLength(0);
    expect(diaryQueries()).toHaveLength(0);
  });

  it("chunks above the server's 100-id cap instead of sending an oversized call", async () => {
    const ids = Array.from({ length: 120 }, (_, i) => `p${i + 1}`);
    huntFixture(ids);

    const res = await loadPhenoHuntCandidates("h1");
    expect(res.ok).toBe(true);

    expect(rpcCalls).toHaveLength(2);
    expect((rpcCalls[0].args.p_plant_ids as string[]).length).toBe(100);
    expect((rpcCalls[1].args.p_plant_ids as string[]).length).toBe(20);
    expect(rpcCalls[1].args.p_limit_per_plant).toBe(40);
  });
});

describe("diary evidence — fail closed", () => {
  it("a failed RPC surfaces the honest diary read error, never empty evidence", async () => {
    huntFixture(["p1"]);
    rpcResult = {
      data: null,
      error: { code: "42501", message: "permission denied for function" },
    };

    const res = await loadPhenoHuntCandidates("h1");
    expect(res).toEqual({ ok: false, error: "Could not load diary evidence." });
  });

  it("a null RPC payload with no error also fails closed", async () => {
    huntFixture(["p1"]);
    rpcResult = { data: null, error: null };

    const res = await loadPhenoHuntCandidates("h1");
    expect(res).toEqual({ ok: false, error: "Could not load diary evidence." });
  });
});

describe("diary evidence — deploy-window fallback (missing RPC only)", () => {
  it("falls back to the per-plant legacy read when the RPC is not deployed yet", async () => {
    huntFixture(["p1", "p2", "p3"]);
    rpcResult = {
      data: null,
      error: {
        code: "PGRST202",
        message: `Could not find the function public.${RPC}(p_limit_per_plant, p_plant_ids) in the schema cache`,
      },
    };
    resultQueues["diary_entries"] = [
      { data: [diaryRow("e1", "p1", "2026-08-20T12:00:00Z")], error: null },
      { data: [diaryRow("e2", "p2", "2026-08-19T12:00:00Z")], error: null },
      { data: [], error: null },
    ];

    const res = await loadPhenoHuntCandidates("h1");
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(rpcCalls).toHaveLength(1);
    const legacy = diaryQueries();
    expect(legacy).toHaveLength(3);
    for (const q of legacy) {
      expect(q.calls).toContainEqual(["is", "retracted_at", null]);
      expect(q.calls).toContainEqual(["limit", 40]);
    }
    expect(legacy.map((q) => q.calls.find((c) => c[0] === "eq")?.[2])).toEqual(["p1", "p2", "p3"]);

    const byId = Object.fromEntries(res.candidates.map((c) => [c.candidateId, c]));
    expect(byId["p1"].quickLogEntries).toHaveLength(1);
    expect(byId["p2"].quickLogEntries).toHaveLength(1);
    expect(byId["p3"].quickLogEntries).toHaveLength(0);
  });

  it("does NOT fall back on an unrelated undefined-function error", async () => {
    huntFixture(["p1"]);
    rpcResult = {
      data: null,
      error: { code: "42883", message: "function public.some_other_function() does not exist" },
    };

    const res = await loadPhenoHuntCandidates("h1");
    expect(res).toEqual({ ok: false, error: "Could not load diary evidence." });
    expect(diaryQueries()).toHaveLength(0);
  });
});
