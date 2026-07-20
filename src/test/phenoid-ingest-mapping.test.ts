import { describe, it, expect } from "vitest";
import {
  stageToRound,
  isStageFallback,
  DEFAULT_ROUND,
  rescale0to10to1to5,
  winnerScoreFromAxes,
  verdictToDecision,
  classifyTag,
  verdictToStressRecommendation,
  resolveCandidateIdentity,
  buildPhenoidExtras,
  buildCoreLoudTraits,
  type PhenoIdCandidateInput,
} from "@/lib/phenoIdIngestMapping";

describe("stageToRound — verified PhenoID chip vocab", () => {
  it("maps every chip", () => {
    expect(stageToRound("Veg")).toBe("veg");
    expect(stageToRound("Early flower")).toBe("early_flower");
    expect(stageToRound("Flower")).toBe("mid_flower");
    expect(stageToRound("Late flower")).toBe("late_flower");
    expect(stageToRound("Flush")).toBe("late_flower");
    expect(stageToRound("Dry")).toBe("post_cure");
  });
  it("is case-insensitive and trims", () => {
    expect(stageToRound("  eARLY FLOWER ")).toBe("early_flower");
    expect(stageToRound("dry")).toBe("post_cure");
  });
  it("falls back to mid_flower for Unknown / blank / free-text", () => {
    expect(stageToRound("Unknown")).toBe(DEFAULT_ROUND);
    expect(stageToRound("")).toBe("mid_flower");
    expect(stageToRound(null)).toBe("mid_flower");
    expect(stageToRound("week 5 gassy")).toBe("mid_flower");
  });
  it("flags fallback vs known", () => {
    expect(isStageFallback("Flush")).toBe(false);
    expect(isStageFallback("whatever")).toBe(true);
    expect(isStageFallback("")).toBe(true);
  });
});

describe("rescale0to10to1to5", () => {
  it("hits the documented anchors (0→1, 5→3, 10→5)", () => {
    expect(rescale0to10to1to5(0)).toBe(1);
    expect(rescale0to10to1to5(5)).toBe(3);
    expect(rescale0to10to1to5(10)).toBe(5);
  });
  it("stays within 1..5 and clamps out-of-range input", () => {
    for (let r = 0; r <= 10; r++) {
      const v = rescale0to10to1to5(r);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(5);
    }
    expect(rescale0to10to1to5(-4)).toBe(1);
    expect(rescale0to10to1to5(99)).toBe(5);
  });
});

describe("winnerScoreFromAxes — PhenoID weights (nose30/resin25/structure15/yield15/breeding15)", () => {
  it("all-10 → 100, all-0 → 0", () => {
    expect(winnerScoreFromAxes({ nose: 10, resin: 10, structure: 10, yield: 10, breeding: 10 })).toBe(100);
    expect(winnerScoreFromAxes({ nose: 0, resin: 0, structure: 0, yield: 0, breeding: 0 })).toBe(0);
  });
  it("computes a mixed set", () => {
    // 8*3 + 7*2.5 + 6*1.5 + 5*1.5 + 7*1.5 = 68.5 → 69
    expect(winnerScoreFromAxes({ nose: 8, resin: 7, structure: 6, yield: 5, breeding: 7 })).toBe(69);
  });
});

describe("verdictToDecision", () => {
  it("keep→keep, maybe→hold, cull→cull, else→undecided", () => {
    expect(verdictToDecision("keep")).toBe("keep");
    expect(verdictToDecision("maybe")).toBe("hold");
    expect(verdictToDecision("cull")).toBe("cull");
    expect(verdictToDecision("")).toBe("undecided");
    expect(verdictToDecision(null)).toBe("undecided");
    expect(verdictToDecision("KEEP")).toBe("keep");
  });
});

