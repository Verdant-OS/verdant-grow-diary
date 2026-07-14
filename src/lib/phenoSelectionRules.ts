/**
 * phenoSelectionRules — pure selection-evidence logic for the read-only
 * Pheno Comparison surface.
 *
 * Sensors describe the room, not the plant, so telemetry never drives
 * anything here. This module models what a breeder actually selects on:
 * phenotype traits, timepoint alignment, replication, post-cure
 * follow-through, and an overall judgment of whether candidates are even
 * comparable.
 *
 * Hard constraints (see AGENTS.md):
 *   - Pure. No I/O, no React, no Supabase, no AI, no timers, no randomness.
 *   - Deterministic. Null-safe. Stable ordering.
 *   - Never overstates: a thin/incomplete record is never a "keeper/winner",
 *     and comparability always defaults to the MORE cautious verdict.
 */

// ---------------------------------------------------------------------------
// Phenotype traits
// ---------------------------------------------------------------------------

export const PHENOTYPE_TRAIT_KEYS = [
  "structure",
  "bud_density",
  "resin",
  "aroma",
  "vigor",
  "stretch",
  "node_spacing",
  "disease_resistance",
  "finish",
  "yield",
] as const;
export type PhenotypeTraitKey = (typeof PHENOTYPE_TRAIT_KEYS)[number];

/** Traits a serious side-by-side comparison must have to be meaningful. */
export const CORE_PHENOTYPE_TRAIT_KEYS: readonly PhenotypeTraitKey[] = [
  "structure",
  "bud_density",
  "resin",
  "aroma",
  "vigor",
  "finish",
];

export const PHENOTYPE_TRAIT_LABELS: Record<PhenotypeTraitKey, string> = {
  structure: "Structure",
  bud_density: "Bud density",
  resin: "Resin / trichomes",
  aroma: "Aroma / nose",
  vigor: "Vigor",
  stretch: "Stretch",
  node_spacing: "Node spacing",
  disease_resistance: "Disease resistance",
  finish: "Finish time",
  yield: "Yield",
};

export interface PhenotypeTraitInput {
  value?: number | string | null;
  note?: string | null;
}
export type PhenotypeInput = Partial<
  Record<PhenotypeTraitKey, PhenotypeTraitInput>
>;

export interface PhenotypeTraitCell {
  key: PhenotypeTraitKey;
  label: string;
  core: boolean;
  recorded: boolean;
  valueLabel: string | null;
  note: string | null;
}

export interface PhenotypeClassification {
  traits: PhenotypeTraitCell[];
  recordedCoreCount: number;
  coreTotal: number;
  recordedTotal: number;
  traitTotal: number;
  missingCoreKeys: PhenotypeTraitKey[];
}

function cleanStr(v: string | null | undefined): string {
  return typeof v === "string" ? v.trim() : "";
}

function formatTraitValue(value: number | string | null | undefined): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string") {
    const t = value.trim();
    return t.length > 0 ? t : null;
  }
  return null;
}

export function classifyPhenotype(
  input: PhenotypeInput | null | undefined,
): PhenotypeClassification {
  const src = input ?? {};
  const traits: PhenotypeTraitCell[] = PHENOTYPE_TRAIT_KEYS.map((key) => {
    const cell = src[key];
    const valueLabel = formatTraitValue(cell?.value);
    const note = cleanStr(cell?.note) || null;
    const recorded = valueLabel !== null || note !== null;
    return {
      key,
      label: PHENOTYPE_TRAIT_LABELS[key],
      core: CORE_PHENOTYPE_TRAIT_KEYS.includes(key),
      recorded,
      valueLabel,
      note,
    };
  });

  const core = traits.filter((t) => t.core);
  const recordedCoreCount = core.filter((t) => t.recorded).length;
  const missingCoreKeys = core.filter((t) => !t.recorded).map((t) => t.key);

  return {
    traits,
    recordedCoreCount,
    coreTotal: core.length,
    recordedTotal: traits.filter((t) => t.recorded).length,
    traitTotal: traits.length,
    missingCoreKeys,
  };
}

