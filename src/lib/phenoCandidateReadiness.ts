/**
 * phenoCandidateReadiness — pure, deterministic, stage-aware EVIDENCE-readiness
 * model for a single Pheno Hunt candidate.
 *
 * WHAT THIS IS: a description of how COMPLETE the recorded evidence is for a
 * candidate, so a grower can tell at a glance whether there is enough context
 * to compare it honestly against others. It measures evidence completeness —
 * NOT plant quality, NOT a keeper recommendation, NOT a ranking. "Comparison
 * ready" means "enough recorded context for a human to compare", never "this is
 * the one to keep".
 *
 * HARD RULES (enforced here and by tests):
 *  - Pure: no I/O, no Supabase, no React, no randomness, no module-level clock.
 *    Time is only ever read from an injected `options.now` — never new Date().
 *  - Null-safe and backward-compatible: every field is optional; missing data
 *    reads as "not recorded", never as complete.
 *  - Stage-aware: a goal only counts against a candidate once its stage makes
 *    that evidence expected. An early-stage plant is never penalised for
 *    missing late-stage (harvest / cure / lab) evidence as if it were overdue.
 *  - A setup checkbox is NOT evidence — only recorded observations count.
 *  - Demo / stale / invalid / unknown sensor telemetry can NEVER satisfy
 *    trustworthy sensor evidence (the caller passes only trusted-source counts;
 *    an all-untrusted sensor set surfaces a caution instead of completing a
 *    goal).
 *  - Deterministic: stable goal ordering and explicit tie-breakers; identical
 *    input always yields identical output.
 */

import type { PhenoCandidateInput } from "@/lib/phenoComparisonViewModel";
import { normalizePhenoSensorSource, isPhenoSensorSourceTrusted } from "@/lib/phenoComparisonRules";

export type PhenoReadinessLevel = "insufficient" | "partial" | "comparison_ready";

export type PhenoReadinessGoalId =
  | "identity"
  | "stage"
  | "observation"
  | "photo"
  | "trait_score"
  | "stress"
  | "sensor_context"
  | "aroma"
  | "sex"
  | "harvest"
  | "post_harvest"
  | "post_cure"
  | "lab"
  | "keeper_decision"
  | "clone_readiness";

/**
 * The recorded-evidence signals a readiness evaluation reads. Every field is
 * optional; absence always means "not recorded". Counts/booleans are already
 * trust-filtered by the caller (see `readinessEvidenceFromCandidateInput`).
 */
export interface PhenoReadinessEvidence {
  readonly candidateId: string;
  readonly candidateNumber?: number | null;
  readonly candidateLabel?: string | null;
  readonly plantLabel?: string | null;
  /** Free-text plant stage (seedling / vegetative / flower / harvest / …). */
  readonly stage?: string | null;

  /** Diary / Quick Log entries recorded for this candidate. */
  readonly quickLogCount?: number | null;
  /** Photos attached (used as a stage-tagged photo signal). */
  readonly photoCount?: number | null;
  /** Any recorded loud-trait score (overall card or a staged round). */
  readonly hasTraitScore?: boolean | null;
  /** Aroma descriptors or a nose note recorded. */
  readonly hasAromaNote?: boolean | null;
  /** Stress observation recorded (planned or observed). */
  readonly hasStressObservation?: boolean | null;
  /**
   * Number of TRUSTED (live / manual / csv) sensor snapshots. Demo / stale /
   * invalid / unknown snapshots must be excluded by the caller and reported via
   * `untrustedSensorPresent`.
   */
  readonly trustedSensorSnapshotCount?: number | null;
  /** True when snapshots exist but none are from a trusted source. */
  readonly untrustedSensorPresent?: boolean | null;

  /** A real sex observation is recorded (not merely the default). */
  readonly sexObserved?: boolean | null;

  /** Harvest / yield milestone or weight recorded. */
  readonly hasHarvestEvidence?: boolean | null;
  /** Post-harvest notes recorded (trim / density / moisture). */
  readonly hasPostHarvestNote?: boolean | null;
  /** Post-cure smoke test with content recorded. */
  readonly hasPostCureSmokeTest?: boolean | null;
  /** A source-tagged lab result is attached. */
  readonly hasLabResult?: boolean | null;
  /** Provenance of the attached lab result, when known. */
  readonly labSource?: "coa" | "estimate" | "unspecified" | null;

  /** Keeper decision recorded (keep / cull / hold). "undecided" ≠ decided. */
  readonly keeperDecision?: string | null;
  /** A rationale/note accompanies the keeper decision. */
  readonly keeperRationale?: string | null;

