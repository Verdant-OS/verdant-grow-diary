/**
 * Operator-authored breeding program SOP template — v1.
 *
 * This is versioned, editable operator content. It is NOT Verdant cultivation
 * advice, AI recommendation, or automation. The template defines the steps
 * inserted into `breeding_program_steps` when a program is created, and the
 * required criteria that gate a "ready to advance" state in the checklist.
 *
 * Pure data. No I/O.
 */

export const BREEDING_PROGRAM_SOP_VERSION = "v1" as const;

export type BreedingCriterionKey =
  | "p1_baseline_recorded"
  | "yield_evidence"
  | "resin_aroma_notes"
  | "disease_resistance_observation"
  | "flowering_time_observation"
  | "selected_offspring_recorded";

export interface BreedingTemplateCriterion {
  readonly key: BreedingCriterionKey;
  readonly label: string;
  readonly required: boolean;
}

export interface BreedingTemplateStep {
  readonly stepIndex: number;
  readonly stepKey: string;
  readonly generationLabel: string;
  readonly title: string;
  readonly instructionSummary: string;
  readonly requiredCriteria: readonly BreedingTemplateCriterion[];
}

const c = (
  key: BreedingCriterionKey,
  label: string,
  required = true,
): BreedingTemplateCriterion => ({ key, label, required });

