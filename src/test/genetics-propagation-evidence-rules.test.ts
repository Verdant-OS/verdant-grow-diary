import { describe, it, expect } from "vitest";
import {
  computeEvidence,
  evidenceStateLabel,
  scopedNegativeCopy,
  isReassuring,
} from "@/lib/genetics/screeningEvidenceRules";

describe("screening evidence rules — honesty invariants", () => {
  it("is untested with no rows and never reassuring", () => {
    const s = computeEvidence([]);
    expect(s.state).toBe("untested");
    expect(s.hasEvidence).toBe(false);
    expect(isReassuring(s)).toBe(false);
  });

  it("never maps not_tested or inconclusive to negative or clean", () => {
    const notTested = computeEvidence([{ target: "HLVd", result: "not_tested" }]);
    expect(notTested.state).toBe("inconclusive");
    expect(isReassuring(notTested)).toBe(false);

    const inconclusive = computeEvidence([{ target: "HLVd", result: "inconclusive" }]);
    expect(inconclusive.state).toBe("inconclusive");
    expect(isReassuring(inconclusive)).toBe(false);
  });

  it("is worst-wins: any positive dominates a negative on another target", () => {
    const s = computeEvidence([
      { target: "HLVd", result: "negative", collectedDate: "2026-07-10" },
      { target: "Fusarium", result: "positive", collectedDate: "2026-07-10" },
    ]);
    expect(s.state).toBe("positive");
  });

  it("keeps only the latest current result per target", () => {
    const s = computeEvidence([
      { target: "HLVd", result: "positive", collectedDate: "2026-07-01" },
      { target: "HLVd", result: "negative", collectedDate: "2026-07-15" },
    ]);
    expect(s.state).toBe("negative_scoped");
    expect(s.targets).toHaveLength(1);
    expect(s.targets[0].result).toBe("negative");
  });

  it("excludes superseded rows from current posture", () => {
    const s = computeEvidence([
      { id: "a", target: "HLVd", result: "negative", collectedDate: "2026-07-10" },
      { id: "b", target: "HLVd", result: "positive", collectedDate: "2026-07-12", supersedesId: "a" },
    ]);
    // 'a' is superseded by 'b' (positive) → posture is positive, not negative.
    expect(s.state).toBe("positive");
  });

  it("is only reassuring for an all-negative posture with evidence", () => {
    const allNeg = computeEvidence([
      { target: "HLVd", result: "negative", collectedDate: "2026-07-10" },
      { target: "Fusarium", result: "negative", collectedDate: "2026-07-10" },
    ]);
    expect(allNeg.state).toBe("negative_scoped");
    expect(isReassuring(allNeg)).toBe(true);

    // A negative alongside an untested target degrades to inconclusive... no — an
    // untested target simply has no row, so it does not appear; but an explicit
    // not_tested row keeps it honest.
    const mixed = computeEvidence([
      { target: "HLVd", result: "negative", collectedDate: "2026-07-10" },
      { target: "Fusarium", result: "not_tested" },
    ]);
    expect(mixed.state).toBe("inconclusive");
    expect(isReassuring(mixed)).toBe(false);
  });

  it("drops malformed/unknown results rather than coercing to negative", () => {
    const s = computeEvidence([
      { target: "HLVd", result: "clean" as unknown as string },
      { target: "", result: "negative" },
      { result: "negative" },
    ]);
    expect(s.state).toBe("untested");
    expect(s.hasEvidence).toBe(false);
  });

  it("labels stay scoped and never say clean / pathogen-free", () => {
    expect(evidenceStateLabel("negative_scoped")).toBe("Negative (scoped)");
    expect(evidenceStateLabel("untested")).toBe("Not tested");
    expect(scopedNegativeCopy("HLVd", "2026-07-20")).toBe("Negative for HLVd on 2026-07-20");
    expect(scopedNegativeCopy("HLVd", null)).toBe("Negative for HLVd (date unrecorded)");
    for (const label of [
      evidenceStateLabel("positive"),
      evidenceStateLabel("inconclusive"),
      evidenceStateLabel("negative_scoped"),
      evidenceStateLabel("untested"),
    ]) {
      expect(label.toLowerCase()).not.toMatch(/pathogen[- ]?free|clean|healthy/);
    }
  });
});