  /**
   * Replication readiness (clones taken / mother assigned). `undefined`/null =
   * not evaluated (never penalised — matches the existing app contract); a real
   * `true` completes the supporting goal.
   */
  readonly cloneReadinessRecorded?: boolean | null;

  /** ISO timestamp of the most recent recorded observation (for freshness). */
  readonly latestObservationAt?: string | null;
}

export interface PhenoReadinessGoalResult {
  readonly id: PhenoReadinessGoalId;
  readonly label: string;
  /** Stable workspace anchor id for a next-step deep link, or null (inert). */
  readonly anchor: string | null;
  readonly complete: boolean;
  /** Whether this goal is expected at the candidate's current stage. */
  readonly applicable: boolean;
  /** Required goals gate "comparison_ready"; supporting goals never block it. */
  readonly required: boolean;
}

export interface PhenoCandidateReadiness {
  readonly candidateId: string;
  readonly readiness: PhenoReadinessLevel;
  readonly completedGoalCount: number;
  readonly selectedGoalCount: number;
  readonly completedGoals: readonly PhenoReadinessGoalId[];
  readonly missingGoals: readonly PhenoReadinessGoalId[];
  readonly nextEvidenceTarget: {
    readonly goalId: PhenoReadinessGoalId;
    readonly label: string;
    readonly anchor: string | null;
  } | null;
  readonly cautionReasons: readonly string[];
  /** Full per-goal breakdown for presenters that want to render every row. */
  readonly goals: readonly PhenoReadinessGoalResult[];
}

export interface PhenoReadinessOptions {
  /** Injected clock for freshness checks. Freshness is skipped when absent. */
  readonly now?: Date;
  /** Days after which a pre-harvest candidate's last observation is "stale". */
  readonly stalenessDays?: number;
}

// ---------------------------------------------------------------------------
// Stage model — rank a free-text stage so late-stage goals only apply once the
// candidate has actually reached that stage. Unknown stage ranks as early
// (vegetative) so late evidence is treated as "not yet expected", never overdue.
// ---------------------------------------------------------------------------

const STAGE_SEEDLING = 0;
const STAGE_VEG = 1;
const STAGE_FLOWER = 2;
const STAGE_HARVEST = 3;
const STAGE_DRYING = 4;
const STAGE_CURING = 5;
const STAGE_CURED = 6;

function normalizeStageRank(stage: string | null | undefined): {
  rank: number;
  known: boolean;
} {
  if (typeof stage !== "string") return { rank: STAGE_VEG, known: false };
  const s = stage.trim().toLowerCase();
  if (s.length === 0) return { rank: STAGE_VEG, known: false };
  if (/(seed|germ|sprout|clone)/.test(s)) return { rank: STAGE_SEEDLING, known: true };
  if (/(veg|grow)/.test(s)) return { rank: STAGE_VEG, known: true };
  if (/(cured|cure)/.test(s)) return { rank: STAGE_CURING, known: true };
  if (/(dry|hang)/.test(s)) return { rank: STAGE_DRYING, known: true };
  if (/(harvest|chop)/.test(s)) return { rank: STAGE_HARVEST, known: true };
  if (/(flower|bloom|budd?ing|preflower)/.test(s)) return { rank: STAGE_FLOWER, known: true };
  if (/(finished|done|complete|archive)/.test(s)) return { rank: STAGE_CURED, known: true };
  // A recognised-but-unmapped non-empty stage: known label, treat as veg-era.
  return { rank: STAGE_VEG, known: true };
}

interface GoalSpec {
  readonly id: PhenoReadinessGoalId;
  readonly label: string;
  readonly anchor: string | null;
  readonly required: boolean;
  /** Minimum stage rank at which this goal becomes expected. */
  readonly appliesFromRank: number;
  readonly isComplete: (e: PhenoReadinessEvidence) => boolean;
}

function num(v: number | null | undefined): number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;
}

function isValidCandidateNumber(v: number | null | undefined): boolean {
  return typeof v === "number" && Number.isInteger(v) && v > 0;
}

function cleanStr(v: string | null | undefined): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

