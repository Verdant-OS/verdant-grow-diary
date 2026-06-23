/**
 * useTemperatureUnitPreference — SSR-safe shared accessor for the user's
 * preferred temperature display unit.
 *
 * Wraps `loadTemperatureUnitPreference` so callers do not import the
 * storage module directly and so display logic stays consistent across
 * routes. Reuses the existing preference storage; never creates a new
 * source of truth. Subscribes to `storage` events so changes from
 * other tabs/components propagate.
 */
import { useEffect, useState } from "react";
import {
  DEFAULT_TEMPERATURE_UNIT,
  loadTemperatureUnitPreference,
  TEMPERATURE_UNIT_STORAGE_KEY,
  type TemperatureUnitPreference,
} from "@/lib/temperatureUnitPreference";

function readPreference(): TemperatureUnitPreference {
  if (typeof window === "undefined") return DEFAULT_TEMPERATURE_UNIT;
  try {
    return loadTemperatureUnitPreference();
  } catch {
    return DEFAULT_TEMPERATURE_UNIT;
  }
}

export function useTemperatureUnitPreference(): TemperatureUnitPreference {
  const [unit, setUnit] = useState<TemperatureUnitPreference>(() => readPreference());

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStorage = (e: StorageEvent) => {
      if (e.key && e.key !== TEMPERATURE_UNIT_STORAGE_KEY) return;
      setUnit(readPreference());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return unit;
}
