/**
 * phenoCloneInsuranceRules — pure clone-insurance model.
 *
 * Covers the stage-aware status machine, the suggest-only posture, the
 * hunt-level summary ordering, and a static-safety scan of the module.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  classifyCloningPhase,
  cloneInsuranceBannerCopy,
  CLONE_INSURANCE_CAVEAT,
  evaluateCloneInsurance,
  summarizeCloneInsurance,
  type CloneInsuranceInput,
} from "@/lib/phenoCloneInsuranceRules";

function candidate(overrides: Partial<CloneInsuranceInput> = {}): CloneInsuranceInput {
  return {
    candidateId: "plant-1",
    candidateNumber: 1,
    stage: "veg",
    hasPreservedClone: false,
    keeperDecision: "undecided",
    ...overrides,
  };
}

describe("classifyCloningPhase", () => {
  it("separates pre-flower from deep flower", () => {
    expect(classifyCloningPhase("preflower")).toBe("preflower");
    expect(classifyCloningPhase("pre-flower")).toBe("preflower");
    expect(classifyCloningPhase("flip")).toBe("preflower");
    expect(classifyCloningPhase("transition")).toBe("preflower");
    expect(classifyCloningPhase("flowering")).toBe("flower");
    expect(classifyCloningPhase("bloom")).toBe("flower");
  });

  it("maps harvest and cure vocabulary to past phases", () => {
    expect(classifyCloningPhase("harvest")).toBe("harvest");
    expect(classifyCloningPhase("chop")).toBe("harvest");
    expect(classifyCloningPhase("drying")).toBe("post");
    expect(classifyCloningPhase("curing")).toBe("post");
    expect(classifyCloningPhase("archived")).toBe("post");
  });

  it("treats veg / seedling / unknown honestly", () => {
    expect(classifyCloningPhase("veg")).toBe("veg");
    expect(classifyCloningPhase("seedling")).toBe("seedling");
    expect(classifyCloningPhase("")).toBe("unknown");
    expect(classifyCloningPhase(null)).toBe("unknown");
    expect(classifyCloningPhase("some-custom-stage")).toBe("unknown");
  });
});

describe("evaluateCloneInsurance — status machine", () => {
  it("a recorded clone is insured regardless of stage or decision", () => {
    const e = evaluateCloneInsurance(
      candidate({ hasPreservedClone: true, stage: "flowering", keeperDecision: "keep" }),
    );
    expect(e.status).toBe("insured");
    expect(e.isActionable).toBe(false);
  });

  it("counts clones for the insured detail copy", () => {
    const one = evaluateCloneInsurance(candidate({ cloneCount: 1, hasPreservedClone: false }));
    expect(one.status).toBe("insured");
    expect(one.detail).toContain("A clone is recorded");
    const many = evaluateCloneInsurance(candidate({ cloneCount: 3 }));
    expect(many.detail).toContain("3 clones are recorded");
  });

  it("a cull decision suppresses the nudge", () => {
    const e = evaluateCloneInsurance(
      candidate({ stage: "flowering", keeperDecision: "cull" }),
    );
    expect(e.status).toBe("not_applicable");
    expect(e.isActionable).toBe(false);
    expect(e.headline).toBe("Marked to cull");
  });

  it("in flower with no clone is at_risk / closing_window", () => {
    const e = evaluateCloneInsurance(candidate({ stage: "flowering" }));
    expect(e.status).toBe("at_risk");
    expect(e.window).toBe("closing_window");
    expect(e.isActionable).toBe(true);
    expect(e.detail).toMatch(/re-vegetate/);
  });

  it("pre-flower with no clone is at_risk / prime_window", () => {
    const e = evaluateCloneInsurance(candidate({ stage: "preflower" }));
    expect(e.status).toBe("at_risk");
    expect(e.window).toBe("prime_window");
  });

  it("harvested with no clone is may_be_lost / past", () => {
    const e = evaluateCloneInsurance(candidate({ stage: "harvest" }));
    expect(e.status).toBe("may_be_lost");
    expect(e.window).toBe("past");
    expect(e.isActionable).toBe(true);
    expect(e.detail).toMatch(/can't be recovered/);
  });

  it("veg with a keep decision is an emergency even though the stage is early", () => {
    const e = evaluateCloneInsurance(candidate({ stage: "veg", keeperDecision: "keep" }));
    expect(e.status).toBe("at_risk");
    expect(e.window).toBe("prime_window");
    expect(e.headline).toMatch(/Clone it now/);
  });

  it("hold behaves like keep for insurance intent", () => {
    const e = evaluateCloneInsurance(candidate({ stage: "veg", keeperDecision: "hold" }));
    expect(e.status).toBe("at_risk");
  });

  it("plain veg with no intent is not nagged (avoids whole-population noise)", () => {
    const e = evaluateCloneInsurance(candidate({ stage: "veg", keeperDecision: "undecided" }));
    expect(e.status).toBe("not_applicable");
    expect(e.window).toBe("before_flower");
    expect(e.isActionable).toBe(false);
  });

  it("is deterministic and null-safe on sparse input", () => {
    const a = evaluateCloneInsurance({ candidateId: "p" });
    const b = evaluateCloneInsurance({ candidateId: "p" });
    expect(a).toEqual(b);
    expect(a.displayLabel).toContain("#");
  });
});

describe("summarizeCloneInsurance", () => {
  const inputs: CloneInsuranceInput[] = [
    candidate({ candidateId: "p1", candidateNumber: 1, stage: "veg", keeperDecision: "undecided" }), // n/a
    candidate({ candidateId: "p2", candidateNumber: 2, stage: "flowering" }), // at_risk closing (100)
    candidate({ candidateId: "p3", candidateNumber: 3, stage: "preflower" }), // at_risk prime (150)
    candidate({ candidateId: "p4", candidateNumber: 4, stage: "harvest" }), // may_be_lost (200)
    candidate({ candidateId: "p5", candidateNumber: 5, hasPreservedClone: true, stage: "flowering" }), // insured
    candidate({ candidateId: "p6", candidateNumber: 6, stage: "veg", keeperDecision: "keep" }), // at_risk prime (120)
  ];

  it("tallies each status", () => {
    const s = summarizeCloneInsurance(inputs);
    expect(s.total).toBe(6);
    expect(s.insuredCount).toBe(1);
    expect(s.atRiskCount).toBe(3);
    expect(s.mayBeLostCount).toBe(1);
    expect(s.notApplicableCount).toBe(1);
    expect(s.hasActionable).toBe(true);
  });

  it("orders actionable items most-time-critical first (in flower, keep-intent, pre-flower, then lost)", () => {
    const s = summarizeCloneInsurance(inputs);
    expect(s.actionable.map((e) => e.candidateId)).toEqual(["p2", "p6", "p3", "p4"]);
  });

  it("empty and non-array input is safe", () => {
    expect(summarizeCloneInsurance([]).total).toBe(0);
    expect(summarizeCloneInsurance(null as unknown as CloneInsuranceInput[]).total).toBe(0);
  });
});

describe("cloneInsuranceBannerCopy", () => {
  it("names live risk, past loss, both, or all-clear", () => {
    expect(cloneInsuranceBannerCopy(summarizeCloneInsurance([candidate({ stage: "flowering" })]))).toMatch(
      /could be lost at harvest/,
    );
    expect(cloneInsuranceBannerCopy(summarizeCloneInsurance([candidate({ stage: "harvest" })]))).toMatch(
      /still alive/,
    );
    const both = summarizeCloneInsurance([
      candidate({ candidateId: "a", stage: "flowering" }),
      candidate({ candidateId: "b", stage: "harvest" }),
    ]);
    expect(cloneInsuranceBannerCopy(both)).toMatch(/already harvested/);
    const clear = summarizeCloneInsurance([candidate({ hasPreservedClone: true, stage: "flowering" })]);
    expect(cloneInsuranceBannerCopy(clear)).toMatch(/has a clone recorded/);
  });
});

describe("static safety — module source", () => {
  const src = readFileSync(path.resolve(__dirname, "../lib/phenoCloneInsuranceRules.ts"), "utf8");

  it("is pure: no I/O, React, Supabase, AI, or writes", () => {
    expect(src).not.toMatch(/from ["'][^"']*supabase/i);
    expect(src).not.toMatch(/from ["']react["']/);
    expect(src).not.toMatch(/\bfetch\(|\.rpc\(|functions\.invoke|\.insert\(|\.update\(|\.delete\(/);
    expect(src).not.toMatch(/\bnew Date\(|Date\.now\(|Math\.random\(/);
    expect(src).not.toMatch(/openai|anthropic|claude|gemini/i);
  });

  it("keeps the suggest-only posture: never acts on a plant, never names a winner", () => {
    expect(src).not.toMatch(/\bautomatically\b|\bauto-?cull\b|\bauto-?clone\b|autopilot/i);
    expect(src).not.toMatch(/\b(best|winner|top pick|the keeper)\b/i);
    // The word "cull" appears only in describing the grower's own recorded
    // decision, never as an action Verdant takes.
    expect(CLONE_INSURANCE_CAVEAT).toMatch(/never takes, roots, or culls/);
  });

  it("delegates label + decision normalization to the canonical helpers", () => {
    expect(src).toMatch(/from "@\/lib\/phenoCandidateLabel"/);
    expect(src).toMatch(/from "@\/lib\/phenoKeeperDecisionModel"/);
  });
});
