import { describe, it, expect, vi, beforeEach } from "vitest";

// Chainable stub for the one batched diary_entries read. Records every call
// so the tests can prove single-query behavior and filter composition.
const calls: Array<{ method: string; args: unknown[] }> = [];
let resolveWith: { data: unknown[] | null; error: unknown } = { data: [], error: null };

function makeChain() {
  const chain: Record<string, unknown> = {};
  const record =
    (method: string) =>
    (...args: unknown[]) => {
      calls.push({ method, args });
      return chain;
    };
  for (const m of ["select", "in", "eq", "order"]) chain[m] = record(m);
  chain.limit = (...args: unknown[]) => {
    calls.push({ method: "limit", args });
    return Promise.resolve(resolveWith);
  };
  return chain;
}

const fromMock = vi.fn((table: string) => {
  calls.push({ method: "from", args: [table] });
  return makeChain();
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (table: string) => fromMock(table) },
}));

import {
  loadPhenoEvidenceReceiptRows,
  PHENO_EVIDENCE_PACKET_MAX_PLANT_IDS,
  PHENO_EVIDENCE_PACKET_ROW_CAP,
} from "@/lib/phenoEvidenceReceiptService";

beforeEach(() => {
  calls.length = 0;
  fromMock.mockClear();
  resolveWith = { data: [], error: null };
});

describe("loadPhenoEvidenceReceiptRows — bounded batch read", () => {
  it("issues exactly ONE diary_entries query for a whole candidate page", async () => {
    const res = await loadPhenoEvidenceReceiptRows({
      huntId: "hunt-1",
      plantIds: Array.from({ length: 30 }, (_, i) => `plant-${i}`),
    });
    expect(res.ok).toBe(true);
    expect(fromMock).toHaveBeenCalledTimes(1);
    expect(fromMock).toHaveBeenCalledWith("diary_entries");
  });

  it("deduplicates plant ids and drops blank/invalid ones", async () => {
    await loadPhenoEvidenceReceiptRows({
      huntId: "hunt-1",
      plantIds: ["p1", "p1", "  ", "p2", "p1", "p2"],
    });
    const inCall = calls.find((c) => c.method === "in")!;
    expect(inCall.args[0]).toBe("plant_id");
    expect(inCall.args[1]).toEqual(["p1", "p2"]);
  });

  it("filters by receipt kind AND hunt id server-side, ordered stably, capped", async () => {
    await loadPhenoEvidenceReceiptRows({ huntId: "hunt-9", plantIds: ["p1"] });
    const eqCalls = calls.filter((c) => c.method === "eq");
    expect(eqCalls).toEqual([
      { method: "eq", args: ["details->>kind", "pheno_evidence_receipt"] },
      { method: "eq", args: ["details->>hunt_id", "hunt-9"] },
    ]);
    const orderCalls = calls.filter((c) => c.method === "order");
    expect(orderCalls[0].args).toEqual(["entry_at", { ascending: false }]);
    expect(orderCalls[1].args).toEqual(["id", { ascending: true }]);
    const limitCall = calls.find((c) => c.method === "limit")!;
    expect(limitCall.args[0]).toBe(PHENO_EVIDENCE_PACKET_ROW_CAP);
  });

  it("caps the plant-id list and reports truncation honestly", async () => {
    const ids = Array.from(
      { length: PHENO_EVIDENCE_PACKET_MAX_PLANT_IDS + 5 },
      (_, i) => `plant-${i}`,
    );
    const res = await loadPhenoEvidenceReceiptRows({ huntId: "hunt-1", plantIds: ids });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.plantIds).toHaveLength(PHENO_EVIDENCE_PACKET_MAX_PLANT_IDS);
      expect(res.truncated).toBe(true);
    }
  });

  it("reports truncation when the row cap is hit", async () => {
    resolveWith = {
      data: Array.from({ length: PHENO_EVIDENCE_PACKET_ROW_CAP }, (_, i) => ({ id: `d${i}` })),
      error: null,
    };
    const res = await loadPhenoEvidenceReceiptRows({ huntId: "hunt-1", plantIds: ["p1"] });
    expect(res.ok && res.truncated).toBe(true);
  });

  it("is not truncated below both caps", async () => {
    resolveWith = { data: [{ id: "d1" }], error: null };
    const res = await loadPhenoEvidenceReceiptRows({ huntId: "hunt-1", plantIds: ["p1", "p2"] });
    expect(res.ok && !res.truncated).toBe(true);
  });

  it("fails closed on missing hunt id / empty ids / query error", async () => {
    expect((await loadPhenoEvidenceReceiptRows({ huntId: "  ", plantIds: ["p1"] })).ok).toBe(
      false,
    );
    expect(fromMock).not.toHaveBeenCalled();
    expect((await loadPhenoEvidenceReceiptRows({ huntId: "h", plantIds: [] })).ok).toBe(false);
    resolveWith = { data: null, error: { message: "boom" } };
    const res = await loadPhenoEvidenceReceiptRows({ huntId: "h", plantIds: ["p1"] });
    expect(res.ok).toBe(false);
  });

  it("never sends a client-supplied owner/user id", async () => {
    await loadPhenoEvidenceReceiptRows({ huntId: "hunt-1", plantIds: ["p1"] });
    const serialized = JSON.stringify(calls);
    expect(serialized).not.toMatch(/user_id|owner_id/);
  });
});