// Ordered by evidence progression so nextEvidenceTarget and the rendered list
// read top-to-bottom in the order a grower actually records them.
const GOAL_SPECS: readonly GoalSpec[] = [
  {
    id: "identity",
    label: "Candidate identity",
    anchor: "candidate-labels",
    required: true,
    appliesFromRank: STAGE_SEEDLING,
    isComplete: (e) =>
      isValidCandidateNumber(e.candidateNumber) ||
      cleanStr(e.candidateLabel) !== null ||
      cleanStr(e.plantLabel) !== null,
  },
  {
    id: "stage",
    label: "Plant stage recorded",
    anchor: null,
    required: true,
    appliesFromRank: STAGE_SEEDLING,
    isComplete: (e) => normalizeStageRank(e.stage).known,
  },
  {
    id: "observation",
    label: "Diary / Quick Log observation",
    anchor: "phenotype-notes",
    required: true,
    appliesFromRank: STAGE_SEEDLING,
    isComplete: (e) =>
      num(e.quickLogCount) > 0 || e.hasTraitScore === true || num(e.photoCount) > 0,
  },
  {
    id: "photo",
    label: "Stage-tagged photo",
    anchor: null,
    required: false,
    appliesFromRank: STAGE_VEG,
    isComplete: (e) => num(e.photoCount) > 0,
  },
  {
    id: "trait_score",
    label: "Trait score",
    anchor: "phenotype-notes",
    required: true,
    appliesFromRank: STAGE_VEG,
    isComplete: (e) => e.hasTraitScore === true,
  },
  {
    id: "stress",
    label: "Stress observation",
    anchor: null,
    required: false,
    appliesFromRank: STAGE_VEG,
    isComplete: (e) => e.hasStressObservation === true,
  },
  {
    id: "sensor_context",
    label: "Trusted sensor context",
    anchor: null,
    required: false,
    appliesFromRank: STAGE_VEG,
    isComplete: (e) => num(e.trustedSensorSnapshotCount) > 0,
  },
  {
    id: "aroma",
    label: "Aroma / nose note",
    anchor: "phenotype-notes",
    required: true,
    appliesFromRank: STAGE_FLOWER,
    isComplete: (e) => e.hasAromaNote === true,
  },
  {
    id: "sex",
    label: "Sex observation",
    anchor: "phenotype-notes",
    required: true,
    appliesFromRank: STAGE_FLOWER,
    isComplete: (e) => e.sexObserved === true,
  },
  {
    id: "harvest",
    label: "Harvest / yield evidence",
    anchor: "post-harvest-notes",
    required: true,
    appliesFromRank: STAGE_HARVEST,
    isComplete: (e) => e.hasHarvestEvidence === true,
  },
  {
    id: "post_harvest",
    label: "Post-harvest notes",
    anchor: "post-harvest-notes",
    required: true,
    appliesFromRank: STAGE_HARVEST,
    isComplete: (e) => e.hasPostHarvestNote === true,
  },
  {
    id: "keeper_decision",
    label: "Keeper decision",
    anchor: "phenotype-notes",
    required: true,
    appliesFromRank: STAGE_HARVEST,
    isComplete: (e) => {
      const d = cleanStr(e.keeperDecision);
      return d !== null && d.toLowerCase() !== "undecided";
    },
  },
  {
    id: "post_cure",
    label: "Post-cure smoke test",
    anchor: "post-cure-notes",
    required: true,
    appliesFromRank: STAGE_CURING,
    isComplete: (e) => e.hasPostCureSmokeTest === true,
  },
  {
    id: "lab",
    label: "Source-tagged lab result",
    anchor: "post-cure-notes",
    required: false,
    appliesFromRank: STAGE_CURING,
    isComplete: (e) => e.hasLabResult === true,
  },
  {
    id: "clone_readiness",
    label: "Replication readiness",
    anchor: null,
    required: false,
    appliesFromRank: STAGE_FLOWER,
    isComplete: (e) => e.cloneReadinessRecorded === true,
  },
];

/**
 * Evaluate evidence readiness for a single candidate. Pure and deterministic.
 */
