/**
 * pheno-hunt-onboarding-persistence — service-level persistence contract.
 *
 * Persistence strategy under test: setup state lives on the pheno_hunts row
 * (goal, setup_confirmed_at) + candidate tags on plants — no localStorage, so
 * "continue setup" works across devices and RLS (owner rows + RESTRICTIVE
 * has_pheno_tracker_entitlement) governs every write. A canceled/expired
 * user's write is rejected by the database; these tests pin that the client
 * surfaces that rejection as a PhenoHuntError instead of faking success.
 */
import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  confirmPhenoHuntSetup,
  createPhenoHunt,
  loadPhenoHuntSetup,
  PhenoHuntError,
  updatePhenoHuntGoal,
} from "@/lib/phenoHuntService";

/**
 * Minimal chainable fake PostgREST client. Each `from(table)` returns a
 * builder that records the operation + payload and resolves with the queued
 * response for (table, op).
 */
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
      if (call.op === "select") call.payload = cols;
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

describe("createPhenoHunt persists the goal", () => {
  it("stores the trimmed goal on the hunt row", async () => {
    const { client, calls } = makeFakeClient((call) => {
      if (call.table === "pheno_hunts" && call.op === "insert") {
        return { data: { id: "h1" }, error: null };
      }
      return { data: null, error: null };
    });
    await createPhenoHunt(
      { growId: "g1", name: "Hunt", goal: "  Find the keeper  ", plantIds: ["p1"] },
      client,
    );
    const insert = calls.find((c) => c.table === "pheno_hunts" && c.op === "insert");
    expect(insert?.payload).toMatchObject({ goal: "Find the keeper" });
  });

  it("stores NULL when the goal is blank (never an empty string)", async () => {
    const { client, calls } = makeFakeClient((call) => {
      if (call.table === "pheno_hunts" && call.op === "insert") {
        return { data: { id: "h1" }, error: null };
      }
      return { data: null, error: null };
    });
    await createPhenoHunt({ growId: "g1", name: "Hunt", goal: "   ", plantIds: ["p1"] }, client);
    const insert = calls.find((c) => c.table === "pheno_hunts" && c.op === "insert");
    expect((insert?.payload as { goal: unknown }).goal).toBeNull();
  });
});

describe("loadPhenoHuntSetup", () => {
  it("maps the persisted row + candidates", async () => {
    const { client } = makeFakeClient((call) => {
      if (call.table === "pheno_hunts") {
        return {
          data: {
            id: "h1",
            name: "Hunt",
            goal: "Find the keeper",
            grow_id: "g1",
            tent_id: null,
            setup_confirmed_at: null,
          },
          error: null,
        };
      }
      return {
        data: [
          { id: "p1", name: "Plant 1", candidate_label: "#1" },
          { id: "p2", name: "Plant 2", candidate_label: null },
        ],
        error: null,
      };
    });
    const state = await loadPhenoHuntSetup("h1", client);
    expect(state).toEqual({
      huntId: "h1",
      name: "Hunt",
      goal: "Find the keeper",
      growId: "g1",
      tentId: null,
      setupConfirmedAt: null,
      candidates: [
        { id: "p1", name: "Plant 1", candidateLabel: "#1" },
        { id: "p2", name: "Plant 2", candidateLabel: null },
      ],
    });
  });

  it("throws PhenoHuntError when the hunt is missing (RLS-filtered or deleted)", async () => {
    const { client } = makeFakeClient(() => ({ data: null, error: null }));
    await expect(loadPhenoHuntSetup("h404", client)).rejects.toBeInstanceOf(PhenoHuntError);
  });
});

