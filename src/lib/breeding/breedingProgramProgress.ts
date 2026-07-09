/**
 * Pure helpers for evaluating breeding-program step progress.
 * No I/O, no Supabase calls, no side effects.
 */

import type {
  BreedingCriterionKey,
  BreedingTemplateCriterion,
  BreedingTemplateStep,
} from "@/constants/breedingProgramTemplate";

/** Persisted-row shape (subset). Matches breeding_program_steps columns we read. */
export interface BreedingStepRow {
  readonly id: string;
  readonly stepIndex: number;
  readonly stepKey: string;
  readonly status: "pending" | "active" | "complete" | "skipped";
  readonly requiredCriteria: readonly BreedingTemplateCriterion[];
  readonly criteriaMet: Partial<Record<BreedingCriterionKey, boolean>>;
}

export interface StepReadiness {
  readonly stepId: string;
  readonly totalRequired: number;
  readonly metRequired: number;
  readonly missing: readonly BreedingCriterionKey[];
  /** True only when every REQUIRED criterion is explicitly marked met. */
  readonly readyToAdvance: boolean;
}

export function evaluateStepReadiness(step: BreedingStepRow | null | undefined): StepReadiness {
  if (!step) {
    return { stepId: "", totalRequired: 0, metRequired: 0, missing: [], readyToAdvance: false };
  }
  const required = step.requiredCriteria.filter((c) => c.required);
  const missing: BreedingCriterionKey[] = [];
  let met = 0;
  for (const c of required) {
    if (step.criteriaMet?.[c.key] === true) met++;
    else missing.push(c.key);
  }
  return {
    stepId: step.id,
    totalRequired: required.length,
    metRequired: met,
    missing,
    readyToAdvance: required.length > 0 && missing.length === 0,
  };
}

/**
 * Merge a criterion-met patch into an existing map. Never mutates input.
 * Only accepts booleans — silently drops non-boolean values (safety).
 */
export function mergeCriteriaMet(
  current: Partial<Record<BreedingCriterionKey, boolean>> | null | undefined,
  patch: Partial<Record<BreedingCriterionKey, unknown>>,
): Partial<Record<BreedingCriterionKey, boolean>> {
  const next: Partial<Record<BreedingCriterionKey, boolean>> = { ...(current ?? {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (typeof v === "boolean") next[k as BreedingCriterionKey] = v;
  }
  return next;
}

export function buildStepRowsFromTemplate(
  template: readonly BreedingTemplateStep[],
): ReadonlyArray<{
  step_index: number;
  step_key: string;
  generation_label: string;
  instruction_summary: string;
  required_criteria: readonly BreedingTemplateCriterion[];
  status: "pending" | "active";
}> {
  return template.map((s) => ({
    step_index: s.stepIndex,
    step_key: s.stepKey,
    generation_label: s.generationLabel,
    instruction_summary: s.instructionSummary,
    required_criteria: s.requiredCriteria,
    status: s.stepIndex === 0 ? "active" : "pending",
  }));
}
