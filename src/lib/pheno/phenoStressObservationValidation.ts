/**
 * Pure validation for a PHENOHUNT stress testing observation draft.
 *
 * Rules match the DB-side constraints on public.pheno_stress_observations:
 *  - candidate (plant), stress factor, status, intensity, recommendation,
 *    and start date are required.
 *  - Observed entries must have an end date and a plant response.
 *  - If end date is present it must be on or after start date.
 *
 * Returns a per-field record of issues plus a boolean flag. No side effects.
 */

export const PHENO_STRESS_STATUSES = ["planned", "observed"] as const;
export type PhenoStressStatus = (typeof PHENO_STRESS_STATUSES)[number];

export const PHENO_STRESS_INTENSITIES = ["low", "moderate", "high"] as const;
export type PhenoStressIntensity = (typeof PHENO_STRESS_INTENSITIES)[number];

export const PHENO_STRESS_RECOMMENDATIONS = ["keep", "watch", "reject"] as const;
export type PhenoStressRecommendation =
  (typeof PHENO_STRESS_RECOMMENDATIONS)[number];

export interface PhenoStressDraft {
  readonly plantId: string; // candidate ID
  readonly stressFactor: string;
  readonly status: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly intensity: string;
  readonly recommendation: string;
  readonly plantResponse: string;
  readonly recoveryNotes: string;
  readonly yieldImpactNotes: string;
  readonly diseasePestNotes: string;
  readonly linkedDiaryEntryId: string;
  readonly notes: string;
}

export type PhenoStressIssueKey =
  | "plantId"
  | "stressFactor"
  | "status"
  | "startDate"
  | "endDate"
  | "intensity"
  | "recommendation"
  | "plantResponse";

export type PhenoStressIssues = Partial<Record<PhenoStressIssueKey, string>>;

export interface PhenoStressValidation {
  readonly valid: boolean;
  readonly issues: PhenoStressIssues;
}

const isDate = (raw: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(raw) && !Number.isNaN(Date.parse(raw));

const nonEmpty = (raw: string): boolean => raw.trim().length > 0;

export function validatePhenoStressDraft(
  draft: PhenoStressDraft,
): PhenoStressValidation {
  const issues: PhenoStressIssues = {};

  if (!nonEmpty(draft.plantId)) issues.plantId = "Candidate is required.";
  if (!nonEmpty(draft.stressFactor))
    issues.stressFactor = "Stress factor is required.";

  if (!nonEmpty(draft.status)) {
    issues.status = "Planned or observed is required.";
  } else if (!(PHENO_STRESS_STATUSES as readonly string[]).includes(draft.status)) {
    issues.status = "Status must be planned or observed.";
  }

  if (!nonEmpty(draft.intensity)) {
    issues.intensity = "Intensity is required.";
  } else if (
    !(PHENO_STRESS_INTENSITIES as readonly string[]).includes(draft.intensity)
  ) {
    issues.intensity = "Intensity must be low, moderate, or high.";
  }

  if (!nonEmpty(draft.recommendation)) {
    issues.recommendation = "Recommendation is required.";
  } else if (
    !(PHENO_STRESS_RECOMMENDATIONS as readonly string[]).includes(
      draft.recommendation,
    )
  ) {
    issues.recommendation = "Recommendation must be keep, watch, or reject.";
  }

  if (!nonEmpty(draft.startDate)) {
    issues.startDate = "Start date is required.";
  } else if (!isDate(draft.startDate)) {
    issues.startDate = "Start date must be YYYY-MM-DD.";
  }

  if (nonEmpty(draft.endDate) && !isDate(draft.endDate)) {
    issues.endDate = "End date must be YYYY-MM-DD.";
  }

  if (
    !issues.startDate &&
    !issues.endDate &&
    nonEmpty(draft.endDate) &&
    draft.endDate < draft.startDate
  ) {
    issues.endDate = "End date must be on or after start date.";
  }

  if (draft.status === "observed") {
    if (!nonEmpty(draft.endDate) && !issues.endDate) {
      issues.endDate = "End date is required for observed entries.";
    }
    if (!nonEmpty(draft.plantResponse)) {
      issues.plantResponse = "Plant response is required for observed entries.";
    }
  }

  return { valid: Object.keys(issues).length === 0, issues };
}
