/**
 * Pheno Hunt Start Page — pure rules.
 *
 * Deterministic helpers for v0 intake/setup only:
 *   - required-field detection
 *   - candidate plant filtering (grow / tent / archived)
 *   - candidate label normalisation
 *   - allowed project goal options
 *   - safety / forbidden copy guards
 *
 * No persistence. No AI. No alerts. No Action Queue. No device control.
 * No React, no Supabase, no toast imports — keep this module pure.
 */

export const PHENO_HUNT_PROJECT_GOALS = [
  "keeper_selection",
  "breeding_candidate",
  "stress_test",
  "yield_test",
  "terpene_aroma_selection",
  "structure_selection",
  "disease_pest_resistance_observation",
  "general_observation",
] as const;

export type PhenoHuntProjectGoal = (typeof PHENO_HUNT_PROJECT_GOALS)[number];

export const PHENO_HUNT_PROJECT_GOAL_LABELS: Record<PhenoHuntProjectGoal, string> = {
  keeper_selection: "Keeper selection",
  breeding_candidate: "Breeding candidate",
  stress_test: "Stress test",
  yield_test: "Yield test",
  terpene_aroma_selection: "Terpene / aroma selection",
  structure_selection: "Structure selection",
  disease_pest_resistance_observation: "Disease / pest resistance observation",
  general_observation: "General observation",
};

export const PHENO_HUNT_PROPAGATION_TYPES = ["seed", "clone"] as const;
export type PhenoHuntPropagationType = (typeof PHENO_HUNT_PROPAGATION_TYPES)[number];

export const PHENO_HUNT_GROW_STYLES = [
  "organic",
  "salts",
  "coco",
  "hydro",
  "soil",
  "living_soil",
  "mixed",
  "other",
] as const;
export type PhenoHuntGrowStyle = (typeof PHENO_HUNT_GROW_STYLES)[number];

export interface PhenoHuntDraft {
  // required
  huntName: string;
  cultivar: string;
  projectGoal: PhenoHuntProjectGoal | null;
  startDate: string; // ISO date (yyyy-mm-dd)
  growId: string | null;
  tentId: string | null;
  // optional
  generation?: string;
  lineage?: string;
  breederSeedSource?: string;
  propagationType?: PhenoHuntPropagationType | null;
  germinationMethod?: string;
  medium?: string;
  growStyle?: PhenoHuntGrowStyle | null;
  candidateCount?: number | null;
  notes?: string;
}

export interface CandidatePlant {
  id: string;
  name: string;
  strain: string | null;
  stage: string;
  growId: string | null;
  tentId: string | null;
  isArchived: boolean;
}

export interface CandidateSelection {
  plantId: string;
  /** Local-only label override, e.g. "BB-01". */
  label: string;
}

export type RequiredField =
  | "huntName"
  | "cultivar"
  | "projectGoal"
  | "startDate"
  | "growId"
  | "tentId";

export const REQUIRED_FIELDS: readonly RequiredField[] = [
  "huntName",
  "cultivar",
  "projectGoal",
  "startDate",
  "growId",
  "tentId",
] as const;

export function emptyPhenoHuntDraft(): PhenoHuntDraft {
  return {
    huntName: "",
    cultivar: "",
    projectGoal: null,
    startDate: "",
    growId: null,
    tentId: null,
  };
}

export function getMissingRequiredFields(draft: PhenoHuntDraft): RequiredField[] {
  const missing: RequiredField[] = [];
  if (!draft.huntName.trim()) missing.push("huntName");
  if (!draft.cultivar.trim()) missing.push("cultivar");
  if (!draft.projectGoal) missing.push("projectGoal");
  if (!draft.startDate.trim()) missing.push("startDate");
  if (!draft.growId) missing.push("growId");
  if (!draft.tentId) missing.push("tentId");
  return missing;
}

export function isDraftReady(draft: PhenoHuntDraft): boolean {
  return getMissingRequiredFields(draft).length === 0;
}

export interface CandidateFilterOptions {
  growId: string | null;
  tentId: string | null;
  includeArchived?: boolean;
}

/**
 * Eligibility for candidate listing:
 *   - plant must belong to the selected grow
 *   - if a tent is selected, plant must belong to that tent
 *   - archived plants hidden unless includeArchived is true
 *
 * Deterministic sort: by name then id for stable tie-breaking.
 */
export function filterCandidatePlants(
  plants: readonly CandidatePlant[],
  options: CandidateFilterOptions,
): CandidatePlant[] {
  if (!options.growId) return [];
  const includeArchived = options.includeArchived === true;
  const filtered = plants.filter((p) => {
    if (p.growId !== options.growId) return false;
    if (options.tentId && p.tentId !== options.tentId) return false;
    if (!includeArchived && p.isArchived) return false;
    return true;
  });
  return [...filtered].sort((a, b) => {
    const byName = a.name.localeCompare(b.name);
    if (byName !== 0) return byName;
    return a.id.localeCompare(b.id);
  });
}

/**
 * Default candidate label: "<cultivar prefix>-NN", e.g. "BB-01".
 * Falls back to "Plant N" when no cultivar prefix can be derived.
 */
export function defaultCandidateLabel(cultivar: string, index: number): string {
  const padded = String(index + 1).padStart(2, "0");
  const prefix = cultivar
    .trim()
    .split(/\s+/)
    .map((token) => token[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 3);
  if (!prefix) return `Plant ${index + 1}`;
  return `${prefix}-${padded}`;
}

export function normaliseCandidateLabel(raw: string, fallback: string): string {
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

/**
 * Forbidden copy guard. Pheno Hunt v0 must not imply:
 *   - sales, resale, marketplace
 *   - guaranteed phenotype / keeper / genetic certainty
 *   - AI-selected breeder or automated culling
 */
const FORBIDDEN_PATTERNS: RegExp[] = [
  /\bseed sale[s]?\b/i,
  /\bclone sale[s]?\b/i,
  /\bmarketplace\b/i,
  /\bresale\b/i,
  /\bfor sale\b/i,
  /\bguaranteed (keeper|phenotype|pheno)\b/i,
  /\bgenetic certainty\b/i,
  /\bAI[- ]selected breeder\b/i,
  /\bautomated culling\b/i,
];

export function containsForbiddenPhenoHuntCopy(text: string): boolean {
  return FORBIDDEN_PATTERNS.some((re) => re.test(text));
}

/** v0 persistence is blocked — no pheno_hunts table exists yet. */
export const PHENO_HUNT_PERSISTENCE_BLOCKED = true as const;

export const PHENO_HUNT_PERSISTENCE_BLOCKED_COPY =
  "Saving pheno hunts requires a dedicated persistence slice.";
