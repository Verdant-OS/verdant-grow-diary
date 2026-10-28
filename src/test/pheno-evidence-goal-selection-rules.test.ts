/**
 * #574 — the Goals step must describe the pre-selected default set instead
 * of implying the grower chose it.
 */
import { describe, it, expect } from "vitest";
import {
  describePhenoEvidenceGoalSelection,
  normalizeEvidenceGoalIds,
  PHENO_EVIDENCE_GOALS_STEP_INTRO,
} from "@/lib/phenoEvidenceGoalSelectionRules";
import {
  DEFAULT_SELECTED_EVIDENCE_GOALS,
  PHENO_EVIDENCE_GOALS,
  type PhenoEvidenceGoalId,
} from "@/lib/phenoEvidenceGoals";

const TOTAL = PHENO_EVIDENCE_GOALS.length;
const DEFAULTS = [...DEFAULT_SELECTED_EVIDENCE_GOALS];

describe("describePhenoEvidenceGoalSelection", () => {
  it("untouched default set is described as the suggested starting set", () => {
    const d = describePhenoEvidenceGoalSelection(DEFAULTS);
    expect(d.isSuggestedDefault).toBe(true);
    expect(d.summary).toBe(`${DEFAULTS.length} of ${TOTAL} selected — the suggested starting set`);
  });

  it("default set in a different order still counts as the suggested set", () => {
    const d = describePhenoEvidenceGoalSelection([...DEFAULTS].reverse());
    expect(d.isSuggestedDefault).toBe(true);
  });

  it("a changed selection says it differs from the suggestion", () => {
    const changed: PhenoEvidenceGoalId[] = [...DEFAULTS.slice(1), "post_cure", "keeper_decision"];
    const d = describePhenoEvidenceGoalSelection(changed);
    expect(d.isSuggestedDefault).toBe(false);
    expect(d.summary).toBe(
      `${changed.length} of ${TOTAL} selected — changed from the suggested ${DEFAULTS.length}`,
    );
  });

  it("same count but different goals is not the suggested set", () => {
    const swapped: PhenoEvidenceGoalId[] = [...DEFAULTS.slice(1), "post_cure"];
    expect(swapped.length).toBe(DEFAULTS.length);
    expect(describePhenoEvidenceGoalSelection(swapped).isSuggestedDefault).toBe(false);
  });

  it("empty selection asks for at least one goal", () => {
    const d = describePhenoEvidenceGoalSelection([]);
    expect(d.isSuggestedDefault).toBe(false);
    expect(d.summary).toBe("None selected yet — choose at least one goal");
  });

  it("duplicates and unknown ids are not counted", () => {
    const d = describePhenoEvidenceGoalSelection([
      ...DEFAULTS,
      DEFAULTS[0],
      "not_a_goal" as PhenoEvidenceGoalId,
    ]);
    expect(d.isSuggestedDefault).toBe(true);
    expect(d.summary.startsWith(`${DEFAULTS.length} of ${TOTAL}`)).toBe(true);
  });

  it("is deterministic", () => {
    expect(describePhenoEvidenceGoalSelection(DEFAULTS)).toEqual(
      describePhenoEvidenceGoalSelection(DEFAULTS),
    );
  });
});

describe("PHENO_EVIDENCE_GOALS_STEP_INTRO", () => {
  it("says the defaults are pre-selected and the grower can change them", () => {
    expect(PHENO_EVIDENCE_GOALS_STEP_INTRO).toMatch(/pre-selected/i);
    expect(PHENO_EVIDENCE_GOALS_STEP_INTRO).toMatch(/remove any/i);
    expect(PHENO_EVIDENCE_GOALS_STEP_INTRO).not.toMatch(/^Choose what you plan to track/);
  });

  it("does not claim every default goal is recordable on day one (Codex on #1843)", () => {
    // `yield` is recorded at harvest; stretch and resin come later too.
    expect(PHENO_EVIDENCE_GOALS_STEP_INTRO).not.toMatch(/day one|day-one/i);
    expect(PHENO_EVIDENCE_GOALS_STEP_INTRO).toMatch(/later in the hunt/i);
  });
});

describe("normalizeEvidenceGoalIds (Codex on #1843)", () => {
  it("keeps known ids in order, drops unknown, duplicate and non-string entries", () => {
    expect(
      normalizeEvidenceGoalIds(["vigor", "removed_goal", "vigor", 3, " aroma ", null, "structure"]),
    ).toEqual(["vigor", "aroma", "structure"]);
  });
  it("non-array input is empty", () => {
    expect(normalizeEvidenceGoalIds(undefined)).toEqual([]);
    expect(normalizeEvidenceGoalIds("vigor")).toEqual([]);
  });
});
