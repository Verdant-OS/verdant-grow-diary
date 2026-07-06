/**
 * phenoExpressionRules
 *
 * Pure, read-only model for a hunt candidate's PHENOTYPE EXPRESSION as a
 * keeper-hunter evaluates it — the "loud"/exotic breeder axes (nose loudness +
 * aroma character, bud structure/density, resin coverage, stretch, vigor,
 * yield), the post-cure smoke test (the deciding gate), a grower-recorded sex /
 * hermaphrodite observation, and optional COA lab numbers.
 *
 * Hard invariants (same as the rest of the pheno surface):
 *  - No I/O. No fetch. No Supabase. No AI. No inference. No writes. No automation.
 *  - DESCRIPTIVE per candidate — never ranks candidates, never names a "best",
 *    never picks a phenotype. Expression is shown so the grower can compare with
 *    their own eyes and nose.
 *  - HONEST — every value is grower-entered/observed. Out-of-range scores are
 *    flagged, not coerced. Lab numbers are tagged by source and never fabricated
 *    (an absent COA is flagged, never invented).
 *  - Hermaphrodite handling is SUGGEST-ONLY: observing a herm surfaces a
 *    "consider removing" prompt the grower must act on; nothing is auto-culled,
 *    and sex is never inferred.
 *  - Deterministic ordering, null-safe on every field.
 */
import {
  normalizeSexObservation,
  sexObservationLabel,
  type PhenoSexObservation,
} from "@/lib/phenoSexObservationModel";

/** A scored trait axis. `intensity` axes (nose loudness) use a wider scale. */
export interface PhenoTraitAxis {
  readonly key: string;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly kind: "quality" | "intensity";
}

/**
 * Loud/exotic keeper-hunt trait axes. Nose loudness is the primary axis for a
 * James-Loud-style breeder, on a wider 0-10 intensity scale; the rest are 1-5
 * quality scores. This is a provisional default set — the taxonomy stays open
 * for the breeder to critique.
 */
export const LOUD_TRAIT_AXES: readonly PhenoTraitAxis[] = [
  { key: "nose_loudness", label: "Nose loudness", min: 0, max: 10, kind: "intensity" },
  { key: "vigor", label: "Vigor", min: 1, max: 5, kind: "quality" },
  { key: "structure", label: "Bud structure", min: 1, max: 5, kind: "quality" },
  { key: "bud_density", label: "Bud density", min: 1, max: 5, kind: "quality" },
  { key: "trichome_coverage", label: "Trichome / resin coverage", min: 1, max: 5, kind: "quality" },
  { key: "stretch", label: "Stretch", min: 1, max: 5, kind: "quality" },
  { key: "yield_impression", label: "Yield (impression)", min: 1, max: 5, kind: "quality" },
];

const AXIS_BY_KEY: ReadonlyMap<string, PhenoTraitAxis> = new Map(
  LOUD_TRAIT_AXES.map((a) => [a.key, a]),
);

/** Qualitative aroma / terpene descriptor vocabulary (grower-tagged nose). */
export const PHENO_AROMA_DESCRIPTORS = [
  "gas",
  "fuel",
  "diesel",
  "skunk",
  "funk",
  "cheese",
  "earthy",
  "woody",
  "pine",
  "floral",
  "lavender",
  "rose",
  "citrus",
  "lemon",
  "orange",
  "berry",
  "grape",
  "tropical",
  "mango",
  "melon",
  "candy",
  "cake",
  "cream",
  "vanilla",
  "chocolate",
  "coffee",
  "mint",
  "pepper",
  "spice",
  "sour",
  "sweet",
  "herbal",
  "haze",
] as const;
export type PhenoAromaDescriptor = (typeof PHENO_AROMA_DESCRIPTORS)[number];
const AROMA_SET: ReadonlySet<string> = new Set(PHENO_AROMA_DESCRIPTORS);

/** Effect descriptor vocabulary for the smoke test (subjective). */
export const PHENO_EFFECT_DESCRIPTORS = [
  "heady",
  "euphoric",
  "uplifting",
  "creative",
  "focused",
  "functional",
  "relaxing",
  "sedative",
  "couchlock",
  "body",
  "giggly",
  "talkative",
] as const;
const EFFECT_SET: ReadonlySet<string> = new Set(PHENO_EFFECT_DESCRIPTORS);

export interface PhenoTraitValueInput {
  readonly key: string;
  readonly value?: number | null;
  readonly note?: string | null;
}

