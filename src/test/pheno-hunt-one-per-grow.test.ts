/**
 * #567 — one hunt per grow is enforced at create time (not only copy).
 */
import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createPhenoHunt, PHENO_ONE_HUNT_PER_GROW_MESSAGE } from "@/lib/phenoHuntService";

interface Call {
  table: string;
  op: "insert" | "update" | "select" | "delete";
}

function makeFakeClient(
  respond: (call: Call) => { data?: unknown; error?: { message: string; code?: string } | null },
) {
  function builder(table: string) {
    const call: Call = { table, op: "select" };
    const chain: Record<string, unknown> = {};
    const setOp = (op: Call["op"]) => () => {
      call.op = op;
      return chain;
    };
    chain.insert = setOp("insert");
    chain.update = setOp("update");
    chain.delete = setOp("delete");
    chain.select = () => chain;
    for (const kind of ["eq", "is", "in", "limit", "order"]) {
      chain[kind] = () => chain;
    }
    chain.single = () => Promise.resolve(respond(call));
    chain.maybeSingle = () => Promise.resolve(respond(call));
    chain.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
      Promise.resolve(respond(call)).then(onFulfilled, onRejected);
    return chain;
  }
  return { from: builder } as unknown as SupabaseClient;
}

describe("createPhenoHunt one-hunt-per-grow (#567)", () => {
  it("rejects a second hunt on a grow that already has one", async () => {
    const client = makeFakeClient((call) => {
      if (call.table === "pheno_hunts" && call.op === "select") {
        return { data: [{ id: "existing" }], error: null };
      }
      if (call.table === "pheno_hunts" && call.op === "insert") {
        throw new Error("insert must not run when a hunt already exists");
      }
      return { data: null, error: null };
    });
    await expect(
      createPhenoHunt({ growId: "g1", name: "Second", plantIds: ["p1"] }, client),
    ).rejects.toMatchObject({
      name: "PhenoHuntError",
      message: PHENO_ONE_HUNT_PER_GROW_MESSAGE,
    });
  });

  it("allows create when the grow has no existing hunt", async () => {
    const client = makeFakeClient((call) => {
      if (call.table === "pheno_hunts" && call.op === "select") {
        return { data: [], error: null };
      }
      if (call.table === "pheno_hunts" && call.op === "insert") {
        return { data: { id: "h-new" }, error: null };
      }
      if (call.table === "plants" && call.op === "update") {
        return { data: { id: "p1" }, error: null };
      }
      return { data: null, error: null };
    });
    const res = await createPhenoHunt({ growId: "g1", name: "First", plantIds: ["p1"] }, client);
    expect(res.huntId).toBe("h-new");
    expect(res.taggedPlantIds).toContain("p1");
  });
});
