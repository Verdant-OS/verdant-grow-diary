/**
 * quickLogManualReadingChipsViewModel — the "Manual readings" chips shown
 * under a Quick Log history row.
 *
 * EC chips name the unit the note recorded. QA 2026-09-24: a reading entered
 * and stored as "Feed/Input EC (mS/cm)" was shown as "Input EC/PPM", turning
 * a declared unit into an ambiguous one. Rows written before the unit was
 * recorded ("Input EC/PPM") say so rather than implying EC or PPM.
 *
 * Pure presentation shaping. No React, no Supabase, no clock.
 */
import {
  isHardwareReadingValueValid,
  type QuickLogHardwareReadings,
} from "@/lib/quickLogHardwareReadingsRules";
import type { ManualHandheldReadings } from "@/lib/quickLogHistoryRules";

export interface ManualReadingChip {
  readonly label: string;
  readonly value: string;
  /** Stored value that cannot be a real reading; shown flagged, never as plausible. */
  readonly invalid: boolean;
}

/** Suffix for an EC reading whose note never recorded a unit. */
export const MANUAL_EC_UNIT_NOT_RECORDED = "unit not recorded";

/** The unit the Quick Log writer records, and the one the 0–10 bounds are in. */
const RANGE_CHECKED_EC_UNIT = "mS/cm";

const NON_NEGATIVE_NUMBER_RE = /^\d+(?:\.\d+)?$/;

export function manualEcChipLabel(side: "Input" | "Runoff", unit: string | undefined): string {
  return unit ? `${side} EC (${unit})` : `${side} EC/PPM (${MANUAL_EC_UNIT_NOT_RECORDED})`;
}

/**
 * The 0–10 mS/cm bounds only mean something for a value recorded in mS/cm.
 * 1200 is impossible in mS/cm but an ordinary PPM reading, so a value in any
 * other or unrecorded unit is only checked for being a plain non-negative
 * number.
 */
function isEcValueInvalid(
  key: "inputEc" | "runoffEc",
  value: string,
  unit: string | undefined,
): boolean {
  if (unit === RANGE_CHECKED_EC_UNIT) return !isHardwareReadingValueValid(key, value);
  return !NON_NEGATIVE_NUMBER_RE.test(value.trim());
}

export function buildManualReadingChips(
  m: ManualHandheldReadings | null | undefined,
): ManualReadingChip[] {
  if (!m) return [];
  const items: ManualReadingChip[] = [];
  // Entries saved before handheld validation existed can hold impossible
  // values (pH 15, runoff pH -3); flag them instead of presenting them as
  // plausible readings (QA 2026-09-24, BUG-007).
  const push = (key: keyof QuickLogHardwareReadings, label: string, value: string | undefined) => {
    if (value) items.push({ label, value, invalid: !isHardwareReadingValueValid(key, value) });
  };
  const pushEc = (key: "inputEc" | "runoffEc", side: "Input" | "Runoff") => {
    const value = m[key];
    const unit = key === "inputEc" ? m.inputEcUnit : m.runoffEcUnit;
    if (value) {
      items.push({
        label: manualEcChipLabel(side, unit),
        value,
        invalid: isEcValueInvalid(key, value, unit),
      });
    }
  };
  push("inputPh", "Input pH", m.inputPh);
  pushEc("inputEc", "Input");
  push("runoffPh", "Runoff pH", m.runoffPh);
  pushEc("runoffEc", "Runoff");
  push("ppfdCanopy", "PPFD canopy", m.ppfdCanopy);
  push("lightDistance", "Light distance", m.lightDistance);
  for (const o of m.other ?? []) items.push({ label: o.label, value: o.value, invalid: false });
  return items;
}
