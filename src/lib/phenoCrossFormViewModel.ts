/**
 * phenoCrossFormViewModel — pure presenter for the keepers cross form + the
 * crosses list (Part B / B4).
 *
 * Keeps ALL reproduction logic out of JSX: given the current form selection and
 * the set of reversed keepers, it derives what cross would be recorded (via the
 * merged classifyCross rules), whether submit is allowed, and the reason it is
 * not. The UI never lets the grower force a cross_type — it shows the DERIVED
 * classification and the service (recordCross) is the source of truth on save.
 *
 * Pure: no React, no Supabase, no I/O.
 */
import {
  classifyCross,
  isKeeperReversed,
  isCrossType,
  isFeminizedChannel,
  crossTypeDisplay,
  REVERSAL_METHODS,
  reversalMethodLabel,
  type CrossClassification,
} from "@/lib/genetics/breedingReproductionRules";

/** Sentinel donor selection meaning "self this keeper (S1)". */
export const SELF_DONOR_VALUE = "__self__";

export interface CrossFormInput {
  femaleKeeperId: string;
  /** Donor dropdown value: a keeper id, "" (none chosen), or SELF_DONOR_VALUE. */
  donorSelection: string;
  reversedKeeperIds: ReadonlyArray<string>;
  /**
   * The keeper ids that belong to the CURRENT hunt. When provided, a female or
   * donor id not in this set is treated as unselected — this prevents stale
   * parent ids (e.g. carried over when navigating between hunts) from enabling
   * a save with keepers that aren't part of the hunt being viewed.
   */
  validKeeperIds?: ReadonlyArray<string>;
}

export interface CrossFormViewModel {
  /** True when the selection is a self-cross (S1). */
  isSelf: boolean;
  /** Classification of the pending cross, or null when the selection is incomplete. */
  preview: CrossClassification | null;
  /** Short badge for the pending cross (e.g. "F1" / "Feminized" / "S1 / Selfed"), or null. */
  previewBadge: string | null;
  canSubmit: boolean;
  /** Why submit is blocked, null when canSubmit. */
  disabledReason: string | null;
  /** The pollen keeper id to hand to recordCross: null for self, else the donor id. */
  pollenKeeperId: string | null;
}

function toReversalRecords(ids: ReadonlyArray<string>) {
  return ids.map((keeperId) => ({ keeperId }));
}

/**
 * Derive the cross-form state from the current selection + reversal set.
 * Selfing is signalled by the SELF sentinel or by choosing the mother as donor.
 */
export function buildCrossFormViewModel(input: CrossFormInput): CrossFormViewModel {
  const validSet = input.validKeeperIds ? new Set(input.validKeeperIds) : null;
  // A stale female id (not in the current hunt) is treated as unselected.
  const femaleRaw = (input.femaleKeeperId ?? "").trim();
  const female = validSet && femaleRaw !== "" && !validSet.has(femaleRaw) ? "" : femaleRaw;
  const selRaw = (input.donorSelection ?? "").trim();
  // A stale non-self donor id (not in the current hunt) is likewise dropped.
  const sel =
    selRaw !== SELF_DONOR_VALUE && validSet && selRaw !== "" && !validSet.has(selRaw) ? "" : selRaw;
  const isSelf = sel === SELF_DONOR_VALUE || (sel !== "" && sel === female);

  if (!female) {
    return {
      isSelf,
      preview: null,
      previewBadge: null,
      canSubmit: false,
      disabledReason: "Select the seed (female) keeper.",
      pollenKeeperId: null,
    };
  }
  if (!isSelf && sel === "") {
    return {
      isSelf,
      preview: null,
      previewBadge: null,
      canSubmit: false,
      disabledReason: "Select a donor keeper.",
      pollenKeeperId: null,
    };
  }

  const pollenKeeperId = isSelf ? null : sel;
  const records = toReversalRecords(input.reversedKeeperIds);
  const preview = classifyCross({
    femaleKeeperId: female,
    pollenKeeperId,
    femaleReversed: isKeeperReversed(records, female),
    pollenReversed: pollenKeeperId ? isKeeperReversed(records, pollenKeeperId) : false,
  });

  // `=== false` narrowing (repo compiles with strictNullChecks off).
  if (preview.ok === false) {
    return {
      isSelf,
      preview,
      previewBadge: null,
      canSubmit: false,
      disabledReason: preview.reason,
      pollenKeeperId,
    };
  }
  return {
    isSelf,
    preview,
    previewBadge: crossLineageBadge(preview.crossType),
    canSubmit: true,
    disabledReason: null,
    pollenKeeperId,
  };
}

/**
 * Short lineage badge for a recorded cross type — GENERATION- and
 * FEMINIZATION-aware. An F5 must never render identically to an F2, and a
 * feminized backcross (reversal-channel pollen) must never render identically
 * to a regular mixed-sex one — a breeder plants these expecting very different
 * sex ratios.
 *
 *  - Legacy 3 types keep their original exact badges (never carry a
 *    generation or a feminizing channel — validateBreedingCross forbids it).
 *  - Everything else routes through crossTypeDisplay(crossType, generation)
 *    for the real "F5"/"BX3"/"S4" (feminized_bx already renders "Fem BX#").
 *  - filial/backcross are the only ways that are REGULAR by default but CAN
 *    be feminized via a reversal-channel donor; when so, prefix "Fem " so it
 *    is never confused with a regular-pollen cross of the same generation.
 */
export function crossLineageBadge(
  crossType: string,
  generation?: number | null,
  channel?: string | null,
): string {
  switch (crossType) {
    case "selfing_s1":
      return "S1 / Selfed";
    case "feminized_cross":
      return "Feminized";
    case "standard_f1":
      return "F1";
    default: {
      if (!isCrossType(crossType)) return "Cross";
      const base = crossTypeDisplay(crossType, generation);
      const canBeFeminizedByChannel = crossType === "filial" || crossType === "backcross";
      if (canBeFeminizedByChannel && isFeminizedChannel(channel)) return `Fem ${base}`;
      return base;
    }
  }
}

/**
 * Donor-side display for a crosses-list row. A selfing renders "Self" and an
 * open pollination with no named donor renders "Open pollination" — never a
 * blank cell or a mislabeled "Self".
 */
export function crossDonorLabel(
  cross: { maleKeeperId: string | null; crossType: string },
  maleName: string | null,
): string {
  if (cross.crossType === "selfing_s1" || cross.crossType === "selfing_sn") return "Self";
  if (cross.crossType === "open_pollination" && cross.maleKeeperId == null)
    return "Open pollination";
  if (cross.maleKeeperId == null) return "unknown keeper";
  return maleName && maleName.trim() !== "" ? maleName : "unknown keeper";
}

/** Method options for the "record reversal" control (value + human label). */
export const REVERSAL_METHOD_OPTIONS: ReadonlyArray<{ value: string; label: string }> =
  REVERSAL_METHODS.map((value) => ({ value, label: reversalMethodLabel(value) }));
