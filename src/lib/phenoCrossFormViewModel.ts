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
  const female = (input.femaleKeeperId ?? "").trim();
  const sel = (input.donorSelection ?? "").trim();
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

/** Short lineage badge for a recorded cross type. */
export function crossLineageBadge(crossType: string): string {
  switch (crossType) {
    case "selfing_s1":
      return "S1 / Selfed";
    case "feminized_cross":
      return "Feminized";
    case "standard_f1":
      return "F1";
    default:
      return "Cross";
  }
}

/**
 * Donor-side display for a crosses-list row. A selfing row (or any null male)
 * renders "Self", never blank/broken text.
 */
export function crossDonorLabel(
  cross: { maleKeeperId: string | null; crossType: string },
  maleName: string | null,
): string {
  if (cross.crossType === "selfing_s1" || cross.maleKeeperId == null) return "Self";
  return maleName && maleName.trim() !== "" ? maleName : "unknown keeper";
}

/** Method options for the "record reversal" control (value + human label). */
export const REVERSAL_METHOD_OPTIONS: ReadonlyArray<{ value: string; label: string }> =
  REVERSAL_METHODS.map((value) => ({ value, label: reversalMethodLabel(value) }));
