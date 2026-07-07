/**
 * Part B (B3) — reversals service + classify-on-record for crosses.
 *
 * Proves the service layer:
 *   - records a reversal (append-only insert; method normalized; auth/blank
 *     guards),
 *   - derives reversed state (hasReversal / listReversedKeeperIds),
 *   - and that recordCross CLASSIFIES via reversal state (standard_f1 /
 *     feminized_cross / selfing_s1), persisting the matching cross_type +
 *     null-for-selfing male, and rejecting impossible combos.
 *
 * The Supabase client is mocked; phenoDb wraps the same client, so both
 * services hit the mock. No network, no auth, no writes.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ client: null as unknown as ReturnType<typeof makeSupabase> }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: () => h.client.auth.getUser() },
    from: (t: string) => h.client.from(t),
  },
}));

type InsertRow = Record<string, unknown>;

function makeSupabase(opts: {
  userId?: string | null;
  reversedKeeperIds?: string[];
  reversalInsertError?: boolean;
  crossInsertError?: boolean;
}) {
  const reversed = new Set(opts.reversedKeeperIds ?? []);
  const crossInserts: InsertRow[] = [];
  const reversalInserts: InsertRow[] = [];

  function insertBuilder(sink: InsertRow[], id: string, fail: boolean) {
    return (row: InsertRow) => {
      sink.push(row);
      return {
        select: () => ({
          single: async () => ({
            data: fail ? null : { id },
            error: fail ? { message: "x" } : null,
          }),
        }),
      };
    };
  }

  function reversalsSelect() {
    let filterKeeper: string | null = null;
    let filterIds: string[] | null = null;
    const builder = {
      eq(col: string, val: string) {
        if (col === "keeper_id") filterKeeper = val;
        return builder;
      },
      in(col: string, vals: string[]) {
        if (col === "keeper_id") filterIds = vals;
        return builder;
      },
      order() {
        return builder;
      },
      limit() {
        return builder;
      },
      then(resolve: (v: { data: InsertRow[]; error: null }) => void) {
        let rows: InsertRow[];
        if (filterKeeper != null) {
          rows = reversed.has(filterKeeper) ? [{ id: "r", keeper_id: filterKeeper }] : [];
        } else if (filterIds != null) {
          rows = filterIds.filter((k) => reversed.has(k)).map((k) => ({ keeper_id: k }));
        } else {
          rows = [...reversed].map((k) => ({ keeper_id: k }));
        }
        resolve({ data: rows, error: null });
      },
    };
    return builder;
  }

  const client = {
    auth: {
      getUser: async () => ({
        data: { user: opts.userId === null ? null : { id: opts.userId ?? "u1" } },
      }),
    },
    from(table: string) {
      if (table === "pheno_reversals") {
        return {
          insert: insertBuilder(reversalInserts, "rev-1", Boolean(opts.reversalInsertError)),
          select: () => reversalsSelect(),
        };
      }
      if (table === "pheno_crosses") {
        return { insert: insertBuilder(crossInserts, "x-1", Boolean(opts.crossInsertError)) };
      }
      return {};
    },
    crossInserts,
    reversalInserts,
  };
  return client;
}

// Import AFTER the mock is registered.
import {
  recordReversal,
  hasReversal,
  listReversedKeeperIds,
  listReversedKeeperIdsForKeepers,
} from "@/lib/phenoReversalsService";
import { recordCross } from "@/lib/phenoKeepersService";

beforeEach(() => {
  h.client = makeSupabase({});
});

describe("recordReversal", () => {
  it("inserts an append-only reversal row with the chosen method", async () => {
    h.client = makeSupabase({});
    const r = await recordReversal({ keeperId: "k1", method: "colloidal_silver", note: "day 3" });
    expect(r.ok).toBe(true);
    expect(h.client.reversalInserts[0]).toMatchObject({
      user_id: "u1",
      keeper_id: "k1",
      method: "colloidal_silver",
      note: "day 3",
    });
  });

  it("preserves an unrecognized method as 'other' (never mislabels as sts)", async () => {
    h.client = makeSupabase({});
    await recordReversal({ keeperId: "k1", method: "bleach" });
    expect(h.client.reversalInserts[0].method).toBe("other");
    h.client = makeSupabase({});
    await recordReversal({ keeperId: "k1" }); // unspecified → honest "other"
    expect(h.client.reversalInserts[0].method).toBe("other");
  });

  it("rejects when signed out or when no keeper is chosen", async () => {
    h.client = makeSupabase({ userId: null });
    expect((await recordReversal({ keeperId: "k1" })).ok).toBe(false);
    h.client = makeSupabase({});
    expect((await recordReversal({ keeperId: "  " })).ok).toBe(false);
  });
});

describe("reversed-state derivation", () => {
  it("hasReversal reflects whether a row exists for the keeper", async () => {
    h.client = makeSupabase({ reversedKeeperIds: ["k1"] });
    expect(await hasReversal("k1")).toBe(true);
    expect(await hasReversal("k2")).toBe(false);
    expect(await hasReversal("")).toBe(false);
  });

  it("listReversedKeeperIds returns the distinct reversed keepers", async () => {
    h.client = makeSupabase({ reversedKeeperIds: ["k1", "k2"] });
    const ids = await listReversedKeeperIds();
    expect(new Set(ids)).toEqual(new Set(["k1", "k2"]));
  });

  it("listReversedKeeperIdsForKeepers scopes to the given keeper ids (no overfetch)", async () => {
    h.client = makeSupabase({ reversedKeeperIds: ["k1", "k2", "k9"] });
    // Only ask about k1/k3 → only the reversed subset in that list comes back.
    const ids = await listReversedKeeperIdsForKeepers(["k1", "k3"]);
    expect(new Set(ids)).toEqual(new Set(["k1"]));
    // Empty input short-circuits without a query.
    expect(await listReversedKeeperIdsForKeepers([])).toEqual([]);
  });
});

describe("recordCross — classifies via reversal state", () => {
  it("two non-reversed parents → standard_f1 with the male persisted", async () => {
    h.client = makeSupabase({ reversedKeeperIds: [] });
    const r = await recordCross({ femaleKeeperId: "mom", maleKeeperId: "dad", huntId: "hunt-1" });
    expect(r.ok).toBe(true);
    expect(h.client.crossInserts[0]).toMatchObject({
      female_keeper_id: "mom",
      male_keeper_id: "dad",
      cross_type: "standard_f1",
    });
  });

  it("a reversed male donor → feminized_cross", async () => {
    h.client = makeSupabase({ reversedKeeperIds: ["dad"] });
    const r = await recordCross({ femaleKeeperId: "mom", maleKeeperId: "dad" });
    expect(r.ok).toBe(true);
    expect(h.client.crossInserts[0].cross_type).toBe("feminized_cross");
    expect(h.client.crossInserts[0].male_keeper_id).toBe("dad");
  });

  it("selfing a reversed keeper (null male) → selfing_s1 with male_keeper_id null", async () => {
    h.client = makeSupabase({ reversedKeeperIds: ["mom"] });
    const r = await recordCross({ femaleKeeperId: "mom", maleKeeperId: null });
    expect(r.ok).toBe(true);
    expect(h.client.crossInserts[0].cross_type).toBe("selfing_s1");
    expect(h.client.crossInserts[0].male_keeper_id).toBeNull();
  });

  it("male id equal to the mother is treated as selfing", async () => {
    h.client = makeSupabase({ reversedKeeperIds: ["mom"] });
    const r = await recordCross({ femaleKeeperId: "mom", maleKeeperId: "mom" });
    expect(r.ok).toBe(true);
    expect(h.client.crossInserts[0].cross_type).toBe("selfing_s1");
    expect(h.client.crossInserts[0].male_keeper_id).toBeNull();
  });

  it("REJECTS selfing an unreversed keeper (no row persisted)", async () => {
    h.client = makeSupabase({ reversedKeeperIds: [] });
    const r = await recordCross({ femaleKeeperId: "mom", maleKeeperId: null });
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.error).toMatch(/revers/i);
    expect(h.client.crossInserts.length).toBe(0);
  });

  it("REJECTS a blank/whitespace donor as an incomplete form — never silent selfing", async () => {
    // A blank maleKeeperId is an omitted donor, NOT an intent to self. Even for
    // a reversed mother it must be rejected (with the "pollen donor" message),
    // not recorded as an S1. Preserves classifyCross's null-vs-blank guard.
    for (const blank of ["", "   "]) {
      h.client = makeSupabase({ reversedKeeperIds: ["mom"] });
      const r = await recordCross({ femaleKeeperId: "mom", maleKeeperId: blank });
      expect(r.ok).toBe(false);
      if (r.ok === false) expect(r.error).toMatch(/pollen donor/i);
      expect(h.client.crossInserts.length).toBe(0);
    }
  });

  it("rejects when signed out", async () => {
    h.client = makeSupabase({ userId: null });
    expect((await recordCross({ femaleKeeperId: "mom", maleKeeperId: "dad" })).ok).toBe(false);
  });
});