export interface PhenoSmokeTestInput {
  /** Flavor descriptors (free of the aroma vocabulary, but same tag style). */
  readonly flavorDescriptors?: readonly string[] | null;
  /** 1-5 smoothness of the smoke/vapor. */
  readonly smoothness?: number | null;
  readonly effectDescriptors?: readonly string[] | null;
  /** 1-5 subjective potency impression (NOT a lab number). */
  readonly potencyImpression?: number | null;
  readonly verdict?: string | null;
  readonly testedAt?: string | null;
}

export interface PhenoTerpeneReading {
  readonly name: string;
  readonly pct?: number | null;
}

/** Grower-entered / attached COA numbers. Tagged by source; never fabricated. */
export interface PhenoLabResultInput {
  readonly thcPct?: number | null;
  readonly cbdPct?: number | null;
  readonly totalCannabinoidsPct?: number | null;
  readonly dominantTerpenes?: readonly PhenoTerpeneReading[] | null;
  /** "coa" = from a lab certificate; "estimate" = grower's guess. */
  readonly source?: string | null;
  readonly testedAt?: string | null;
}

export interface PhenoExpressionInput {
  /** Stage/round this expression was observed at (display only). */
  readonly round?: string | null;
  readonly traits?: readonly PhenoTraitValueInput[] | null;
  readonly aromaDescriptors?: readonly string[] | null;
  readonly noseNote?: string | null;
  readonly smokeTest?: PhenoSmokeTestInput | null;
  readonly sex?: unknown;
  /** True when a hermaphrodite / intersex trait was OBSERVED (never inferred). */
  readonly hermObserved?: boolean;
  readonly hermNote?: string | null;
  readonly labResult?: PhenoLabResultInput | null;
}

// ---------------------------------------------------------------------------
// View types
// ---------------------------------------------------------------------------

export interface PhenoTraitValueView {
  readonly key: string;
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly kind: "quality" | "intensity";
  readonly note: string | null;
}

export interface PhenoSmokeTestView {
  readonly flavorDescriptors: readonly string[];
  readonly smoothness: number | null;
  readonly effectDescriptors: readonly string[];
  readonly potencyImpression: number | null;
  readonly verdict: string | null;
  readonly testedAt: string | null;
  readonly hasContent: boolean;
}

export interface PhenoLabResultView {
  readonly thcPct: number | null;
  readonly cbdPct: number | null;
  readonly totalCannabinoidsPct: number | null;
  readonly dominantTerpenes: readonly PhenoTerpeneReading[];
  readonly source: "coa" | "estimate" | "unspecified";
  readonly sourceLabel: string;
  readonly labVerified: boolean;
  readonly testedAt: string | null;
}

export type PhenoExpressionMissingCode =
  | "no_traits_scored"
  | "no_nose"
  | "no_smoke_test"
  | "no_lab_result"
  | "sex_unknown";

export interface PhenoExpressionMissingFlag {
  readonly code: PhenoExpressionMissingCode;
  readonly message: string;
}

const EXPRESSION_MISSING_MESSAGES: Record<PhenoExpressionMissingCode, string> = {
  no_traits_scored: "No trait scores recorded yet",
  no_nose: "No aroma / nose recorded yet",
  no_smoke_test: "No post-cure smoke test yet",
  no_lab_result: "No lab (COA) numbers attached",
  sex_unknown: "Sex not recorded yet",
};

export interface PhenoHermSuggestion {
  readonly observed: boolean;
  /** Suggest-only: the grower decides. Null when no herm was observed. */
  readonly action: "consider_removing" | null;
  readonly note: string | null;
  readonly caveat: string;
}

export const PHENO_HERM_SUGGEST_CAVEAT =
  "A hermaphrodite was observed. Consider removing this plant to protect the run — Verdant never removes a plant for you; this is your call.";

export interface PhenoExpressionView {
  readonly candidateId: string;
  readonly round: string | null;
  readonly traits: readonly PhenoTraitValueView[];
  readonly invalidTraitKeys: readonly string[];
  readonly unknownTraitKeys: readonly string[];
  readonly aromaDescriptors: readonly string[];
  readonly unknownAromaDescriptors: readonly string[];
  readonly noseNote: string | null;
  readonly smokeTest: PhenoSmokeTestView | null;
  readonly labResult: PhenoLabResultView | null;
  readonly sex: PhenoSexObservation;
  readonly sexLabel: string;
  readonly herm: PhenoHermSuggestion;
  readonly missing: readonly PhenoExpressionMissingFlag[];
  readonly hasAnyExpression: boolean;
}

