/**
 * Typed, user-safe failure for editable pheno evidence reads.
 *
 * Callers must never translate one of these failures into an empty evidence
 * map: an empty map means the database read succeeded and no row exists.
 */
export type PhenoEvidenceReadSource =
  | "candidate_scores"
  | "keeper_decisions"
  | "sex_observations"
  | "smoke_tests"
  | "lab_results"
  | "score_rounds"
  | "male_evaluations";

const READ_ERROR_MESSAGES: Record<PhenoEvidenceReadSource, string> = {
  candidate_scores: "Could not load candidate scores.",
  keeper_decisions: "Could not load keeper decisions.",
  sex_observations: "Could not load sex observations.",
  smoke_tests: "Could not load smoke tests.",
  lab_results: "Could not load lab results.",
  score_rounds: "Could not load this scoring round.",
  male_evaluations: "Could not load this male evaluation.",
};

export class PhenoEvidenceReadError extends Error {
  readonly source: PhenoEvidenceReadSource;

  constructor(source: PhenoEvidenceReadSource) {
    super(READ_ERROR_MESSAGES[source]);
    this.name = "PhenoEvidenceReadError";
    this.source = source;
  }
}
