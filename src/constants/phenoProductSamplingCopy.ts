/**
 * Copy + comparison points for the PHENOHUNT Product Sampling section.
 *
 * Kept as constants so the wording is testable and stays observational.
 * No AI, no Action Queue, no automation, no device control.
 */

export const PHENO_SAMPLING_HEADING = "PHENOHUNT product sampling";

export const PHENO_SAMPLING_INTRO_PARAGRAPHS: readonly string[] = [
  "Product sampling is an invaluable step in ensuring the selection of superior genetics because it identifies unique and high-quality traits and facilitates the development of cultivars with optimized characteristics tailored to consumer preferences.",
  "Incorporating multiple testers allows for a broader range of genetic testing, providing a more comprehensive understanding of each cultivar's potential. Providing forms with specified sections for notes and a coherent rating system is essential to maintain structure and clarity in feedback.",
  "Uniformity in product sampling and evaluation is paramount for a precise and fair phenotype comparison. Providing testers with samples in the same format is essential to obtain reliable and comparable feedback. Various consumption methods, such as joints, pipes, and bongs, can be utilized for product sampling, but employing joints for comparative analysis is highly recommended. Pre-rolled joints allow flowers to be sampled consistently so the breeder can assess and compare different effects and expressions systematically and efficiently.",
];

export interface PhenoSamplingComparisonPoint {
  readonly key: string;
  readonly label: string;
  readonly description: string;
}

/**
 * Observational comparison points. Language stays evidence-based:
 * ash color and oil ring are recorded as observations, never as proof.
 */
export const PHENO_SAMPLING_COMPARISON_POINTS: readonly PhenoSamplingComparisonPoint[] = [
  {
    key: "uniformity",
    label: "Uniformity",
    description:
      "Joints can be pre-rolled to the same length and diameter using the same paper and crutch, ensuring consistency in the sampling process.",
  },
  {
    key: "dry_hit",
    label: "Dry hit assessment",
    description:
      "Taking a dry hit, or inhaling the joint before lighting it, allows testers to discern aroma and flavor profiles before burning.",
  },
  {
    key: "burn",
    label: "Burn analysis",
    description: "Observing how joints burn can reveal disparities among phenotypes.",
  },
  {
    key: "ash",
    label: "Ash evaluation",
    description:
      "The color of the ash can be analyzed. Some testers treat lighter ash as a quality signal when flowers are properly dried and cured, but this should be recorded as an observation, not treated as proof.",
  },
  {
    key: "oil_ring",
    label: "Oil ring inspection",
    description:
      "The presence of an oil ring on the joint can be an indicator of resin production. Some high-flavor flowers may not leave a strong oil ring, so record this as one observation among many.",
  },
  {
    key: "comparable_experience",
    label: "Comparable experience",
    description:
      "Using the same sampling format helps make tester feedback more comparable across phenotypes.",
  },
];

/** Coherent 1–10 rating scale, shared across testers for comparable feedback. */
export const PHENO_SAMPLING_RATING_MIN = 1;
export const PHENO_SAMPLING_RATING_MAX = 10;
export const PHENO_SAMPLING_RATING_HINT = `Rate ${PHENO_SAMPLING_RATING_MIN}–${PHENO_SAMPLING_RATING_MAX} for comparable feedback across testers.`;

export const PHENO_SAMPLING_SAMPLE_FORMATS: readonly string[] = [
  "Pre-rolled joint (recommended)",
  "Pipe",
  "Bong",
  "Vaporizer",
  "Other",
];

export const PHENO_SAMPLING_BURN_QUALITY_OPTIONS: readonly string[] = [
  "Even",
  "Uneven",
  "Canoed",
  "Ran / one-sided",
  "Self-extinguished",
];

export const PHENO_SAMPLING_ASH_COLOR_OPTIONS: readonly string[] = [
  "Light gray / white",
  "Mid gray",
  "Dark gray",
  "Black",
  "Mixed",
];

export const PHENO_SAMPLING_OIL_RING_OPTIONS: readonly string[] = [
  "None visible",
  "Faint",
  "Moderate",
  "Pronounced",
];

/** Reminder rendered next to ash/oil-ring fields so testers don't overclaim. */
export const PHENO_SAMPLING_OBSERVATION_DISCLAIMER =
  "Ash color and oil ring are observations only — neither one proves quality or superiority on its own. Weigh them alongside aroma, flavor, effect, and cure.";