function cleanString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function missing(code: PhenoExpressionMissingCode): PhenoExpressionMissingFlag {
  return { code, message: EXPRESSION_MISSING_MESSAGES[code] };
}

/** Normalize + dedupe a tag list against a known vocabulary. */
function partitionTags(
  input: readonly string[] | null | undefined,
  known: ReadonlySet<string>,
): { known: string[]; unknown: string[] } {
  const seen = new Set<string>();
  const knownOut: string[] = [];
  const unknownOut: string[] = [];
  for (const raw of input ?? []) {
    const t = cleanString(raw)?.toLowerCase();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    (known.has(t) ? knownOut : unknownOut).push(t);
  }
  return { known: knownOut, unknown: unknownOut };
}

function buildSmokeTestView(
  input: PhenoSmokeTestInput | null | undefined,
): PhenoSmokeTestView | null {
  if (!input) return null;
  const flavor = partitionTags(input.flavorDescriptors, AROMA_SET);
  const effect = partitionTags(input.effectDescriptors, EFFECT_SET);
  const smoothness = finiteOrNull(input.smoothness);
  const potency = finiteOrNull(input.potencyImpression);
  const verdict = cleanString(input.verdict);
  // Keep unknown flavor/effect tags too — they are still the grower's words.
  const flavorAll = [...flavor.known, ...flavor.unknown];
  const effectAll = [...effect.known, ...effect.unknown];
  const hasContent =
    flavorAll.length > 0 ||
    effectAll.length > 0 ||
    smoothness !== null ||
    potency !== null ||
    verdict !== null;
  return {
    flavorDescriptors: flavorAll,
    smoothness: smoothness !== null && smoothness >= 1 && smoothness <= 5 ? smoothness : null,
    effectDescriptors: effectAll,
    potencyImpression: potency !== null && potency >= 1 && potency <= 5 ? potency : null,
    verdict,
    testedAt: cleanString(input.testedAt),
    hasContent,
  };
}

function normalizeLabSource(raw: unknown): "coa" | "estimate" | "unspecified" {
  const v = cleanString(raw)?.toLowerCase();
  if (v === "coa" || v === "lab") return "coa";
  if (v === "estimate" || v === "guess") return "estimate";
  return "unspecified";
}

function buildLabResultView(
  input: PhenoLabResultInput | null | undefined,
): PhenoLabResultView | null {
  if (!input) return null;
  const terps: PhenoTerpeneReading[] = [];
  for (const t of input.dominantTerpenes ?? []) {
    const name = cleanString(t?.name);
    if (!name) continue;
    terps.push({ name, pct: finiteOrNull(t?.pct) });
  }
  const source = normalizeLabSource(input.source);
  const thc = finiteOrNull(input.thcPct);
  const cbd = finiteOrNull(input.cbdPct);
  const total = finiteOrNull(input.totalCannabinoidsPct);
  const hasAnything = thc !== null || cbd !== null || total !== null || terps.length > 0;
  if (!hasAnything) return null;
  return {
    thcPct: thc,
    cbdPct: cbd,
    totalCannabinoidsPct: total,
    dominantTerpenes: terps,
    source,
    sourceLabel:
      source === "coa" ? "COA (lab)" : source === "estimate" ? "Estimate" : "Unspecified source",
    labVerified: source === "coa",
    testedAt: cleanString(input.testedAt),
  };
}