export function evaluatePhenoCandidateReadiness(
  evidence: PhenoReadinessEvidence,
  options: PhenoReadinessOptions = {},
): PhenoCandidateReadiness {
  const { rank } = normalizeStageRank(evidence.stage);

  const goals: PhenoReadinessGoalResult[] = GOAL_SPECS.map((spec) => {
    const applicable = rank >= spec.appliesFromRank;
    return {
      id: spec.id,
      label: spec.label,
      anchor: spec.anchor,
      required: spec.required,
      applicable,
      complete: applicable ? spec.isComplete(evidence) : false,
    };
  });

  const applicableGoals = goals.filter((g) => g.applicable);
  const completedGoals = applicableGoals.filter((g) => g.complete);
  const missingGoalResults = applicableGoals.filter((g) => !g.complete);

  const requiredApplicable = applicableGoals.filter((g) => g.required);
  const requiredComplete = requiredApplicable.filter((g) => g.complete);
  const allRequiredComplete = requiredApplicable.length === requiredComplete.length;

  // Foundational gate: identity + observation are the floor for ANY comparison.
  const foundationalIds: PhenoReadinessGoalId[] = ["identity", "observation"];
  const foundationalComplete = foundationalIds.every(
    (id) => goals.find((g) => g.id === id)?.complete === true,
  );
  // Real phenotype substance: at least one recorded phenotype signal.
  const phenotypeIds: PhenoReadinessGoalId[] = ["trait_score", "aroma", "sex", "photo"];
  const hasPhenotypeSubstance = phenotypeIds.some(
    (id) => goals.find((g) => g.id === id)?.complete === true,
  );

  let readiness: PhenoReadinessLevel;
  if (!foundationalComplete) {
    readiness = "insufficient";
  } else if (allRequiredComplete && hasPhenotypeSubstance) {
    readiness = "comparison_ready";
  } else {
    readiness = "partial";
  }

  // Next target: the first missing REQUIRED applicable goal in progression
  // order, or null when no required gap remains. Supporting goals (photo,
  // stress, sensor, lab, clone) are surfaced in `goals`/`missingGoals` but are
  // never presented as THE next required action — so a comparison_ready
  // candidate has no next target.
  const nextMissing = missingGoalResults.find((g) => g.required) ?? null;

  const cautionReasons = buildCautions(evidence, goals, rank, options);

  return {
    candidateId: evidence.candidateId,
    readiness,
    completedGoalCount: completedGoals.length,
    selectedGoalCount: applicableGoals.length,
    completedGoals: completedGoals.map((g) => g.id),
    missingGoals: missingGoalResults.map((g) => g.id),
    nextEvidenceTarget: nextMissing
      ? { goalId: nextMissing.id, label: nextMissing.label, anchor: nextMissing.anchor }
      : null,
    cautionReasons,
    goals,
  };
}

function buildCautions(
  e: PhenoReadinessEvidence,
  goals: readonly PhenoReadinessGoalResult[],
  rank: number,
  options: PhenoReadinessOptions,
): string[] {
  const cautions: string[] = [];

  if (!normalizeStageRank(e.stage).known) {
    cautions.push("Plant stage is not recorded — readiness assumes an early stage.");
  }
  if (e.untrustedSensorPresent === true && num(e.trustedSensorSnapshotCount) === 0) {
    cautions.push(
      "Sensor snapshots are demo / stale / invalid — not counted as trustworthy evidence.",
    );
  }
  // Keeper decision recorded without a rationale is weaker evidence.
  const decision = cleanStr(e.keeperDecision);
  if (
    decision !== null &&
    decision.toLowerCase() !== "undecided" &&
    cleanStr(e.keeperRationale) === null
  ) {
    cautions.push("Keeper decision recorded without a rationale.");
  }
  // Lab attached but only an estimate (not a COA) — flag provenance.
  if (e.hasLabResult === true && e.labSource === "estimate") {
    cautions.push("Lab result is a self-estimate, not a lab COA.");
  }
  if (e.hasLabResult === true && e.labSource === "unspecified") {
    cautions.push("Lab result has an unspecified source.");
  }
  // Freshness — only when a clock is injected AND a timestamp is present, and
  // only for pre-harvest candidates (post-harvest plants stop growing).
  if (options.now && rank < STAGE_HARVEST) {
    const at = cleanStr(e.latestObservationAt);
    const parsed = at ? Date.parse(at) : NaN;
    if (Number.isFinite(parsed)) {
      const days = (options.now.getTime() - parsed) / 86_400_000;
      const threshold = options.stalenessDays ?? 21;
      if (days >= threshold) {
        cautions.push(`No observation recorded in the last ${Math.floor(days)} days.`);
      }
    }
  }
  void goals;
  return cautions;
}

// ---------------------------------------------------------------------------
// Mapper — derive a readiness-evidence record from a PhenoCandidateInput plus
// optional caller extras (evidence that lives in service maps, not on the
// candidate). Sensor trust is applied HERE so the core model only ever sees
// trusted counts.
// ---------------------------------------------------------------------------

export interface PhenoReadinessExtras {
  readonly hasTraitScore?: boolean;
  readonly hasStressObservation?: boolean;
  readonly sexObserved?: boolean;
  readonly hasHarvestEvidence?: boolean;
  readonly hasPostHarvestNote?: boolean;
  readonly hasPostCureSmokeTest?: boolean;
  readonly hasLabResult?: boolean;
  readonly labSource?: "coa" | "estimate" | "unspecified" | null;
  readonly keeperDecision?: string | null;
  readonly keeperRationale?: string | null;
  readonly cloneReadinessRecorded?: boolean;
  readonly latestObservationAt?: string | null;
}

