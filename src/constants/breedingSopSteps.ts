/**
 * Canonical 10-step breeding SOP for Verdant.
 *
 * Encoded from the grower-provided source SOP (Afghan × Colombian example),
 * generalized so any two P1 labels can seed a program. Guidance copy is
 * paraphrased in grower-first language — no bro-science, no aggressive stress
 * recommendations, no nutrient escalations from weak evidence. All advancement
 * happens through the Action Queue with grower approval.
 *
 * Pure data. No I/O, no randomness, no Supabase calls. Do not add UI here.
 */

export const BREEDING_CRITERIA_IDS = [
  "yield",
  "resin",
  "disease_resistance",
  "flowering_time",
  "aroma",
  "effects",
] as const;

export type BreedingCriterionId = (typeof BREEDING_CRITERIA_IDS)[number];

export const BREEDING_GENERATIONS = [
  "P1",
  "F1",
  "F2",
  "BX1F1",
  "BX1F2",
  "BX2F1",
  "BX3F1",
  "BX3Fn",
] as const;

export type BreedingGeneration = (typeof BREEDING_GENERATIONS)[number];

export interface BreedingSelectionCriterion {
  readonly id: BreedingCriterionId;
  /** Advisor weight in ranking (0..1). Deterministic tie-breakers cover ties. */
  readonly weight: number;
  /** If true, canAdvance() must reject unless the criterion is marked met. */
  readonly required: boolean;
  readonly notes: string;
}

export interface BreedingSopStep {
  readonly id: string;
  readonly order: number;
  readonly label: string;
  readonly generation: BreedingGeneration;
  /** Step ids this step depends on. Empty for P1. */
  readonly parentStepIds: readonly string[];
  readonly selectionCriteria: readonly BreedingSelectionCriterion[];
  /** Criterion ids that MUST be marked met before advancing. */
  readonly advanceRequires: readonly BreedingCriterionId[];
  /** Grower-facing paraphrased guidance. No absolute claims. */
  readonly guidance: string;
}

const c = (
  id: BreedingCriterionId,
  weight: number,
  required: boolean,
  notes: string,
): BreedingSelectionCriterion => ({ id, weight, required, notes });

/**
 * The 10 canonical steps. Order is stable and semantically meaningful —
 * do not re-sort at runtime. `parentStepIds` encodes the DAG for backcrosses.
 */