describe("classifyTag", () => {
  it("routes herm, agronomic stress, and free-text notes", () => {
    expect(classifyTag("Herm")).toEqual({ kind: "herm" });
    expect(classifyTag("nanner")).toEqual({ kind: "herm" });
    expect(classifyTag("Foxtail")).toEqual({ kind: "stress", factor: "foxtail" });
    expect(classifyTag("Mold risk")).toEqual({ kind: "stress", factor: "mold" });
    expect(classifyTag("Pests")).toEqual({ kind: "stress", factor: "pests" });
    expect(classifyTag("Resin bomb")).toEqual({ kind: "note", text: "Resin bomb" });
  });
});

describe("verdictToStressRecommendation", () => {
  it("cull→reject, maybe→watch, keep→keep", () => {
    expect(verdictToStressRecommendation("cull")).toBe("reject");
    expect(verdictToStressRecommendation("maybe")).toBe("watch");
    expect(verdictToStressRecommendation("keep")).toBe("keep");
    expect(verdictToStressRecommendation(null)).toBe("keep");
  });
});

describe("resolveCandidateIdentity", () => {
  it("numeric label → candidate_number", () => {
    expect(resolveCandidateIdentity("12")).toEqual({ candidateNumber: 12, candidateLabel: null });
  });
  it("non-numeric label → candidate_label", () => {
    expect(resolveCandidateIdentity("Sour Zebra")).toEqual({ candidateNumber: null, candidateLabel: "Sour Zebra" });
  });
  it("zero / negative / blank are not positive integers", () => {
    expect(resolveCandidateIdentity("0")).toEqual({ candidateNumber: null, candidateLabel: "0" });
    expect(resolveCandidateIdentity("-3")).toEqual({ candidateNumber: null, candidateLabel: "-3" });
    expect(resolveCandidateIdentity("")).toEqual({ candidateNumber: null, candidateLabel: null });
    expect(resolveCandidateIdentity(null)).toEqual({ candidateNumber: null, candidateLabel: null });
  });
});

describe("buildPhenoidExtras — nothing dropped", () => {
  const c: PhenoIdCandidateInput = {
    phenoid_uuid: "pid-1",
    loud: { nose: 8, resin: 7, structure: 6, yield: 5, breeding: 7 },
    winner_score: 82,
    rating: 4,
    scored_by: "MC",
    cut_status: "vault",
    loud_shortlist: true,
    pack: { label: "Gelato41 x Sherb", index: 3, size: 10 },
    capture: { mode: "burst", stack_id: "s-77", frame_index: 0, model_id: "t-v3", model_version: "3.1.0" },
  };
  it("preserves the composite + raw axes verbatim", () => {
    const r = buildPhenoidExtras(c);
    expect(r.winner_score).toBe(82); // imported value is authoritative, not recomputed
    expect(r.nose_score).toBe(8);
    expect(r.breeding_score).toBe(7);
    expect(r.cut_status).toBe("vault");
    expect(r.loud_shortlist).toBe(true);
    expect(r.pack_label).toBe("Gelato41 x Sherb");
    expect(r.capture_mode).toBe("burst");
    expect(r.source).toBe("phenoid");
  });
  it("defaults missing fields and rejects an invalid cut_status → none", () => {
    const r = buildPhenoidExtras({ phenoid_uuid: "pid-2", cut_status: "bogus" });
    expect(r.cut_status).toBe("none");
    expect(r.winner_score).toBeNull();
    expect(r.nose_score).toBeNull();
    expect(r.scored_by).toBe("");
    expect(r.capture_mode).toBe("standard");
  });
});

describe("buildCoreLoudTraits — nose direct, others rescaled", () => {
  it("nose stays 0–10; resin/structure/yield/breeding rescale to 1–5", () => {
    const t = buildCoreLoudTraits({ nose: 8, resin: 10, structure: 5, yield: 0, breeding: 7 });
    expect(t.nose_loudness).toBe(8);
    expect(t.resin).toBe(5); // 10 → 5
    expect(t.structure).toBe(3); // 5 → 3
    expect(t.yield).toBe(1); // 0 → 1
    expect(t.breeding).toBe(rescale0to10to1to5(7));
  });
  it("omits axes that were not provided", () => {
    const t = buildCoreLoudTraits({ nose: 4 });
    expect(t).toEqual({ nose_loudness: 4 });
  });
});