// ---------------------------------------------------------------------------
// Selection strength (never a health/winner claim)
// ---------------------------------------------------------------------------

export type SelectionStrength = "strong" | "partial" | "thin";
export type SelectionTone = "neutral" | "caution" | "danger";

export interface SelectionEvidence {
  strength: SelectionStrength;
  label: string;
  tone: SelectionTone;
  recordedCoreCount: number;
  coreTotal: number;
  recordedTotal: number;
  traitTotal: number;
  missingCoreKeys: PhenotypeTraitKey[];
}

const STRENGTH_LABELS: Record<SelectionStrength, string> = {
  strong: "Strong record",
  partial: "Partial record",
  thin: "Thin record",
};
// Even "strong" is neutral — no green/success treatment for a demo record.
const STRENGTH_TONES: Record<SelectionStrength, SelectionTone> = {
  strong: "neutral",
  partial: "caution",
  thin: "danger",
};

export function deriveSelectionStrength(
  cls: PhenotypeClassification,
  postCured: boolean,
): SelectionStrength {
  if (cls.recordedCoreCount <= 2) return "thin";
  if (cls.recordedCoreCount === cls.coreTotal && postCured) return "strong";
  return "partial";
}

export function buildSelectionEvidence(
  cls: PhenotypeClassification,
  postCured: boolean,
): SelectionEvidence {
  const strength = deriveSelectionStrength(cls, postCured);
  return {
    strength,
    label: STRENGTH_LABELS[strength],
    tone: STRENGTH_TONES[strength],
    recordedCoreCount: cls.recordedCoreCount,
    coreTotal: cls.coreTotal,
    recordedTotal: cls.recordedTotal,
    traitTotal: cls.traitTotal,
    missingCoreKeys: cls.missingCoreKeys,
  };
}

// ---------------------------------------------------------------------------
// Timepoint
// ---------------------------------------------------------------------------

export interface TimepointInput {
  dayOfFlower?: number | null;
  stage?: string | null;
}

export interface TimepointAssessment {
  dayOfFlower: number | null;
  stage: string | null;
  known: boolean;
  label: string;
}

export function assessTimepoint(input: TimepointInput): TimepointAssessment {
  // Only a non-negative finite day is a known timepoint. A negative/impossible
  // value is bad chronology and is degraded to null so it surfaces as a
  // timepoint gap instead of rendering "Day -1" or faking alignment.
  const day =
    typeof input.dayOfFlower === "number" &&
    Number.isFinite(input.dayOfFlower) &&
    input.dayOfFlower >= 0
      ? input.dayOfFlower
      : null;
  const stage = cleanStr(input.stage) || null;
  const known = day !== null;
  let label: string;
  if (day !== null) label = `Day ${day} of flower`;
  else if (stage) label = `${stage} — day-of-flower not recorded`;
  else label = "Timepoint not recorded";
  return { dayOfFlower: day, stage, known, label };
}

// ---------------------------------------------------------------------------
// Replication
// ---------------------------------------------------------------------------

export interface ReplicationAssessment {
  count: number | null;
  replicated: boolean;
  flagged: boolean;
  label: string;
}

export function assessReplication(
  count: number | null | undefined,
): ReplicationAssessment {
  const n =
    typeof count === "number" && Number.isFinite(count) && count > 0
      ? Math.floor(count)
      : null;
  const replicated = n !== null && n >= 2;
  let label: string;
  if (n === null) label = "Replication not recorded";
  else if (n >= 2) label = `${n} plants`;
  else label = "Single specimen — stability unknown";
  return { count: n, replicated, flagged: !replicated, label };
}

// ---------------------------------------------------------------------------
// Post-cure
// ---------------------------------------------------------------------------

