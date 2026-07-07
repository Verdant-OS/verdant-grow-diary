/**
 * Copy + option lists for the PHENOHUNT Stress Testing evaluation factor.
 *
 * Inspired by stress testing as a phenotype-selection concept from
 * James Loud, "Cannabis Breeding: The Art and Science of Crafting
 * Distinctive Cultivars," p. 293.
 *
 * Wording stays observational: stress testing documents how candidates
 * respond to challenging conditions, but excessive or prolonged stress
 * can damage plants and reduce yield.
 */

export const PHENO_STRESS_FACTOR_ID = "stress_testing" as const;
export const PHENO_STRESS_FACTOR_LABEL = "Stress Testing";

export const PHENO_STRESS_INTRO =
  "Stress testing is a phenotype selection factor used to document how candidates respond to challenging conditions. It can provide useful selection evidence, but excessive or prolonged stress can damage plants and reduce yield. Stress testing entries should be monitored closely and recorded as observations, not automatic recommendations.";

export const PHENO_STRESS_CAUTION =
  "Caution: excessive or prolonged stress may damage plants or reduce yield. Verdant does not recommend applying harsh stress — record what you observe, keep entries evidence-based, and stop any test that harms the plant.";

export const PHENO_STRESS_FACTOR_OPTIONS: readonly string[] = [
  "Drought",
  "High humidity",
  "Light pattern interruption",
  "Extreme temperature",
  "Over-feeding nutrients",
  "Under-feeding nutrients",
  "Stressful pruning or training",
  "Pests",
  "Disease",
  "Altered water quality",
];

export const PHENO_STRESS_STATUS_OPTIONS = ["planned", "observed"] as const;
export type PhenoStressStatus = (typeof PHENO_STRESS_STATUS_OPTIONS)[number];

export const PHENO_STRESS_INTENSITY_OPTIONS = ["low", "moderate", "high"] as const;
export type PhenoStressIntensity = (typeof PHENO_STRESS_INTENSITY_OPTIONS)[number];

export const PHENO_STRESS_RECOMMENDATION_OPTIONS = ["keep", "watch", "reject"] as const;
export type PhenoStressRecommendation = (typeof PHENO_STRESS_RECOMMENDATION_OPTIONS)[number];

export interface PhenoStressObservationDraft {
  readonly candidateId: string;
  readonly factor: string;
  readonly status: PhenoStressStatus;
  readonly startDate: string;
  readonly endDate: string;
  readonly intensity: PhenoStressIntensity;
  readonly plantResponse: string;
  readonly recoveryNotes: string;
  readonly yieldImpactNotes: string;
  readonly diseasePestNotes: string;
  readonly recommendation: PhenoStressRecommendation;
  readonly diaryEntryRef: string;
  readonly notes: string;
}

export const PHENO_STRESS_DEFAULT_DRAFT: PhenoStressObservationDraft = {
  candidateId: "",
  factor: PHENO_STRESS_FACTOR_OPTIONS[0],
  status: "observed",
  startDate: "",
  endDate: "",
  intensity: "low",
  plantResponse: "",
  recoveryNotes: "",
  yieldImpactNotes: "",
  diseasePestNotes: "",
  recommendation: "watch",
  diaryEntryRef: "",
  notes: "",
};
