import { describe, it, expect } from "vitest";
import {
  PHENO_KEEPER_DECISIONS,
  PHENO_KEEPER_DECISION_CAVEAT,
  DEFAULT_KEEPER_DECISION,
  normalizeKeeperDecision,
  keeperDecisionLabel,
  buildKeeperDecisionView,
  summarizeKeeperDecisions,
} from "@/lib/phenoKeeperDecisionModel";

describe("normalizeKeeperDecision", () => {
  it("accepts the four known decisions, case/space-insensitively", () => {
    expect(normalizeKeeperDecision("keep")).toBe("keep");
    expect(normalizeKeeperDecision(" CULL ")).toBe("cull");
    expect(normalizeKeeperDecision("Hold")).toBe("hold");
    expect(normalizeKeeperDecision("undecided")).toBe("undecided");
  });
  it("defaults unknown/garbage to undecided (never guesses keep/cull)", () => {
    for (const v of ["", "maybe", "delete", "yes", null, undefined, 3, {}]) {
      expect(normalizeKeeperDecision(v as unknown)).toBe("undecided");
    }
  });
  it("exposes exactly keep/cull/hold/undecided", () => {
    expect([...PHENO_KEEPER_DECISIONS]).toEqual(["keep", "cull", "hold", "undecided"]);
    expect(DEFAULT_KEEPER_DECISION).toBe("undecided");
  });
});

describe("keeperDecisionLabel", () => {
  it("maps each decision to a human label", () => {
    expect(keeperDecisionLabel("keep")).toBe("Keep");
    expect(keeperDecisionLabel("cull")).toBe("Cull");
    expect(keeperDecisionLabel("hold")).toBe("Hold");
    expect(keeperDecisionLabel("undecided")).toBe("Undecided");
  });
});

describe("buildKeeperDecisionView", () => {
  it("normalizes decision, keeps note/decidedAt, and marks recorded state", () => {
    const v = buildKeeperDecisionView({
      candidateId: "p1",
      candidateLabel: "BD #1",
      decision: "KEEP",
      decidedAt: "2026-03-01T00:00:00Z",
      note: "frostiest of the batch",
    });
    expect(v).toMatchObject({
      candidateId: "p1",
      candidateLabel: "BD #1",
      decision: "keep",
      decisionLabel: "Keep",
      decidedAt: "2026-03-01T00:00:00Z",
      note: "frostiest of the batch",
      isRecorded: true,
    });
  });
  it("treats undecided as not recorded and falls back to candidateId for a blank label", () => {
    const v = buildKeeperDecisionView({ candidateId: "abc", candidateLabel: "  " });
    expect(v.decision).toBe("undecided");
    expect(v.isRecorded).toBe(false);
    expect(v.candidateLabel).toBe("abc");
  });
});

describe("summarizeKeeperDecisions", () => {
  it("tallies decisions and preserves input order (never ranks candidates)", () => {
    const summary = summarizeKeeperDecisions([
      { candidateId: "c1", decision: "cull" },
      { candidateId: "c2", decision: "keep" },
      { candidateId: "c3", decision: "keep" },
      { candidateId: "c4" }, // undecided
      { candidateId: "c5", decision: "hold" },
    ]);
    expect(summary.candidates.map((c) => c.candidateId)).toEqual(["c1", "c2", "c3", "c4", "c5"]);
    expect(summary.tally).toEqual({ keep: 2, cull: 1, hold: 1, undecided: 1 });
    expect(summary.recordedCount).toBe(4);
    expect(summary.undecidedCount).toBe(1);
  });

  it("always carries the suggest-only caveat (recording does nothing on its own)", () => {
    const summary = summarizeKeeperDecisions([{ candidateId: "c1", decision: "cull" }]);
    expect(summary.caveat).toBe(PHENO_KEEPER_DECISION_CAVEAT);
    expect(summary.caveat.toLowerCase()).toContain("never");
    // The model exposes no execute/apply/delete affordance — decisions are data.
    expect(Object.keys(summary)).not.toContain("execute");
    expect(Object.keys(summary)).not.toContain("apply");
  });

  it("skips garbage rows and handles null/undefined input", () => {
    expect(summarizeKeeperDecisions(null).candidates).toEqual([]);
    expect(summarizeKeeperDecisions(undefined).tally).toEqual({
      keep: 0,
      cull: 0,
      hold: 0,
      undecided: 0,
    });
    const summary = summarizeKeeperDecisions([
      { candidateId: "a", decision: "keep" },
      { candidateId: "" } as never,
    ]);
    expect(summary.candidates.map((c) => c.candidateId)).toEqual(["a"]);
  });
});
