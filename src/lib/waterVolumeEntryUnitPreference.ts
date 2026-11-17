/**
 * Remembered Quick Log Water entry unit (spec docs/specs/quick-log-water-volume-units.md R13, D1 b).
 *
 * A display preference on this device only: an opaque enum value, no ids,
 * no amounts. It never selects a grow, tent or plant and never changes a
 * saved row. Missing, unknown or unreadable values, or unavailable storage,
 * fall back to the default unit, L (docs/specs/quick-log-water-unit-liters-default.md).
 * Only the unit control writes it.
 */
import {
  DEFAULT_WATER_ENTRY_UNIT,
  isWaterEntryUnit,
  type WaterEntryUnit,
} from "./quickLogWaterVolumeUnitRules";

export const WATER_VOLUME_ENTRY_UNIT_STORAGE_KEY = "verdant:waterVolumeEntryUnit" as const;

function safeStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadWaterVolumeEntryUnit(): WaterEntryUnit {
  const storage = safeStorage();
  if (!storage) return DEFAULT_WATER_ENTRY_UNIT;
  try {
    const value = storage.getItem(WATER_VOLUME_ENTRY_UNIT_STORAGE_KEY);
    return isWaterEntryUnit(value) ? value : DEFAULT_WATER_ENTRY_UNIT;
  } catch {
    return DEFAULT_WATER_ENTRY_UNIT;
  }
}

/** True only when the stored value reads back as `unit`. */
export function saveWaterVolumeEntryUnit(unit: WaterEntryUnit): boolean {
  const storage = safeStorage();
  if (!storage || !isWaterEntryUnit(unit)) return false;
  try {
    storage.setItem(WATER_VOLUME_ENTRY_UNIT_STORAGE_KEY, unit);
    return storage.getItem(WATER_VOLUME_ENTRY_UNIT_STORAGE_KEY) === unit;
  } catch {
    return false;
  }
}
