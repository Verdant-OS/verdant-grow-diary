/**
 * phenoSexObservationModel
 *
 * Pure model for a grower's RECORDED observation of a candidate's sex:
 * female / male / hermaphrodite / unknown.
 *
 * Explicitly NOT an "AI sex reveal". Verdant does not detect, predict, or infer
 * plant sex from photos or anything else. This module only normalizes, labels,
 * and tallies observations the grower entered themselves. Whatever it shows is
 * what the grower logged — never a guess.
 *
 *  - No I/O. No fetch. No Supabase. No AI. No inference. No writes.
 *  - Deterministic, null-safe.
 */

export const PHENO_SEX_OBSERVATIONS = ["female", "male", "hermaphrodite", "unknown"] as const;
export type PhenoSexObservation = (typeof PHENO_SEX_OBSERVATIONS)[number];

export const DEFAULT_SEX_OBSERVATION: PhenoSexObservation = "unknown";

export const PHENO_SEX_OBSERVATION_LABELS: Record<PhenoSexObservation, string> = {
  female: "Female",
  male: "Male",
  hermaphrodite: "Hermaphrodite",
  unknown: "Unknown",
};

/**
 * Makes the no-inference posture explicit wherever sex is surfaced.
 */
export const PHENO_SEX_OBSERVATION_CAVEAT =
  "Sex shown here is what you recorded by observing the plant. Verdant does not detect or predict plant sex.";

/** Common grower shorthands mapped to the canonical observation. */
const SEX_ALIASES: Record<string, PhenoSexObservation> = {
  f: "female",
  fem: "female",
  female: "female",
  m: "male",
  male: "male",
  herm: "hermaphrodite",
  hermie: "hermaphrodite",
  hermaphrodite: "hermaphrodite",
  intersex: "hermaphrodite",
  unknown: "unknown",
  unsexed: "unknown",
};

/** Normalize arbitrary input to a known observation, defaulting to "unknown". */
export function normalizeSexObservation(input: unknown): PhenoSexObservation {
  if (typeof input === "string") {
    const v = input.trim().toLowerCase();
    if (v in SEX_ALIASES) return SEX_ALIASES[v];
  }
  return DEFAULT_SEX_OBSERVATION;
}

export function sexObservationLabel(observation: PhenoSexObservation): string {
  return PHENO_SEX_OBSERVATION_LABELS[observation];
}

export interface PhenoSexObservationInput {
  readonly candidateId: string;
  readonly candidateLabel?: string | null;
  /** Raw stored value; normalized to a known observation. */
  readonly sex?: unknown;
  readonly observedAt?: string | null;
  readonly note?: string | null;
}

export interface PhenoSexObservationView {
  readonly candidateId: string;
  readonly candidateLabel: string;
  readonly sex: PhenoSexObservation;
  readonly sexLabel: string;
  readonly observedAt: string | null;
  readonly note: string | null;
  /** True once the grower has recorded a non-default (non-"unknown") sex. */
  readonly isRecorded: boolean;
}

export type PhenoSexObservationTally = Record<PhenoSexObservation, number>;

export interface PhenoSexObservationSummary {
  /** Per-candidate views, in INPUT order (never ranked). */
  readonly candidates: readonly PhenoSexObservationView[];
  readonly tally: PhenoSexObservationTally;
  readonly recordedCount: number;
  readonly unknownCount: number;
  readonly caveat: string;
}

function cleanString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

function emptyTally(): PhenoSexObservationTally {
  return { female: 0, male: 0, hermaphrodite: 0, unknown: 0 };
}

/** Build the display view for one candidate's recorded sex observation. */
export function buildSexObservationView(input: PhenoSexObservationInput): PhenoSexObservationView {
  const candidateId = input.candidateId;
  const candidateLabel = cleanString(input.candidateLabel) ?? candidateId;
  const sex = normalizeSexObservation(input.sex);
  return {
    candidateId,
    candidateLabel,
    sex,
    sexLabel: sexObservationLabel(sex),
    observedAt: cleanString(input.observedAt),
    note: cleanString(input.note),
    isRecorded: sex !== DEFAULT_SEX_OBSERVATION,
  };
}

/**
 * Summarize recorded sex observations across candidates. Preserves input order
 * (never ranks) and reports a neutral tally.
 */
export function summarizeSexObservations(
  inputs: readonly PhenoSexObservationInput[] | null | undefined,
): PhenoSexObservationSummary {
  const list = Array.isArray(inputs) ? inputs : [];
  const candidates: PhenoSexObservationView[] = [];
  const tally = emptyTally();

  for (const input of list) {
    if (!input || typeof input.candidateId !== "string" || input.candidateId.length === 0) {
      continue;
    }
    const view = buildSexObservationView(input);
    candidates.push(view);
    tally[view.sex] += 1;
  }

  const unknownCount = tally.unknown;
  const recordedCount = candidates.length - unknownCount;

  return {
    candidates,
    tally,
    recordedCount,
    unknownCount,
    caveat: PHENO_SEX_OBSERVATION_CAVEAT,
  };
}
