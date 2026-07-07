import { describe, expect, it } from "vitest";
import {
  BREEDING_PROGRAM_TEMPLATE_V1,
  getBreedingProgramTemplate,
} from "@/constants/breedingProgramTemplate";
import {
  buildStepRowsFromTemplate,
  evaluateStepReadiness,
  mergeCriteriaMet,
  type BreedingStepRow,
} from "@/lib/breeding/breedingProgramProgress";

describe("breedingProgramTemplate v1", () => {
  it("has 11 sequential steps starting at 0", () => {
    expect(BREEDING_PROGRAM_TEMPLATE_V1).toHaveLength(11);
    BREEDING_PROGRAM_TEMPLATE_V1.forEach((s, i) => expect(s.stepIndex).toBe(i));
  });

  it("has unique step keys", () => {
    const keys = new Set(BREEDING_PROGRAM_TEMPLATE_V1.map((s) => s.stepKey));
    expect(keys.size).toBe(BREEDING_PROGRAM_TEMPLATE_V1.length);
  });

  it("defaults to v1 for unknown versions", () => {
    expect(getBreedingProgramTemplate("v999")).toBe(BREEDING_PROGRAM_TEMPLATE_V1);
  });

  it("has at least one required criterion per step", () => {
    for (const step of BREEDING_PROGRAM_TEMPLATE_V1) {
      expect(step.requiredCriteria.some((c) => c.required)).toBe(true);
    }
  });
});

describe("buildStepRowsFromTemplate", () => {
  it("marks only the first step active, rest pending", () => {
    const rows = buildStepRowsFromTemplate(BREEDING_PROGRAM_TEMPLATE_V1);
    expect(rows[0]?.status).toBe("active");
    expect(rows.slice(1).every((r) => r.status === "pending")).toBe(true);
  });
});

const templateStep = BREEDING_PROGRAM_TEMPLATE_V1[2]!; // f1_candidate_selection — 4 required
const baseRow: BreedingStepRow = {
  id: "step-1",
  stepIndex: templateStep.stepIndex,
  stepKey: templateStep.stepKey,
  status: "active",
  requiredCriteria: templateStep.requiredCriteria,
  criteriaMet: {},
};

describe("evaluateStepReadiness", () => {
  it("returns readyToAdvance=false with all missing when nothing is met", () => {
    const r = evaluateStepReadiness(baseRow);
    expect(r.readyToAdvance).toBe(false);
    expect(r.metRequired).toBe(0);
    expect(r.missing.length).toBe(r.totalRequired);
  });

  it("SAFETY: does NOT report ready until every required criterion is explicitly true", () => {
    const partial: BreedingStepRow = {
      ...baseRow,
      criteriaMet: { yield_evidence: true, resin_aroma_notes: true },
    };
    const r = evaluateStepReadiness(partial);
    expect(r.readyToAdvance).toBe(false);
    expect(r.missing).toContain("disease_resistance_observation");
  });

  it("reports ready when all required criteria are met", () => {
    const met: BreedingStepRow = {
      ...baseRow,
      criteriaMet: {
        yield_evidence: true,
        resin_aroma_notes: true,
        disease_resistance_observation: true,
        selected_offspring_recorded: true,
      },
    };
    const r = evaluateStepReadiness(met);
    expect(r.readyToAdvance).toBe(true);
    expect(r.missing).toHaveLength(0);
  });

  it("handles null step defensively", () => {
    expect(evaluateStepReadiness(null).readyToAdvance).toBe(false);
  });
});

describe("mergeCriteriaMet", () => {
  it("returns a new object and drops non-boolean values", () => {
    const current = { yield_evidence: true };
    const next = mergeCriteriaMet(current, {
      resin_aroma_notes: true,
      // @ts-expect-error intentional junk
      selected_offspring_recorded: "yes",
    });
    expect(next).toEqual({ yield_evidence: true, resin_aroma_notes: true });
    expect(next).not.toBe(current);
  });
});