export interface PostCureInput {
  curedDays?: number | null;
  noseAfterCure?: string | null;
  quality?: string | null;
  keeperImpression?: string | null;
}

export interface PostCureAssessment {
  cured: boolean;
  curedDays: number | null;
  noseAfterCure: string | null;
  quality: string | null;
  keeperImpression: string | null;
  flagged: boolean;
  label: string;
}

export function assessPostCure(
  input: PostCureInput | null | undefined,
): PostCureAssessment {
  const src = input ?? {};
  // Require at least one full cured day. A sub-day fraction (e.g. 0.5 from a
  // timestamp diff) must not floor to "Cured 0 days" and clear the not-cured
  // caveat — that would overstate incomplete post-cure evidence.
  const days =
    typeof src.curedDays === "number" && Number.isFinite(src.curedDays) && src.curedDays >= 1
      ? Math.floor(src.curedDays)
      : null;
  const cured = days !== null;
  return {
    cured,
    curedDays: days,
    noseAfterCure: cleanStr(src.noseAfterCure) || null,
    quality: cleanStr(src.quality) || null,
    keeperImpression: cleanStr(src.keeperImpression) || null,
    flagged: !cured,
    label: cured ? `Cured ${days} days` : "Not cured yet — selection incomplete",
  };
}

// ---------------------------------------------------------------------------
// Selection caveats (honest, plain, never positive for a gap)
// ---------------------------------------------------------------------------

export type SelectionCaveatCode =
  | "thin_phenotype"
  | "missing_phenotype"
  | "not_cured"
  | "single_specimen"
  | "timepoint_unknown"
  | "no_photo";

export interface SelectionCaveat {
  code: SelectionCaveatCode;
  label: string;
  copy: string;
}

const CAVEAT_ORDER: readonly SelectionCaveatCode[] = [
  "thin_phenotype",
  "missing_phenotype",
  "not_cured",
  "single_specimen",
  "timepoint_unknown",
  "no_photo",
];

const CAVEAT_LABELS: Record<SelectionCaveatCode, string> = {
  thin_phenotype: "Thin phenotype",
  missing_phenotype: "Missing phenotype",
  not_cured: "Not cured",
  single_specimen: "Single specimen",
  timepoint_unknown: "Timepoint unknown",
  no_photo: "No photo",
};

export interface DeriveSelectionCaveatsInput {
  hasPhoto: boolean;
  phenotype: PhenotypeClassification;
  selection: SelectionEvidence;
  replication: ReplicationAssessment;
  timepoint: TimepointAssessment;
  postCure: PostCureAssessment;
}

export function deriveSelectionCaveats(
  input: DeriveSelectionCaveatsInput,
): SelectionCaveat[] {
  const out: SelectionCaveat[] = [];

  if (input.selection.strength === "thin") {
    out.push({
      code: "thin_phenotype",
      label: CAVEAT_LABELS.thin_phenotype,
      copy: "Too few phenotype traits recorded to compare.",
    });
  } else if (input.phenotype.missingCoreKeys.length > 0) {
    const names = input.phenotype.missingCoreKeys
      .map((k) => PHENOTYPE_TRAIT_LABELS[k])
      .join(", ");
    out.push({
      code: "missing_phenotype",
      label: CAVEAT_LABELS.missing_phenotype,
      copy: `Phenotype record is incomplete — ${names} not recorded.`,
    });
  }

  if (input.postCure.flagged) {
    out.push({
      code: "not_cured",
      label: CAVEAT_LABELS.not_cured,
      copy: "Not cured yet — selection is incomplete until post-cure.",
    });
  }
  if (input.replication.flagged) {
    out.push({
      code: "single_specimen",
      label: CAVEAT_LABELS.single_specimen,
      copy: "Single specimen — pheno stability is unknown.",
    });
  }
  if (!input.timepoint.known) {
    out.push({
      code: "timepoint_unknown",
      label: CAVEAT_LABELS.timepoint_unknown,
      copy: "Day-of-flower not recorded — timepoint can't be aligned.",
    });
  }
  if (!input.hasPhoto) {
    out.push({
      code: "no_photo",
      label: CAVEAT_LABELS.no_photo,
      copy: "No photo attached for this candidate.",
    });
  }

  return out.sort(
    (a, b) => CAVEAT_ORDER.indexOf(a.code) - CAVEAT_ORDER.indexOf(b.code),
  );
}