export const BREEDING_SOP_STEPS: readonly BreedingSopStep[] = [
  {
    id: "p1_establish",
    order: 1,
    label: "Establish P1 parents",
    generation: "P1",
    parentStepIds: [],
    selectionCriteria: [
      c("resin", 0.25, true, "Confirm maternal P1 resin baseline is documented."),
      c("aroma", 0.2, true, "Confirm maternal P1 aroma profile is documented."),
      c("effects", 0.2, false, "Effect profile of each P1 recorded from smoke tests if available."),
      c("disease_resistance", 0.2, false, "Note native-climate disease pressure per P1."),
      c("flowering_time", 0.15, false, "Record baseline flowering days per P1."),
    ],
    advanceRequires: ["resin", "aroma"],
    guidance:
      "Pick two stable P1 parents whose traits you actually want to combine. Log resin, aroma, effect, disease pressure, and flowering time baselines for each parent so later generations have something honest to compare against.",
  },
  {
    id: "f1_create",
    order: 2,
    label: "Create F1 generation",
    generation: "F1",
    parentStepIds: ["p1_establish"],
    selectionCriteria: [
      c("yield", 0.2, false, "F1 hybrid vigor is expected; document, don't chase."),
      c("resin", 0.2, false, ""),
      c("aroma", 0.2, false, ""),
      c("disease_resistance", 0.2, false, ""),
      c("effects", 0.1, false, ""),
      c("flowering_time", 0.1, false, ""),
    ],
    advanceRequires: [],
    guidance:
      "Cross the two P1s. Expect heterozygous F1s that lean toward dominant traits from both parents. Grow enough plants to see real variation before selecting.",
  },
  {
    id: "f1_select",
    order: 3,
    label: "Select best F1 phenotypes",
    generation: "F1",
    parentStepIds: ["f1_create"],
    selectionCriteria: [
      c("yield", 0.25, true, "Compare against P1 baselines, not against hype."),
      c("resin", 0.25, true, ""),
      c("disease_resistance", 0.2, true, "Prefer plants that shrugged off pressure the whole cycle."),
      c("aroma", 0.15, false, ""),
      c("effects", 0.1, false, ""),
      c("flowering_time", 0.05, false, ""),
    ],
    advanceRequires: ["yield", "resin", "disease_resistance"],
    guidance:
      "Score every F1 against the P1 baselines. Keep the plants that combine yield, resin, and disease resistance. Do not advance a pheno just because it looks pretty in one photo.",
  },
  {
    id: "f2_create_select",
    order: 4,
    label: "Create and select F2 generation",
    generation: "F2",
    parentStepIds: ["f1_select"],
    selectionCriteria: [
      c("yield", 0.2, true, ""),
      c("resin", 0.2, true, ""),
      c("disease_resistance", 0.2, true, ""),
      c("aroma", 0.15, false, ""),
      c("effects", 0.15, false, ""),
      c("flowering_time", 0.1, false, ""),
    ],
    advanceRequires: ["yield", "resin", "disease_resistance"],
    guidance:
      "Self or intercross the selected F1s. F2 is where recessive traits surface — plan for wider variation and a bigger candidate pool. Score every candidate on the same criteria you used in F1.",
  },
  {
    id: "bx1f1_disease",
    order: 5,
    label: "BX1F1 — backcross for disease resistance",
    generation: "BX1F1",
    parentStepIds: ["f2_create_select"],
    selectionCriteria: [
      c("disease_resistance", 0.4, true, "Prioritize botrytis and powdery mildew tolerance."),
      c("aroma", 0.25, true, "Keep the target P1 aroma alive."),
      c("effects", 0.2, false, "Keep the target P1 effect profile alive."),
      c("resin", 0.1, false, ""),
      c("yield", 0.05, false, ""),
    ],
    advanceRequires: ["disease_resistance", "aroma"],
    guidance:
      "Cross the most resistant F2s back to the P1 you want to anchor. Select plants that keep the target P1's aroma and effect while carrying the resistance forward. Do not sacrifice resistance for a marginal aroma bump.",
  },
  {
    id: "bx1f2_stabilize",
    order: 6,
    label: "BX1F2 — stabilize resistance line",
    generation: "BX1F2",
    parentStepIds: ["bx1f1_disease"],
    selectionCriteria: [
      c("disease_resistance", 0.35, true, ""),
      c("aroma", 0.2, false, ""),
      c("effects", 0.2, false, ""),
      c("resin", 0.15, false, ""),
      c("yield", 0.1, false, ""),
    ],
    advanceRequires: ["disease_resistance"],
    guidance:
      "Cross the BX1F1 keepers together. Look for consistency — the goal here is fewer surprises, not new highs. Log any plant that regresses on resistance and cull it from the pool.",
  },
  {
    id: "bx2f1_flowering",
    order: 7,
    label: "BX2F1 — backcross for flowering time",
    generation: "BX2F1",
    parentStepIds: ["bx1f2_stabilize"],
    selectionCriteria: [
      c("flowering_time", 0.35, true, "Prefer shorter, well-documented flowering."),
      c("aroma", 0.2, true, ""),
      c("effects", 0.2, false, ""),
      c("disease_resistance", 0.15, false, "Do not regress resistance for speed."),
      c("resin", 0.1, false, ""),
    ],
    advanceRequires: ["flowering_time", "aroma"],
    guidance:
      "Pick BX1F2 plants with the shortest honest flowering time and backcross to the anchor P1 to keep aroma and effect. Verify flowering days across two runs before trusting them.",
  },
  {
    id: "select_continue",
    order: 8,
    label: "Continue rigorous selection",
    generation: "BX2F1",
    parentStepIds: ["bx2f1_flowering"],
    selectionCriteria: [
      c("yield", 0.2, true, ""),
      c("disease_resistance", 0.2, true, ""),
      c("flowering_time", 0.2, true, ""),
      c("aroma", 0.2, false, ""),
      c("effects", 0.1, false, ""),
      c("resin", 0.1, false, ""),
    ],
    advanceRequires: ["yield", "disease_resistance", "flowering_time"],
    guidance:
      "Now select on the full stack: yield, disease resistance, and flowering time together. Keep records of what each keeper actually produced — no eyeballing.",
  },
  {
    id: "bx3_yield_resin",
    order: 9,
    label: "BX3 — backcross for yield and resin",
    generation: "BX3F1",
    parentStepIds: ["select_continue"],
    selectionCriteria: [
      c("yield", 0.3, true, ""),
      c("resin", 0.3, true, ""),
      c("aroma", 0.15, false, ""),
      c("effects", 0.15, false, ""),
      c("disease_resistance", 0.05, false, "Do not regress."),
      c("flowering_time", 0.05, false, "Do not regress."),
    ],
    advanceRequires: ["yield", "resin"],
    guidance:
      "Backcross the highest-yielding, highest-resin plant to the anchor P1. Keep an eye on the traits you already stabilized — if they regress, stop and rescore.",
  },
  {
    id: "stabilize",
    order: 10,
    label: "Stabilize preferred phenotype",
    generation: "BX3Fn",
    parentStepIds: ["bx3_yield_resin"],
    selectionCriteria: [
      c("yield", 0.2, true, ""),
      c("resin", 0.2, true, ""),
      c("disease_resistance", 0.2, true, ""),
      c("flowering_time", 0.15, true, ""),
      c("aroma", 0.15, true, ""),
      c("effects", 0.1, false, ""),
    ],
    advanceRequires: ["yield", "resin", "disease_resistance", "flowering_time", "aroma"],
    guidance:
      "Run successive filial generations (BX3F1..F7+) and only keep plants that stay inside your target windows on every criterion. Uniformity across a full run beats a single standout plant.",
  },
] as const;

export const BREEDING_SOP_STEP_IDS = BREEDING_SOP_STEPS.map((s) => s.id);