/** Count only trusted (live/manual/csv) sensor snapshots; flag untrusted ones. */
function summarizeSensors(candidate: PhenoCandidateInput): {
  trusted: number;
  untrustedPresent: boolean;
} {
  const snaps = Array.isArray(candidate.sensorSnapshots) ? candidate.sensorSnapshots : [];
  let trusted = 0;
  let untrusted = 0;
  for (const s of snaps) {
    const source = normalizePhenoSensorSource(s?.source ?? null);
    if (isPhenoSensorSourceTrusted(source)) trusted += 1;
    else untrusted += 1;
  }
  return { trusted, untrustedPresent: untrusted > 0 };
}

/** Derive an aroma/trait signal from a candidate's own expression payload. */
function candidateExpressionSignals(candidate: PhenoCandidateInput): {
  hasTraitScore: boolean;
  hasAromaNote: boolean;
  hasSmoke: boolean;
  hasLab: boolean;
  labSource: "coa" | "estimate" | "unspecified" | null;
} {
  const e = candidate.expression;
  if (!e) {
    return {
      hasTraitScore: false,
      hasAromaNote: false,
      hasSmoke: false,
      hasLab: false,
      labSource: null,
    };
  }
  const hasTraitScore = (e.traits?.length ?? 0) > 0;
  const hasAromaNote =
    (e.aromaDescriptors?.length ?? 0) > 0 || cleanStr(e.noseNote ?? null) !== null;
  const smoke = e.smokeTest;
  const hasSmoke =
    !!smoke &&
    (cleanStr(smoke.verdict ?? null) !== null ||
      (smoke.flavorDescriptors?.length ?? 0) > 0 ||
      (smoke.effectDescriptors?.length ?? 0) > 0);
  const lab = e.labResult;
  const hasLab = !!lab;
  const labSource = lab ? normalizeLabSource(lab.source) : null;
  return { hasTraitScore, hasAromaNote, hasSmoke, hasLab, labSource };
}

function normalizeLabSource(v: unknown): "coa" | "estimate" | "unspecified" {
  return v === "coa" || v === "estimate" ? v : "unspecified";
}

/**
 * Build a `PhenoReadinessEvidence` from a candidate's own data plus optional
 * `extras`. `extras` (recorded rows the candidate object doesn't carry — sex,
 * decision, stress, harvest…) win over anything inferred from `expression`.
 */
export function readinessEvidenceFromCandidateInput(
  candidate: PhenoCandidateInput,
  extras: PhenoReadinessExtras = {},
): PhenoReadinessEvidence {
  const sensors = summarizeSensors(candidate);
  const expr = candidateExpressionSignals(candidate);

  return {
    candidateId: candidate.candidateId,
    candidateNumber: candidate.candidateNumber ?? null,
    candidateLabel: candidate.candidateLabel ?? null,
    plantLabel: candidate.plantLabel ?? null,
    stage: candidate.stage ?? null,
    quickLogCount: Array.isArray(candidate.quickLogEntries) ? candidate.quickLogEntries.length : 0,
    photoCount: Array.isArray(candidate.photos) ? candidate.photos.length : 0,
    hasTraitScore: extras.hasTraitScore ?? expr.hasTraitScore,
    hasAromaNote: expr.hasAromaNote,
    hasStressObservation: extras.hasStressObservation ?? false,
    trustedSensorSnapshotCount: sensors.trusted,
    untrustedSensorPresent: sensors.untrustedPresent,
    sexObserved: extras.sexObserved ?? false,
    hasHarvestEvidence: extras.hasHarvestEvidence ?? false,
    hasPostHarvestNote: extras.hasPostHarvestNote ?? false,
    hasPostCureSmokeTest: extras.hasPostCureSmokeTest ?? expr.hasSmoke,
    hasLabResult: extras.hasLabResult ?? expr.hasLab,
    labSource: extras.labSource ?? expr.labSource,
    keeperDecision: extras.keeperDecision ?? null,
    keeperRationale: extras.keeperRationale ?? null,
    cloneReadinessRecorded: extras.cloneReadinessRecorded,
    latestObservationAt: extras.latestObservationAt ?? null,
  };
}

/** Presentation labels for each readiness level (no ranking / winner language). */
export const PHENO_READINESS_LABELS: Record<PhenoReadinessLevel, string> = {
  insufficient: "Not enough evidence",
  partial: "Gathering evidence",
  comparison_ready: "Comparison-ready",
};
