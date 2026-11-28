/**
 * quickLogWateringVolumePresetRules — closed set of common watering volumes
 * for one-tap entry in Quick Log Water.
 *
 * Pure. No I/O, no React, no diagnosis, no irrigation recommendation.
 * Presets only fill the grower-entered volume field; the grower can still
 * type any valid ml value. Selecting the already-active preset clears it
 * (same chip-toggle contract as root-zone observation chips).
 *
 * The chips follow the Water entry unit (owner decision 2026-11-19): ml shows
 * "500 ml", L shows the same amounts as "0.5 L", and gal shows none because
 * gallon amounts do not come out round. Every chip saves the same canonical ml.
 */

import { mlToWaterEntryDisplay, type WaterEntryUnit } from "./quickLogWaterVolumeUnitRules";

export const QUICK_LOG_WATERING_VOLUME_PRESETS_ML = [
  500, 1000, 1500, 1800, 2000, 2500,
] as const;

export type QuickLogWateringVolumePresetMl =
  (typeof QUICK_LOG_WATERING_VOLUME_PRESETS_ML)[number];

export interface QuickLogWateringVolumePresetOption {
  readonly ml: QuickLogWateringVolumePresetMl;
  /** Chip label, e.g. "500 ml" or "0.5 L". */
  readonly label: string;
  /** Canonical ml written into the volume field, e.g. "500". */
  readonly value: string;
}

export const QUICK_LOG_WATERING_VOLUME_PRESET_OPTIONS: readonly QuickLogWateringVolumePresetOption[] =
  Object.freeze(
    QUICK_LOG_WATERING_VOLUME_PRESETS_ML.map((ml) =>
      Object.freeze({
        ml,
        label: `${ml} ml`,
        value: String(ml),
      }),
    ),
  );

const QUICK_LOG_WATERING_VOLUME_PRESET_OPTIONS_L: readonly QuickLogWateringVolumePresetOption[] =
  Object.freeze(
    QUICK_LOG_WATERING_VOLUME_PRESETS_ML.map((ml) =>
      Object.freeze({
        ml,
        label: `${mlToWaterEntryDisplay(ml, "L")} L`,
        value: String(ml),
      }),
    ),
  );

/**
 * The shortcut chips for the unit the Water form is in. ml: today's chips.
 * L: the same amounts labelled in liters. gal: none. `value` stays canonical ml.
 */
export function wateringVolumePresetOptionsForUnit(
  unit: WaterEntryUnit,
): readonly QuickLogWateringVolumePresetOption[] {
  if (unit === "ml") return QUICK_LOG_WATERING_VOLUME_PRESET_OPTIONS;
  if (unit === "L") return QUICK_LOG_WATERING_VOLUME_PRESET_OPTIONS_L;
  return [];
}

export const QUICK_LOG_WATERING_VOLUME_PRESET_HELP =
  "Optional shortcuts. You can still type any volume.";

function trim(raw: string | null | undefined): string {
  return (raw ?? "").trim();
}

/**
 * True when the current field value is exactly this preset (string match on
 * the canonical preset value, e.g. "1500"). Leading/trailing whitespace is
 * ignored; "1500.0" is not treated as the 1500 preset.
 */
export function isWateringVolumePresetSelected(
  currentVolumeMl: string | null | undefined,
  preset: QuickLogWateringVolumePresetMl | QuickLogWateringVolumePresetOption,
): boolean {
  const value = typeof preset === "number" ? String(preset) : preset.value;
  return trim(currentVolumeMl) === value;
}

/**
 * Apply a preset chip click. Toggle-off when already selected so growers can
 * clear a mistaken tap without reaching for the keyboard.
 */
export function applyWateringVolumePreset(
  currentVolumeMl: string | null | undefined,
  preset: QuickLogWateringVolumePresetMl | QuickLogWateringVolumePresetOption,
): string {
  const value = typeof preset === "number" ? String(preset) : preset.value;
  if (trim(currentVolumeMl) === value) return "";
  return value;
}
