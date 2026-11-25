/**
 * Copy for Quick Log Water volume units.
 * Spec: docs/specs/quick-log-water-volume-units.md (R6, R12, R14).
 */
import type { WaterEntryUnit } from "@/lib/quickLogWaterVolumeUnitRules";

export const WATER_ENTRY_UNIT_GROUP_LABEL = "Volume unit" as const;

export const WATER_ENTRY_UNIT_LABELS: Readonly<Record<WaterEntryUnit, string>> = Object.freeze({
  ml: "ml",
  L: "L",
  gal: "gal",
});

export function waterVolumeFieldLabel(unit: WaterEntryUnit): string {
  return `Volume (${WATER_ENTRY_UNIT_LABELS[unit]})`;
}

/**
 * Example amount shown in the empty Volume field, in the entry unit, so the
 * hint never reads as an amount in another unit ("e.g. 500" in liters is
 * 500 L). Display only; nothing is converted or saved from it.
 */
const WATER_VOLUME_PLACEHOLDER_AMOUNTS: Readonly<Record<WaterEntryUnit, string>> = Object.freeze({
  ml: "500",
  L: "1.5",
  gal: "0.5",
});

export function waterVolumePlaceholder(unit: WaterEntryUnit): string {
  return `e.g. ${WATER_VOLUME_PLACEHOLDER_AMOUNTS[unit]}`;
}

export function runoffFieldLabel(unit: WaterEntryUnit): string {
  return `Runoff (${WATER_ENTRY_UNIT_LABELS[unit]})`;
}

/** "Saves as 3,785 ml." */
export function savesAsMlCopy(amount: string): string {
  return `Saves as ${amount} ml.`;
}

/** "Max 13.2 gal (50,000 ml) per watering. Check the number and save again." */
export function waterVolumeTooLargeCopy(maxInUnit: string, unit: WaterEntryUnit): string {
  return `Max ${maxInUnit} ${WATER_ENTRY_UNIT_LABELS[unit]} (50,000 ml) per watering. Check the number and save again.`;
}

/** Large-water warning naming the typed amount and the saved ml (R7). */
export function largeWaterUnitMessage(
  typed: string,
  unit: WaterEntryUnit,
  savedMl: string,
): string {
  return `${typed.trim()} ${WATER_ENTRY_UNIT_LABELS[unit]} (${savedMl} ml) is above 10,000 ml. Edit amount or Confirm amount.`;
}
