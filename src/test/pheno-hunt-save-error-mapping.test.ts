/**
 * pheno-hunt-save-error-mapping — grower-facing copy for failed hunt saves.
 *
 * Regression for the raw-RLS-leak bug: a non-Pro write that reached the
 * server was rejected by the RESTRICTIVE `pheno_hunts_pro_required_insert`
 * policy and the wizard toasted the verbatim Postgres text
 * (`new row violates row-level security policy …`). The save error path must
 * map every entitlement/RLS denial — including ones wrapped in
 * PhenoHuntError, and ones surfacing on the candidate-tagging step — to the
 * same friendly copy as the pre-write guard, while non-entitlement failures
 * keep their message so real bugs stay diagnosable.
 */
import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createPhenoHunt,
  isPhenoEntitlementDenial,
  phenoHuntSaveErrorMessage,
  PhenoHuntError,
  PHENO_TRACKER_PRO_REQUIRED_MESSAGE,
} from "@/lib/phenoHuntService";

const RAW_RLS_MESSAGE =
  'new row violates row-level security policy "pheno_hunts_pro_required_insert" for table "pheno_hunts"';

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
    for (const kind of ["eq", "is", "in"]) {
      chain[kind] = () => chain;
    }
    chain.single = () => Promise.resolve(respond(call));
    chain.maybeSingle = () => Promise.resolve(respond(call));
    chain.then = (
      onFulfilled: (v: unknown) => unknown,
      onRejected?: (e: unknown) => unknown,
    ) => Promise.resolve(respond(call)).then(onFulfilled, onRejected);
    return chain;
  }
  return { from: builder } as unknown as SupabaseClient;
}

describe("phenoHuntSaveErrorMessage", () => {
  it("maps the exact pheno_hunts_pro_required_insert RLS text to the friendly Pro copy", () => {
    const err = new PhenoHuntError(RAW_RLS_MESSAGE, { message: RAW_RLS_MESSAGE, code: "42501" });
    const copy = phenoHuntSaveErrorMessage(err);
    expect(copy).toBe(PHENO_TRACKER_PRO_REQUIRED_MESSAGE);
    expect(copy).not.toMatch(/row-level security/i);
    expect(copy).not.toMatch(/pheno_hunts_pro_required_insert/);
  });

  it("maps a 42501 code even when the message is uninformative", () => {
    expect(isPhenoEntitlementDenial({ code: "42501", message: "insert rejected" })).toBe(true);
  });

  it("maps permission-denied and pro_required message variants", () => {
    expect(isPhenoEntitlementDenial(new Error("permission denied for table pheno_hunts"))).toBe(
      true,
    );
    expect(isPhenoEntitlementDenial(new Error("policy pheno_hunts_pro_required_insert"))).toBe(
      true,
    );
  });

  it("detects a denial wrapped only in the PhenoHuntError cause", () => {
    const err = new PhenoHuntError("Could not create pheno hunt.", { code: "42501" });
    expect(phenoHuntSaveErrorMessage(err)).toBe(PHENO_TRACKER_PRO_REQUIRED_MESSAGE);
  });

  it("keeps non-entitlement failures diagnosable (message passes through)", () => {
    expect(phenoHuntSaveErrorMessage(new Error("Network request failed"))).toBe(
      "Network request failed",
    );
  });

  it("falls back to generic copy for message-less throws", () => {
    expect(phenoHuntSaveErrorMessage(undefined)).toBe("Could not create pheno hunt");
    expect(phenoHuntSaveErrorMessage({})).toBe("Could not create pheno hunt");
  });
});

describe("createPhenoHunt → save error copy (integration)", () => {
  it("an RLS-rejected hunt insert maps to the friendly Pro copy", async () => {
    const client = makeFakeClient((call) => {
      if (call.table === "pheno_hunts" && call.op === "insert") {
        return { data: null, error: { message: RAW_RLS_MESSAGE, code: "42501" } };
      }
      return { data: null, error: null };
    });
    let thrown: unknown;
    try {
      await createPhenoHunt({ growId: "g1", name: "Hunt", plantIds: ["p1"] }, client);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(PhenoHuntError);
    expect(phenoHuntSaveErrorMessage(thrown)).toBe(PHENO_TRACKER_PRO_REQUIRED_MESSAGE);
  });

  it("an RLS-rejected candidate-tag update also maps to the friendly Pro copy", async () => {
    const client = makeFakeClient((call) => {
      if (call.table === "pheno_hunts" && call.op === "insert") {
        return { data: { id: "h1" }, error: null };
      }
      if (call.table === "plants" && call.op === "update") {
        return {
          data: null,
          error: { message: 'new row violates row-level security policy for table "plants"' },
        };
      }
      return { data: null, error: null };
    });
    let thrown: unknown;
    try {
      await createPhenoHunt({ growId: "g1", name: "Hunt", plantIds: ["p1"] }, client);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(PhenoHuntError);
    expect(phenoHuntSaveErrorMessage(thrown)).toBe(PHENO_TRACKER_PRO_REQUIRED_MESSAGE);
  });

  it("a non-RLS insert failure keeps its diagnosable message", async () => {
    const client = makeFakeClient((call) => {
      if (call.table === "pheno_hunts" && call.op === "insert") {
        return { data: null, error: { message: "connection reset" } };
      }
      return { data: null, error: null };
    });
    let thrown: unknown;
    try {
      await createPhenoHunt({ growId: "g1", name: "Hunt", plantIds: ["p1"] }, client);
    } catch (err) {
      thrown = err;
    }
    expect(phenoHuntSaveErrorMessage(thrown)).toBe("connection reset");
  });
});