// ---------------------------------------------------------------------------
// Comparability grade — grades the COMPARISON, not each candidate.
// ---------------------------------------------------------------------------

export type ComparabilityVerdict =
  | "comparable"
  | "comparable_with_caveats"
  | "not_comparable";

export interface ComparabilityGrade {
  verdict: ComparabilityVerdict;
  label: string;
  tone: SelectionTone;
  reasons: string[];
}

export interface ComparabilityCandidate {
  /** Stable grow/tent IDs — authoritative for environment identity. */
  tentId: string | null;
  growId: string | null;
  /** Display names — user-editable and can collide across runs. */
  tentName: string | null;
  growName: string | null;
  /** Growing medium (e.g. coco, hydro, soil) — root-zone conditions. */
  medium: string | null;
  dayOfFlower: number | null;
  replicated: boolean;
  strength: SelectionStrength;
  cured: boolean;
}

const COMPARABILITY_LABELS: Record<ComparabilityVerdict, string> = {
  comparable: "Comparable",
  comparable_with_caveats: "Comparable with caveats",
  not_comparable: "Not directly comparable",
};
const COMPARABILITY_TONES: Record<ComparabilityVerdict, SelectionTone> = {
  comparable: "neutral",
  comparable_with_caveats: "caution",
  not_comparable: "danger",
};

export const DEFAULT_DAY_OF_FLOWER_TOLERANCE = 5;

