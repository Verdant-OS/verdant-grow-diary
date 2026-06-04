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
 *
 * Notes:
 *   - "veg" is broad. We default to `late_veg` because legacy veg bands
 *     (0.8–1.2 kPa) align with the canonical late_veg band (0.9–1.2 kPa).
 *     Callers that distinguish early vs late veg should pass the canonical
 *     name directly.
 *   - "flower" defaults to `mid_late_flower` because its legacy band
 *     (1.0–1.5 kPa) fully contains the canonical mid_late_flower band.
 *   - "late_flower" maps to `mid_late_flower` (exact band match 1.1–1.5).
 *     `ripening` (1.2–1.6) is a stricter end-stage and is not auto-applied
 *     from the legacy "late_flower" label.
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

function tidy(input: string | null | undefined): string | null {
  if (input == null) return null;
  const s = String(input).trim().toLowerCase().replace(/[\s-]+/g, "_");
  return s.length > 0 ? s : null;
}

export function isCanonicalVpdTargetStage(
  input: string | null | undefined,
): input is CanonicalVpdTargetStage {
  const s = tidy(input);
  return s !== null && (CANONICAL_STAGES as readonly string[]).includes(s);
}

export function isLegacyVpdStage(
  input: string | null | undefined,
): input is LegacyVpdStage {
  const s = tidy(input);
  return s !== null && (LEGACY_STAGES as readonly string[]).includes(s);
}

/**
 * Normalize any incoming stage label to a canonical VPD target stage.
 *
 * - Canonical stages pass through unchanged.
 * - Legacy stages map per the documented table above.
 * - Anything else returns `{ known: false }` — callers MUST treat this as
 *   "stage unknown" and must NOT classify the reading as healthy.
 */
export function normalizeToCanonicalVpdTargetStage(
  input: string | null | undefined,
): VpdStageNormalizationResult {
  const s = tidy(input);
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
