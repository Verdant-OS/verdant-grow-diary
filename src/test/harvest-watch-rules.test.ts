/**
 * harvestWatchRules — pure helper tests.
 *
 * Safety fences:
 * - No Supabase imports
 * - No AI/model calls
 * - No Action Queue / alerts / device control
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  calculateReadinessScore,
  deriveDrybackVisibility,
  deriveTrichomePlaceholder,
  DRYBACK_LOWER_CONFIDENCE_LABEL,
  evaluateHarvestWatchEvidenceGate,
  evaluatePhotoPrompt,
  HARVEST_WATCH_EVIDENCE_THRESHOLD,
  predictHarvestWindow,
  READINESS_GATED_COPY,
  type HarvestWatchInput,
} from "@/lib/harvestWatchRules";

const SOURCE = readFileSync(
  resolve(__dirname, "../..", "src/lib/harvestWatchRules.ts"),
  "utf8",
);

function baseInput(overrides: Partial<HarvestWatchInput> = {}): HarvestWatchInput {
  return {
    plantId: "p1",
    plantLabel: "Plant A",
    phenotypeLabel: "Pheno #1",
    daysInFlower: 56,
    expectedHarvestDay: 63,
    priorGrowCount: 2,
    photoEvidenceCount: 2,
    usableDrybackWindowCount: 2,
    irrigationPlantSelectionQuality: "explicit",
    drybackConfidence: "medium",
    daysVsHistoryConfidence: "medium",
    trichome: null,
    lastPhotoAt: "2026-06-17T00:00:00.000Z",
    now: new Date("2026-06-17T12:00:00.000Z"),
    ...overrides,
  };
}

describe("safety fences", () => {
  it("contains no forbidden imports", () => {
    expect(SOURCE).not.toMatch(/from\s+["'][^"']*supabase[^"']*["']/i);
    expect(SOURCE).not.toMatch(/fetch\s*\(/);
    expect(SOURCE).not.toMatch(/from\s+["']react["']/);
  });
});

describe("evidence gate", () => {
  it("hides readiness below 4 total points", () => {
    const r = calculateReadinessScore(
      baseInput({ photoEvidenceCount: 1, usableDrybackWindowCount: 2 }),
    );
    expect(r.score).toBeNull();
    expect(r.gatedReason).toBe(READINESS_GATED_COPY);
  });

  it("shows readiness at exactly 4 evidence points", () => {
    const gate = evaluateHarvestWatchEvidenceGate({
      photoEvidenceCount: 2,
      usableDrybackWindowCount: 2,
    });
    expect(gate.totalPoints).toBe(4);
    expect(gate.threshold).toBe(HARVEST_WATCH_EVIDENCE_THRESHOLD);
    expect(gate.passes).toBe(true);

    const r = calculateReadinessScore(baseInput());
    expect(r.score).not.toBeNull();
  });

  it("accepts mixed evidence (2 photos + 2 dryback windows)", () => {
    const r = calculateReadinessScore(
      baseInput({ photoEvidenceCount: 2, usableDrybackWindowCount: 2 }),
    );
    expect(r.score).not.toBeNull();
  });

  it("rejects negative/NaN counts without claiming healthy data", () => {
    const r = calculateReadinessScore(
      baseInput({
        photoEvidenceCount: -3 as unknown as number,
        usableDrybackWindowCount: Number.NaN as unknown as number,
      }),
    );
    expect(r.score).toBeNull();
  });
});

describe("readiness 50/50 weighting", () => {
  it("computes deterministically", () => {
    const r = calculateReadinessScore(
      baseInput({ drybackConfidence: "high", daysVsHistoryConfidence: "low" }),
    );
    // 0.9 * 0.5 + 0.3 * 0.5 = 0.6
    expect(r.score).toBe(0.6);
    expect(r.components.drybackWeight).toBe(0.5);
    expect(r.components.daysVsHistoryWeight).toBe(0.5);
  });

  it("is repeatable for the same input", () => {
    const a = calculateReadinessScore(baseInput());
    const b = calculateReadinessScore(baseInput());
    expect(a).toEqual(b);
  });

  it("trichome data does NOT alter the readiness score in v1.5", () => {
    const without = calculateReadinessScore(baseInput({ trichome: null }));
    const withHigh = calculateReadinessScore(
      baseInput({ trichome: { confidence: "high", insight: "ready-ish" } }),
    );
    expect(withHigh.score).toBe(without.score);
  });

  it("returns null when a component confidence is missing", () => {
    const r = calculateReadinessScore(
      baseInput({ drybackConfidence: null }),
    );
    expect(r.score).toBeNull();
  });
});

describe("harvest window prediction", () => {
  it("returns a low-confidence broad window when no usable history", () => {
    const w = predictHarvestWindow({
      daysInFlower: 40,
      expectedHarvestDay: null,
      priorGrowCount: 0,
    });
    expect(w.anchor).toBe("broad");
    expect(w.confidence).toBe("low");
    expect(w.startDay).toBeLessThan(w.endDay);
  });

  it("uses phenotype history when available and confidence improves with priors", () => {
    const w1 = predictHarvestWindow({
      daysInFlower: 55,
      expectedHarvestDay: 63,
      priorGrowCount: 1,
    });
    const w3 = predictHarvestWindow({
      daysInFlower: 55,
      expectedHarvestDay: 63,
      priorGrowCount: 3,
    });
    expect(w1.anchor).toBe("history");
    expect(w1.confidence).toBe("low");
    expect(w3.confidence).toBe("high");
    expect(w3.startDay).toBe(58);
    expect(w3.endDay).toBe(68);
  });
});

describe("dryback visibility / muting", () => {
  it("stays visible but muted with Lower Confidence when plant selection is skipped", () => {
    const v = deriveDrybackVisibility({
      irrigationPlantSelectionQuality: "skipped",
      drybackConfidence: "high",
    });
    expect(v.visible).toBe(true);
    expect(v.muted).toBe(true);
    expect(v.confidence).toBe("low");
    expect(v.label).toBe(DRYBACK_LOWER_CONFIDENCE_LABEL);
  });

  it("renders normal confidence when plant selection is explicit", () => {
    const v = deriveDrybackVisibility({
      irrigationPlantSelectionQuality: "explicit",
      drybackConfidence: "high",
    });
    expect(v.muted).toBe(false);
    expect(v.confidence).toBe("high");
  });

  it("never treats unknown dryback confidence as high", () => {
    const v = deriveDrybackVisibility({
      irrigationPlantSelectionQuality: "explicit",
      drybackConfidence: null,
    });
    expect(v.confidence).toBe("low");
  });
});

describe("photo prompt forgiveness", () => {
  const now = new Date("2026-06-17T12:00:00.000Z");

  it("returns normal tone when missed 0 days", () => {
    const p = evaluatePhotoPrompt("2026-06-17T08:00:00.000Z", now);
    expect(p.tone).toBe("normal");
    expect(p.confidencePenalty).toBe(0);
  });

  it("returns gentle reminder after 1 missed day", () => {
    const p = evaluatePhotoPrompt("2026-06-16T08:00:00.000Z", now);
    expect(p.tone).toBe("gentle");
    expect(p.confidencePenalty).toBe(0.1);
  });

  it("returns stronger prompt and confidence reduction after 2+ days", () => {
    const p = evaluatePhotoPrompt("2026-06-14T08:00:00.000Z", now);
    expect(p.tone).toBe("stronger");
    expect(p.missedDays).toBeGreaterThanOrEqual(2);
    expect(p.confidencePenalty).toBe(0.25);
  });

  it("handles null/invalid lastPhotoAt without claiming healthy", () => {
    const p = evaluatePhotoPrompt(null, now);
    expect(p.missedDays).toBe(0);
    const bad = evaluatePhotoPrompt("not-a-date", now);
    expect(bad.missedDays).toBe(0);
  });
});

describe("trichome placeholder (v1.5)", () => {
  it("surfaces only when confidence is high", () => {
    const r = deriveTrichomePlaceholder({ confidence: "high", insight: "Near" });
    expect(r.visible).toBe(true);
    expect(r.insight).toBe("Near");
  });

  it("stays hidden for medium/low/null", () => {
    expect(deriveTrichomePlaceholder({ confidence: "medium" }).visible).toBe(false);
    expect(deriveTrichomePlaceholder({ confidence: "low" }).visible).toBe(false);
    expect(deriveTrichomePlaceholder(null).visible).toBe(false);
    expect(deriveTrichomePlaceholder(undefined).visible).toBe(false);
  });

  it("provides a safe default insight when high-confidence insight is blank", () => {
    const r = deriveTrichomePlaceholder({ confidence: "high", insight: "   " });
    expect(r.visible).toBe(true);
    expect(typeof r.insight).toBe("string");
    expect(r.insight!.length).toBeGreaterThan(0);
  });
});
