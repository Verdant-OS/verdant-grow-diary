/**
 * vpdStageNormalizationRules — pure mapping between Verdant app/grow stage
 * vocabulary and the canonical VPD target stage vocabulary stored in the
 * `vpd_targets` table.
 *
 * Contract:
 *   - Pure. No I/O, no React, no Supabase, no fetch.
 *   - No automation, no device control.
 *   - No alert writes, no Action Queue writes.
 *   - Unknown / missing stage MUST stay unknown. Callers must never treat
 *     unknown as "in-target" or "healthy".
 *   - Existing `evaluateVpdAgainstStageTarget` behavior is preserved; this
 *     module only adds a stable bridge to the canonical six-stage vocabulary.
 *
 * Background:
 *   Older Verdant code uses the legacy app stage names:
 *       seedling, veg, preflower, flower, late_flower
 *   The seeded `vpd_targets` table uses the canonical six:
 *       seedling, early_veg, late_veg, early_flower, mid_late_flower, ripening
 *   Both vocabularies remain valid. This helper documents and enforces the
 *   one-way mapping legacy → canonical so future callers do not guess.
 *
 * Strict parsing contract (intentional):
 *   - Stage IDs are strict machine values, not display labels.
 *   - Inputs are accepted **only** as the exact lowercase canonical or
 *     legacy identifiers below. No trimming, no case folding, no dash /
 *     space substitution.
 *   - `""`, `"   "`, `"VEG"`, `"Veg"`, `" veg "`, `null`, `undefined`,
 *     and every non-string input return `{ known: false }`.
 *   - Callers that own user-facing labels must normalize to a strict ID
 *     (see `src/constants/growStages.ts`) before calling this helper.
 *
 * See: docs/vpd-stage-vocabulary.md
 */

export type LegacyVpdStage =
  | "seedling"
  | "veg"
  | "preflower"
  | "flower"
  | "late_flower";

export type CanonicalVpdTargetStage =
  | "seedling"
  | "early_veg"
  | "late_veg"
  | "early_flower"
  | "mid_late_flower"
  | "ripening";

export type VpdStageVocabulary = LegacyVpdStage | CanonicalVpdTargetStage;

export type VpdStageNormalizationResult =
  | { known: true; canonical: CanonicalVpdTargetStage; source: "canonical" | "legacy" }
  | { known: false; canonical: null; source: "unknown" };

/**
 * Legacy → canonical mapping. Documented in docs/vpd-stage-vocabulary.md.
 * THIS TABLE MUST NOT BE DUPLICATED OUTSIDE THIS FILE, its dedicated tests,
 * the vocabulary doc, and the static ownership scanner.
 */
const LEGACY_TO_CANONICAL: Record<LegacyVpdStage, CanonicalVpdTargetStage> = {
  seedling: "seedling",
  veg: "late_veg",
  preflower: "early_flower",
  flower: "mid_late_flower",
  late_flower: "mid_late_flower",
};

const CANONICAL_STAGES: readonly CanonicalVpdTargetStage[] = [
  "seedling",
  "early_veg",
  "late_veg",
  "early_flower",
  "mid_late_flower",
  "ripening",
] as const;

const LEGACY_STAGES: readonly LegacyVpdStage[] = [
  "seedling",
  "veg",
  "preflower",
  "flower",
  "late_flower",
] as const;

export const CANONICAL_VPD_TARGET_STAGES = CANONICAL_STAGES;
export const LEGACY_VPD_STAGES = LEGACY_STAGES;

/**
 * Strict acceptance: only an exact lowercase string that is one of the
 * documented canonical or legacy IDs is accepted. Anything else (wrong
 * case, surrounding whitespace, dashes, non-string, empty, nullish) is
 * unknown by design.
 */
function strictMatch(input: unknown): string | null {
  if (typeof input !== "string") return null;
  if (input.length === 0) return null;
  return input;
}

export function isCanonicalVpdTargetStage(
  input: unknown,
): input is CanonicalVpdTargetStage {
  const s = strictMatch(input);
  return s !== null && (CANONICAL_STAGES as readonly string[]).includes(s);
}

export function isLegacyVpdStage(input: unknown): input is LegacyVpdStage {
  const s = strictMatch(input);
  return s !== null && (LEGACY_STAGES as readonly string[]).includes(s);
}

/**
 * Normalize any incoming stage label to a canonical VPD target stage.
 *
 * - Canonical stages pass through unchanged.
 * - Legacy stages map per the documented table above.
 * - Anything else returns `{ known: false }` — callers MUST treat this as
 *   "stage unknown" and must NOT classify the reading as healthy.
 *
 * Strict: see file header. Trimmed / cased / dashed / non-string inputs
 * all return unknown.
 */
export function normalizeToCanonicalVpdTargetStage(
  input: string | null | undefined,
): VpdStageNormalizationResult {
  const s = strictMatch(input);
  if (s === null) return { known: false, canonical: null, source: "unknown" };
  if ((CANONICAL_STAGES as readonly string[]).includes(s)) {
    return {
      known: true,
      canonical: s as CanonicalVpdTargetStage,
      source: "canonical",
    };
  }
  if ((LEGACY_STAGES as readonly string[]).includes(s)) {
    return {
      known: true,
      canonical: LEGACY_TO_CANONICAL[s as LegacyVpdStage],
      source: "legacy",
    };
  }
  return { known: false, canonical: null, source: "unknown" };
}