describe("updatePhenoHuntGoal", () => {
  it("persists the trimmed goal", async () => {
    const { client, calls } = makeFakeClient(() => ({
      data: { goal: "New goal" },
      error: null,
    }));
    const res = await updatePhenoHuntGoal({ huntId: "h1", goal: "  New goal  " }, client);
    expect(res.goal).toBe("New goal");
    const upd = calls.find((c) => c.op === "update");
    expect(upd?.payload).toEqual({ goal: "New goal" });
  });

  it("a silently-filtered update (0 rows: cross-user or RLS-blocked) is NOT a success", async () => {
    const { client } = makeFakeClient(() => ({ data: null, error: null }));
    await expect(
      updatePhenoHuntGoal({ huntId: "someone-elses-hunt", goal: "Goal" }, client),
    ).rejects.toBeInstanceOf(PhenoHuntError);
  });

  it("rejects an empty goal without touching the database", async () => {
    const { client, calls } = makeFakeClient(() => ({ data: null, error: null }));
    await expect(updatePhenoHuntGoal({ huntId: "h1", goal: "  " }, client)).rejects.toBeInstanceOf(
      PhenoHuntError,
    );
    expect(calls).toHaveLength(0);
  });

  it("rejects goals over 500 chars without touching the database", async () => {
    const { client, calls } = makeFakeClient(() => ({ data: null, error: null }));
    await expect(
      updatePhenoHuntGoal({ huntId: "h1", goal: "x".repeat(501) }, client),
    ).rejects.toBeInstanceOf(PhenoHuntError);
    expect(calls).toHaveLength(0);
  });

  it("surfaces an RLS write denial (canceled/expired plan) as PhenoHuntError", async () => {
    const { client } = makeFakeClient(() => ({ data: null, error: RLS_DENIAL }));
    await expect(
      updatePhenoHuntGoal({ huntId: "h1", goal: "Goal" }, client),
    ).rejects.toBeInstanceOf(PhenoHuntError);
  });
});

describe("confirmPhenoHuntSetup", () => {
  it("stamps only a NULL setup_confirmed_at and returns the stored stamp", async () => {
    const stored = "2026-07-09T12:00:00.000Z";
    const { client, calls } = makeFakeClient((call) => {
      if (call.op === "update") return { data: null, error: null };
      return { data: { setup_confirmed_at: stored }, error: null };
    });
    const res = await confirmPhenoHuntSetup(
      { huntId: "h1", confirmedAtIso: stored },
      client,
    );
    expect(res.setupConfirmedAt).toBe(stored);
    const upd = calls.find((c) => c.op === "update");
    expect(upd?.payload).toEqual({ setup_confirmed_at: stored });
    // Idempotency guard: the update is filtered to unconfirmed rows only.
    expect(upd?.filters).toContainEqual({ kind: "is", args: ["setup_confirmed_at", null] });
  });

  it("is idempotent: re-confirming returns the ORIGINAL stamp", async () => {
    const original = "2026-07-01T00:00:00.000Z";
    const { client } = makeFakeClient((call) => {
      if (call.op === "update") return { data: null, error: null }; // matched 0 rows
      return { data: { setup_confirmed_at: original }, error: null };
    });
    const res = await confirmPhenoHuntSetup(
      { huntId: "h1", confirmedAtIso: "2026-07-09T12:00:00.000Z" },
      client,
    );
    expect(res.setupConfirmedAt).toBe(original);
  });

  it("surfaces an RLS write denial (canceled/expired plan) as PhenoHuntError", async () => {
    const { client } = makeFakeClient((call) => {
      if (call.op === "update") return { data: null, error: RLS_DENIAL };
      return { data: null, error: null };
    });
    await expect(confirmPhenoHuntSetup({ huntId: "h1" }, client)).rejects.toBeInstanceOf(
      PhenoHuntError,
    );
  });

  it("never fakes success when the row stayed unconfirmed", async () => {
    const { client } = makeFakeClient((call) => {
      if (call.op === "update") return { data: null, error: null };
      return { data: { setup_confirmed_at: null }, error: null };
    });
    await expect(confirmPhenoHuntSetup({ huntId: "h1" }, client)).rejects.toBeInstanceOf(
      PhenoHuntError,
    );
  });
});