export const BREEDING_PROGRAM_TEMPLATE_V1: readonly BreedingTemplateStep[] = [
  {
    stepIndex: 0,
    stepKey: "p1_parent_definition",
    generationLabel: "P1",
    title: "P1 parent definition",
    instructionSummary:
      "Record both P1 parents: maternal and paternal labels, source, and baseline traits (aroma, resin, effect, flowering time, disease pressure).",
    requiredCriteria: [
      c("p1_baseline_recorded", "P1 baseline notes recorded"),
      c("resin_aroma_notes", "Resin / aroma notes recorded", false),
    ],
  },
  {
    stepIndex: 1,
    stepKey: "f1_creation",
    generationLabel: "F1",
    title: "F1 creation",
    instructionSummary:
      "Cross P1 maternal × P1 paternal to produce F1 seed. Log the cross event and the F1 lot label.",
    requiredCriteria: [c("selected_offspring_recorded", "F1 lot recorded")],
  },
  {
    stepIndex: 2,
    stepKey: "f1_candidate_selection",
    generationLabel: "F1",
    title: "F1 candidate selection",
    instructionSummary:
      "Evaluate F1 phenotypes across the run. Record yield, resin, aroma, disease-pressure response, and flowering time per candidate. Select F1 keepers.",
    requiredCriteria: [
      c("yield_evidence", "Yield evidence recorded"),
      c("resin_aroma_notes", "Resin / aroma notes recorded"),
      c("disease_resistance_observation", "Disease-resistance observation recorded"),
      c("selected_offspring_recorded", "F1 keepers recorded"),
    ],
  },
  {
    stepIndex: 3,
    stepKey: "f2_creation",
    generationLabel: "F2",
    title: "F2 creation",
    instructionSummary:
      "Self or intercross selected F1 keepers to produce F2 seed. Log the cross event and the F2 lot label.",
    requiredCriteria: [c("selected_offspring_recorded", "F2 lot recorded")],
  },
  {
    stepIndex: 4,
    stepKey: "f2_candidate_selection",
    generationLabel: "F2",
    title: "F2 candidate selection",
    instructionSummary:
      "Evaluate F2 phenotypes. Record yield, resin/aroma, disease-resistance, flowering time. Select F2 keepers for the next branch.",
    requiredCriteria: [
      c("yield_evidence", "Yield evidence recorded"),
      c("resin_aroma_notes", "Resin / aroma notes recorded"),
      c("disease_resistance_observation", "Disease-resistance observation recorded"),
      c("flowering_time_observation", "Flowering-time observation recorded"),
      c("selected_offspring_recorded", "F2 keepers recorded"),
    ],
  },
  {
    stepIndex: 5,
    stepKey: "disease_resistance_backcross",
    generationLabel: "BX1F1",
    title: "Disease-resistance backcross (BX1F1)",
    instructionSummary:
      "Backcross the most disease-resistant F2 keepers to the anchor P1. Log the cross event and the BX1F1 lot label.",
    requiredCriteria: [
      c("disease_resistance_observation", "Disease-resistance observation recorded"),
      c("selected_offspring_recorded", "BX1F1 lot recorded"),
    ],
  },
  {
    stepIndex: 6,
    stepKey: "bx1f2_selection",
    generationLabel: "BX1F2",
    title: "BX1F2 selection",
    instructionSummary:
      "Intercross BX1F1 keepers to produce BX1F2. Evaluate resistance consistency across the run and select keepers.",
    requiredCriteria: [
      c("disease_resistance_observation", "Disease-resistance observation recorded"),
      c("selected_offspring_recorded", "BX1F2 keepers recorded"),
    ],
  },
  {
    stepIndex: 7,
    stepKey: "flowering_time_backcross",
    generationLabel: "BX2F1",
    title: "Flowering-time backcross (BX2F1)",
    instructionSummary:
      "Backcross the shortest-flowering BX1F2 keepers to the anchor P1. Log the cross event and the BX2F1 lot label.",
    requiredCriteria: [
      c("flowering_time_observation", "Flowering-time observation recorded"),
      c("selected_offspring_recorded", "BX2F1 lot recorded"),
    ],
  },
  {
    stepIndex: 8,
    stepKey: "continued_selection",
    generationLabel: "BX2F1",
    title: "Continued selection",
    instructionSummary:
      "Score BX2F1 candidates on yield, resin/aroma, disease resistance, and flowering time together. Select keepers that hold every prior target.",
    requiredCriteria: [
      c("yield_evidence", "Yield evidence recorded"),
      c("resin_aroma_notes", "Resin / aroma notes recorded"),
      c("disease_resistance_observation", "Disease-resistance observation recorded"),
      c("flowering_time_observation", "Flowering-time observation recorded"),
      c("selected_offspring_recorded", "BX2F1 keepers recorded"),
    ],
  },
  {
    stepIndex: 9,
    stepKey: "yield_resin_backcross",
    generationLabel: "BX3F1",
    title: "Yield / resin backcross (BX3F1)",
    instructionSummary:
      "Backcross the highest-yield, highest-resin keeper to the anchor P1. Log the cross event and the BX3F1 lot label.",
    requiredCriteria: [
      c("yield_evidence", "Yield evidence recorded"),
      c("resin_aroma_notes", "Resin / aroma notes recorded"),
      c("selected_offspring_recorded", "BX3F1 lot recorded"),
    ],
  },
  {
    stepIndex: 10,
    stepKey: "stabilization_generations",
    generationLabel: "BX3Fn",
    title: "Stabilization generations",
    instructionSummary:
      "Run successive filial generations (BX3F1..F7+). Only keep offspring that stay inside the target windows on every criterion. Uniformity across the run is the goal.",
    requiredCriteria: [
      c("yield_evidence", "Yield evidence recorded"),
      c("resin_aroma_notes", "Resin / aroma notes recorded"),
      c("disease_resistance_observation", "Disease-resistance observation recorded"),
      c("flowering_time_observation", "Flowering-time observation recorded"),
      c("selected_offspring_recorded", "Selected offspring generation recorded"),
    ],
  },
] as const;

export function getBreedingProgramTemplate(
  version: string = BREEDING_PROGRAM_SOP_VERSION,
): readonly BreedingTemplateStep[] {
  if (version === "v1") return BREEDING_PROGRAM_TEMPLATE_V1;
  return BREEDING_PROGRAM_TEMPLATE_V1;
}