export function gradeComparability(
  candidates: readonly ComparabilityCandidate[],
  opts: { dayTolerance?: number } = {},
): ComparabilityGrade {
  const dayTol = opts.dayTolerance ?? DEFAULT_DAY_OF_FLOWER_TOLERANCE;

  if (candidates.length < 2) {
    return grade("not_comparable", [
      "Fewer than two candidates — nothing to compare yet.",
    ]);
  }

  const reasons: string[] = [];

  // Environment identity. Prefer stable IDs — display names are user-editable
  // and can collide across runs (two grows both named "Summer 2026"). Distinct
  // IDs OR distinct names are a hard confound (clearly different environments).
  // Parity is only *confirmed* when every candidate shares one tent ID and one
  // grow ID; a shared name without matching IDs cannot prove parity → caveat.
  const tentIds = new Set(
    candidates.map((c) => c.tentId).filter((v): v is string => !!v),
  );
  const growIds = new Set(
    candidates.map((c) => c.growId).filter((v): v is string => !!v),
  );
  const tentNames = new Set(
    candidates.map((c) => c.tentName).filter((v): v is string => !!v),
  );
  const growNames = new Set(
    candidates.map((c) => c.growName).filter((v): v is string => !!v),
  );

  // Growing medium (root zone). Different media (e.g. coco vs hydro) is a hard
  // confound even in the same tent; a missing medium can't confirm parity.
  const media = new Set(
    candidates.map((c) => c.medium).filter((v): v is string => !!v),
  );

  const idConfound =
    tentIds.size > 1 ||
    growIds.size > 1 ||
    tentNames.size > 1 ||
    growNames.size > 1;
  const mediaConfound = media.size > 1;
  const envConfound = idConfound || mediaConfound;

  const idParityConfirmed =
    candidates.every((c) => !!c.tentId) &&
    tentIds.size === 1 &&
    candidates.every((c) => !!c.growId) &&
    growIds.size === 1;
  const mediaParityConfirmed =
    candidates.every((c) => !!c.medium) && media.size === 1;
  const parityConfirmed = idParityConfirmed && mediaParityConfirmed;
  const envUnknown = !envConfound && !parityConfirmed;

  if (idConfound) {
    reasons.push(
      "Candidates were run in different tents/grows — environment differences confound the comparison.",
    );
  }
  if (mediaConfound) {
    reasons.push(
      "Candidates were grown in different media (e.g. coco vs hydro) — root-zone conditions differ.",
    );
  }
  if (envUnknown) {
    if (!idParityConfirmed) {
      reasons.push(
        "Environment identity can't be confirmed from stored grow/tent IDs — display names alone can't prove parity.",
      );
    }
    if (!mediaParityConfirmed) {
      reasons.push(
        "Growing medium is missing for at least one candidate — root-zone parity can't be confirmed.",
      );
    }
  }

  // Timepoint alignment.
  const days = candidates
    .map((c) => c.dayOfFlower)
    .filter((d): d is number => typeof d === "number");
  const daysKnownForAll = days.length === candidates.length;
  let timepointMisaligned = false;
  if (!daysKnownForAll) {
    timepointMisaligned = true;
    reasons.push(
      "Day-of-flower is missing for at least one candidate — timepoint alignment can't be confirmed.",
    );
  } else {
    const spread = Math.max(...days) - Math.min(...days);
    if (spread > dayTol) {
      timepointMisaligned = true;
      reasons.push(
        `Candidates are ${spread} days apart in flower — compared at different timepoints.`,
      );
    }
  }

  // Record depth.
  const anyThin = candidates.some((c) => c.strength === "thin");
  if (anyThin) {
    reasons.push(
      "At least one candidate has a thin phenotype record — too little evidence to compare.",
    );
  }

  const allReplicated = candidates.every((c) => c.replicated);
  if (!allReplicated) {
    reasons.push(
      "At least one candidate is a single specimen — pheno stability is unknown.",
    );
  }

  const allCured = candidates.every((c) => c.cured);
  if (!allCured) {
    reasons.push(
      "At least one candidate is not cured yet — selection is incomplete.",
    );
  }

  const allStrong = candidates.every((c) => c.strength === "strong");
  if (!allStrong && !anyThin) {
    reasons.push("Some phenotype records are only partial.");
  }

  // Hard confounds force "not comparable"; softer gaps are caveats. Missing
  // environment context (envUnknown) can never read as fully comparable.
  const hardConfound = envConfound || timepointMisaligned || anyThin;
  if (hardConfound) return grade("not_comparable", reasons);
  if (!allReplicated || !allCured || !allStrong || envUnknown) {
    return grade("comparable_with_caveats", reasons);
  }
  return grade("comparable", [
    "Same tent, aligned day-of-flower, replicated, phenotype fully recorded, and post-cure done.",
  ]);
}

function grade(
  verdict: ComparabilityVerdict,
  reasons: string[],
): ComparabilityGrade {
  return {
    verdict,
    label: COMPARABILITY_LABELS[verdict],
    tone: COMPARABILITY_TONES[verdict],
    reasons,
  };
}

// ---------------------------------------------------------------------------
// Overclaim guard — the tool's own labels must never read as a pick.
// (User-entered free text is attributed and out of scope for this check.)
// ---------------------------------------------------------------------------

export const SELECTION_OVERCLAIM_TERMS: readonly string[] = [
  "winner",
  "keeper",
  "best pheno",
  "clear winner",
  "the best",
  "guaranteed",
  "sure thing",
  "can't lose",
];

export function containsSelectionOverclaim(raw: string): boolean {
  const t = ` ${(raw ?? "").toLowerCase()} `;
  return SELECTION_OVERCLAIM_TERMS.some((term) => t.includes(term));
}

/** Header for the demoted telemetry section. */
export const PHENO_ENVIRONMENT_CONTEXT_LABEL =
  "Environment context — not a selection signal";
