/**
 * phenoEvidenceGoals — canonical evidence goal catalog for Pheno Tracker
 * onboarding. Presentation-only strings. No AI, no scoring, no ranking, no
 * "winner" language.
 */

export type PhenoEvidenceGoalId =
  | "structure"
  | "vigor"
  | "aroma"
  | "resin"
  | "stretch"
  | "stress_resistance"
  | "disease_resistance"
  | "yield"
  | "post_harvest"
  | "post_cure"
  | "replication_readiness"
  | "keeper_decision";

export interface PhenoEvidenceGoal {
  readonly id: PhenoEvidenceGoalId;
  readonly label: string;
  readonly description: string;
  /** Goals we mark "pending" by default until the grower records data. */
  readonly startsPending?: boolean;
}

export const PHENO_EVIDENCE_GOALS: ReadonlyArray<PhenoEvidenceGoal> = [
  { id: "structure", label: "Structure", description: "Node spacing, branching, canopy shape." },
  { id: "vigor", label: "Vigor", description: "Growth rate and recovery under normal care." },
  { id: "aroma", label: "Aroma", description: "Terpene impression at each stage." },
  { id: "resin", label: "Resin", description: "Trichome coverage, density, and clarity." },
  { id: "stretch", label: "Stretch", description: "Flower stretch and internode response." },
  {
    id: "stress_resistance",
    label: "Stress resistance",
    description: "Response to defoliation, training, environmental swings.",
  },
  {
    id: "disease_resistance",
    label: "Disease / pest resistance",
    description: "How the pheno holds up under IPM pressure.",
  },
  { id: "yield", label: "Yield", description: "Wet and dry weight at harvest." },
  {
    id: "post_harvest",
    label: "Post-harvest notes",
    description: "Trim quality, bud density, moisture behavior.",
    startsPending: true,
  },
  {
    id: "post_cure",
    label: "Post-cure notes",
    description: "How the pheno smokes and holds up after cure.",
    startsPending: true,
  },
  {
    id: "replication_readiness",
    label: "Replication readiness",
    description: "Clones taken, mother assigned, backup preserved.",
    startsPending: true,
  },
  {
    id: "keeper_decision",
    label: "Keeper decision",
    description: "Your own final call, with your notes.",
    startsPending: true,
  },
];

const GOAL_BY_ID = new Map(PHENO_EVIDENCE_GOALS.map((g) => [g.id, g]));

export function getPhenoEvidenceGoal(id: PhenoEvidenceGoalId): PhenoEvidenceGoal {
  const g = GOAL_BY_ID.get(id);
  if (!g) throw new Error(`unknown pheno evidence goal: ${id}`);
  return g;
}

/**
 * Default evidence goals selected for a brand-new hunt. Growers can add or
 * remove goals in the onboarding step. Excludes goals whose data only
 * arrives late (post-cure, replication readiness, keeper decision) so the
 * default selection matches what the grower can actually record on day 1.
 */
export const DEFAULT_SELECTED_EVIDENCE_GOALS: ReadonlyArray<PhenoEvidenceGoalId> = [
  "structure",
  "vigor",
  "aroma",
  "resin",
  "stretch",
  "stress_resistance",
  "disease_resistance",
  "yield",
];
