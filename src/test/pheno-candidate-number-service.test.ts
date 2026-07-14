/**
 * pheno-candidate-number-service — the client write path for owner-only
 * candidate-number assignment. Verifies the NULL→positive write shape and that
 * every database rejection maps to a calm, correctly-classified message. The
 * database trigger remains authoritative — these tests pin the client's honest
 * translation of its verdicts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const maybeSingle = vi.fn();
const isSpy = vi.fn();
const eqSpy = vi.fn();
const updateSpy = vi.fn();

vi.mock("@/integrations/supabase/phenoTables", () => ({
  phenoDb: {
    from: (table: string) => {
      expect(table).toBe("plants");
      return {
        update: (values: unknown) => {
          updateSpy(values);
          return {
            eq: (col: string, val: unknown) => {
              eqSpy(col, val);
              return {
                is: (col2: string, val2: unknown) => {
                  isSpy(col2, val2);
                  return {
                    select: () => ({ maybeSingle: () => maybeSingle() }),
                  };
                },
              };
            },
          };
        },
      };
    },
  },
}));

import {
  assignPhenoCandidateNumber,
  isAssignableCandidateNumber,
  type AssignCandidateNumberFailure,
  type AssignCandidateNumberResult,
} from "@/lib/phenoCandidateNumberService";

function expectFail(res: AssignCandidateNumberResult, reason: AssignCandidateNumberFailure) {
  expect(res).toMatchObject({ ok: false, reason });
  expect(res.ok).toBe(false);
}

beforeEach(() => {
  maybeSingle.mockReset();
  isSpy.mockReset();
  eqSpy.mockReset();
  updateSpy.mockReset();
});

describe("isAssignableCandidateNumber", () => {
  it("accepts only finite positive integers", () => {
    expect(isAssignableCandidateNumber(1)).toBe(true);
    expect(isAssignableCandidateNumber(42)).toBe(true);
    expect(isAssignableCandidateNumber(0)).toBe(false);
    expect(isAssignableCandidateNumber(-3)).toBe(false);
    expect(isAssignableCandidateNumber(1.5)).toBe(false);
    expect(isAssignableCandidateNumber(Number.NaN)).toBe(false);
    expect(isAssignableCandidateNumber("3" as unknown)).toBe(false);
    expect(isAssignableCandidateNumber(null)).toBe(false);
  });
});

describe("assignPhenoCandidateNumber — happy path", () => {
  it("writes NULL→positive and returns the saved number", async () => {
    maybeSingle.mockResolvedValue({ data: { id: "p1", candidate_number: 7 }, error: null });
    const res = await assignPhenoCandidateNumber({ plantId: "p1", candidateNumber: 7 });
    expect(res).toEqual({ ok: true, candidateNumber: 7 });
    expect(updateSpy).toHaveBeenCalledWith({ candidate_number: 7 });
    // Defense-in-depth: only writes rows that are currently unnumbered.
    expect(isSpy).toHaveBeenCalledWith("candidate_number", null);
    expect(eqSpy).toHaveBeenCalledWith("id", "p1");
  });
});

describe("assignPhenoCandidateNumber — client validation (no DB call)", () => {
  it.each([
    ["zero", 0],
    ["negative", -2],
    ["fractional", 2.5],
    ["NaN", Number.NaN],
  ])("rejects %s without touching the database", async (_label, value) => {
    const res = await assignPhenoCandidateNumber({ plantId: "p1", candidateNumber: value });
    expectFail(res, "invalid");
    expect(maybeSingle).not.toHaveBeenCalled();
  });

  it("rejects an empty plant id", async () => {
    const res = await assignPhenoCandidateNumber({ plantId: "   ", candidateNumber: 1 });
    expectFail(res, "invalid");
    expect(maybeSingle).not.toHaveBeenCalled();
  });
});

describe("assignPhenoCandidateNumber — database rejections", () => {
  it("maps unique_violation (23505) to duplicate", async () => {
    maybeSingle.mockResolvedValue({
      data: null,
      error: { code: "23505", message: "duplicate key" },
    });
    expectFail(
      await assignPhenoCandidateNumber({ plantId: "p1", candidateNumber: 3 }),
      "duplicate",
    );
  });

  it("maps ownership denial (42501, 'owning grower') to not_owner", async () => {
    maybeSingle.mockResolvedValue({
      data: null,
      error: {
        code: "42501",
        message: "only the owning grower may set or clear the pheno candidate number",
      },
    });
    expectFail(
      await assignPhenoCandidateNumber({ plantId: "p1", candidateNumber: 3 }),
      "not_owner",
    );
  });

  it("maps entitlement denial (42501, 'Pro subscription') to entitlement", async () => {
    maybeSingle.mockResolvedValue({
      data: null,
      error: {
        code: "42501",
        message:
          "assigning a pheno candidate number requires an active Pro (Pheno Tracker) subscription",
      },
    });
    expectFail(
      await assignPhenoCandidateNumber({ plantId: "p1", candidateNumber: 3 }),
      "entitlement",
    );
  });

  it("maps immutability (23514, 'immutable') to immutable", async () => {
    maybeSingle.mockResolvedValue({
      data: null,
      error: {
        code: "23514",
        message: "the pheno candidate number is immutable within a hunt; untag to clear it",
      },
    });
    expectFail(
      await assignPhenoCandidateNumber({ plantId: "p1", candidateNumber: 3 }),
      "immutable",
    );
  });

  it("maps other check_violation (23514, tag/lineage) to constraint", async () => {
    maybeSingle.mockResolvedValue({
      data: null,
      error: {
        code: "23514",
        message: "a candidate number requires the plant to be tagged to a pheno hunt",
      },
    });
    expectFail(
      await assignPhenoCandidateNumber({ plantId: "p1", candidateNumber: 3 }),
      "constraint",
    );
  });

  it("maps no-row (already numbered / not visible) to stale", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    expectFail(await assignPhenoCandidateNumber({ plantId: "p1", candidateNumber: 3 }), "stale");
  });

  it("maps an unknown error code to network", async () => {
    maybeSingle.mockResolvedValue({
      data: null,
      error: { code: "08006", message: "connection lost" },
    });
    expectFail(await assignPhenoCandidateNumber({ plantId: "p1", candidateNumber: 3 }), "network");
  });

  it("maps a thrown error to network", async () => {
    maybeSingle.mockRejectedValue(new Error("boom"));
    expectFail(await assignPhenoCandidateNumber({ plantId: "p1", candidateNumber: 3 }), "network");
  });

  it("treats a success row that lacks a valid number as network (defensive)", async () => {
    maybeSingle.mockResolvedValue({ data: { id: "p1", candidate_number: null }, error: null });
    expectFail(await assignPhenoCandidateNumber({ plantId: "p1", candidateNumber: 3 }), "network");
  });
});