/** Build the expression view for one candidate. Returns null when no input. */
export function buildPhenoExpressionView(
  candidateId: string,
  input: PhenoExpressionInput | null | undefined,
): PhenoExpressionView | null {
  if (!input) return null;

  const traits: PhenoTraitValueView[] = [];
  const invalidTraitKeys: string[] = [];
  const unknownTraitKeys: string[] = [];
  const seenTraitKeys = new Set<string>();
  for (const t of input.traits ?? []) {
    const key = cleanString(t?.key);
    if (!key || seenTraitKeys.has(key)) continue;
    seenTraitKeys.add(key);
    const axis = AXIS_BY_KEY.get(key);
    if (!axis) {
      unknownTraitKeys.push(key);
      continue;
    }
    const value = finiteOrNull(t.value);
    if (value === null || value < axis.min || value > axis.max) {
      invalidTraitKeys.push(key);
      continue;
    }
    traits.push({
      key,
      label: axis.label,
      value,
      min: axis.min,
      max: axis.max,
      kind: axis.kind,
      note: cleanString(t.note),
    });
  }
  // Present traits in the canonical axis order for stable side-by-side reading.
  traits.sort(
    (a, b) =>
      LOUD_TRAIT_AXES.findIndex((x) => x.key === a.key) -
      LOUD_TRAIT_AXES.findIndex((x) => x.key === b.key),
  );

  const aroma = partitionTags(input.aromaDescriptors, AROMA_SET);
  const aromaAll = [...aroma.known, ...aroma.unknown];
  const smokeTest = buildSmokeTestView(input.smokeTest);
  const labResult = buildLabResultView(input.labResult);
  const sex = normalizeSexObservation(input.sex);
  const hermObserved = input.hermObserved === true;

  const herm: PhenoHermSuggestion = {
    observed: hermObserved,
    action: hermObserved ? "consider_removing" : null,
    note: cleanString(input.hermNote),
    caveat: hermObserved ? PHENO_HERM_SUGGEST_CAVEAT : "",
  };

  const missingFlags: PhenoExpressionMissingFlag[] = [];
  if (traits.length === 0) missingFlags.push(missing("no_traits_scored"));
  if (aromaAll.length === 0 && !cleanString(input.noseNote)) missingFlags.push(missing("no_nose"));
  if (!smokeTest || !smokeTest.hasContent) missingFlags.push(missing("no_smoke_test"));
  if (!labResult) missingFlags.push(missing("no_lab_result"));
  if (sex === "unknown") missingFlags.push(missing("sex_unknown"));

  const hasAnyExpression =
    traits.length > 0 ||
    aromaAll.length > 0 ||
    cleanString(input.noseNote) !== null ||
    (smokeTest?.hasContent ?? false) ||
    labResult !== null ||
    sex !== "unknown" ||
    hermObserved;

  return {
    candidateId,
    round: cleanString(input.round),
    traits,
    invalidTraitKeys,
    unknownTraitKeys,
    aromaDescriptors: aromaAll,
    unknownAromaDescriptors: aroma.unknown,
    noseNote: cleanString(input.noseNote),
    smokeTest,
    labResult,
    sex,
    sexLabel: sexObservationLabel(sex),
    herm,
    missing: missingFlags,
    hasAnyExpression,
  };
}

// ---------------------------------------------------------------------------
// Cohort comparability (apples-to-apples integrity check)
// ---------------------------------------------------------------------------

export interface PhenoCohortMember {
  readonly candidateId: string;
  readonly growLabel?: string | null;
  readonly tentLabel?: string | null;
}

export interface PhenoComparabilityView {
  /** True when every member shares the same grow context (or context is unknown). */
  readonly sameGrow: boolean;
  readonly sameTent: boolean;
  readonly distinctGrows: readonly string[];
  readonly distinctTents: readonly string[];
  /** Non-empty when the comparison is NOT apples-to-apples. Honest flag only. */
  readonly warning: string | null;
}

/**
 * Assess whether a cohort was grown under the same conditions. If candidates
 * span different grows/tents the comparison is not apples-to-apples and the
 * grower should be told — this NEVER blocks or picks, it only warns.
 */
export function assessCohortComparability(
  members: readonly PhenoCohortMember[] | null | undefined,
): PhenoComparabilityView {
  const list = Array.isArray(members) ? members : [];
  const grows = new Set<string>();
  const tents = new Set<string>();
  for (const m of list) {
    const g = cleanString(m?.growLabel);
    const t = cleanString(m?.tentLabel);
    if (g) grows.add(g);
    if (t) tents.add(t);
  }
  const distinctGrows = [...grows].sort();
  const distinctTents = [...tents].sort();
  const sameGrow = distinctGrows.length <= 1;
  const sameTent = distinctTents.length <= 1;

  let warning: string | null = null;
  if (!sameGrow) {
    warning = `Not apples-to-apples: these candidates span ${distinctGrows.length} different grows (${distinctGrows.join(", ")}). Environment differences can confound the comparison.`;
  } else if (!sameTent) {
    warning = `Heads up: these candidates span ${distinctTents.length} different tents (${distinctTents.join(", ")}). Conditions may differ.`;
  }
  return { sameGrow, sameTent, distinctGrows, distinctTents, warning };
}
