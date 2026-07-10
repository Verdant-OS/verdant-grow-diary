/**
 * pheno-hunt-onboarding-persistence — service-level persistence contract for
 * guided hunt setup on the pheno_hunts row (evidence_goals, notes,
 * setup_completed_at).
 *
 * Focus: what the shipped flow relies on but the UI tests can't see —
 * payload shapes actually written, sanitization at the write boundary, and
 * the RLS honesty rule: a blocked or silently-filtered write (0 rows — a
 * lapsed plan or a cross-user hunt id) must surface as PhenoHuntError,
 * never as fake success.
 */
import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createPhenoHunt,
  PhenoHuntError,
  updatePhenoHuntSetup,
} from "@/lib/phenoHuntService";

interface Call {
  table: string;
  op: "insert" | "update" | "select" | "delete";
  payload?: unknown;
  filters: Array<{ kind: string; args: unknown[] }>;
}

function makeFakeClient(
  respond: (call: Call) => { data?: unknown; error?: { message: string } | null },
) {
  const calls: Call[] = [];
  function builder(table: string) {
    const call: Call = { table, op: "select", filters: [] };
    calls.push(call);
    const chain: Record<string, unknown> = {};
    const setOp =
      (op: Call["op"]) =>
      (payload?: unknown) => {
        call.op = op;
        call.payload = payload;
        return chain;
      };
    chain.insert = setOp("insert");
    chain.update = setOp("update");
    chain.delete = setOp("delete");
    chain.select = (cols?: string) => {
      call.filters.push({ kind: "select", args: [cols] });
      return chain;
    };
    for (const kind of ["eq", "is", "in"]) {
      chain[kind] = (...args: unknown[]) => {
        call.filters.push({ kind, args });
        return chain;
      };
    }
    chain.single = () => Promise.resolve(respond(call));
    chain.maybeSingle = () => Promise.resolve(respond(call));
    chain.then = (
      onFulfilled: (v: unknown) => unknown,
      onRejected?: (e: unknown) => unknown,
    ) => Promise.resolve(respond(call)).then(onFulfilled, onRejected);
    return chain;
  }
  const client = { from: builder } as unknown as SupabaseClient;
  return { client, calls };
}

const RLS_DENIAL = {
  message: 'new row violates row-level security policy for table "pheno_hunts"',
};

describe("createPhenoHunt setup persistence", () => {
  it("persists sanitized evidence goals, trimmed notes, and no premature completion stamp", async () => {
    const { client, calls } = makeFakeClient((call) => {
      if (call.table === "pheno_hunts" && call.op === "insert") {
        return { data: { id: "h1" }, error: null };
      }
      return { data: null, error: null };
    });
    await createPhenoHunt(
      {
        growId: "g1",
        name: "Hunt",
        plantIds: ["p1"],
        evidenceGoals: ["structure", "bogus-goal", "structure"],
        notes: "  keep this  ",
      },
      client,
    );
    const row = calls.find((c) => c.op === "insert")?.payload as Record<string, unknown>;
    expect(row.evidence_goals).toEqual(["structure"]);
    expect(row.notes).toBe("keep this");
    expect(row).not.toHaveProperty("setup_completed_at");
  });

  it("markSetupComplete stamps setup_completed_at on the insert", async () => {
    const { client, calls } = makeFakeClient((call) => {
      if (call.table === "pheno_hunts" && call.op === "insert") {
        return { data: { id: "h1" }, error: null };
      }
      return { data: null, error: null };
    });
    await createPhenoHunt(
      { growId: "g1", name: "Hunt", plantIds: ["p1"], markSetupComplete: true },
      client,
    );
    const row = calls.find((c) => c.op === "insert")?.payload as Record<string, unknown>;
    expect(typeof row.setup_completed_at).toBe("string");
  });
});

describe("updatePhenoHuntSetup persistence honesty", () => {
  it("persists the patch and succeeds when the row is returned", async () => {
    const { client, calls } = makeFakeClient(() => ({ data: { id: "h1" }, error: null }));
    await updatePhenoHuntSetup(
      { huntId: "h1", notes: "  new notes  ", markSetupComplete: true },
      client,
    );
    const upd = calls.find((c) => c.op === "update");
    const patch = upd?.payload as Record<string, unknown>;
    expect(patch.notes).toBe("new notes");
    expect(typeof patch.setup_completed_at).toBe("string");
  });

  it("an empty patch never touches the database", async () => {
    const { client, calls } = makeFakeClient(() => ({ data: null, error: null }));
    await updatePhenoHuntSetup({ huntId: "h1" }, client);
    expect(calls).toHaveLength(0);
  });

  it("a silently-filtered update (0 rows: lapsed plan or cross-user id) is NOT a success", async () => {
    const { client } = makeFakeClient(() => ({ data: null, error: null }));
    await expect(
      updatePhenoHuntSetup(
        { huntId: "someone-elses-hunt", markSetupComplete: true },
        client,
      ),
    ).rejects.toBeInstanceOf(PhenoHuntError);
  });

  it("an explicit RLS rejection surfaces as PhenoHuntError", async () => {
    const { client } = makeFakeClient(() => ({ data: null, error: RLS_DENIAL }));
    await expect(
      updatePhenoHuntSetup({ huntId: "h1", notes: "x" }, client),
    ).rejects.toBeInstanceOf(PhenoHuntError);
  });
});
