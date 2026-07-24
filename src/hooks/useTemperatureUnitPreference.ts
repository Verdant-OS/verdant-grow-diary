/**
 * useTemperatureUnitPreference — SSR-safe shared accessor for the user's
 * preferred temperature display unit.
 *
 * Wraps `loadTemperatureUnitPreference` so callers do not import the
 * storage module directly and so display logic stays consistent across
 * routes. Reuses the existing preference storage; never creates a new
 * source of truth. Subscribes to the native `storage` event (other
 * tabs/windows) AND `TEMPERATURE_UNIT_CHANGE_EVENT` (same-document
 * saves — `storage` never fires in the tab that made the change, so
 * without this a long-lived mounted component like Quick Log would
 * keep showing the old unit until a full reload).
 */
import { useEffect, useState } from "react";
import {
  DEFAULT_TEMPERATURE_UNIT,
  loadTemperatureUnitPreference,
  TEMPERATURE_UNIT_CHANGE_EVENT,
  type TemperatureUnitPreference,
} from "@/lib/temperatureUnitPreference";

const STORAGE_KEY = "verdant:temperatureUnit";

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
    const onChange = () => setUnit(readPreference());
    const onStorage = (e: StorageEvent) => {
      if (e.key && e.key !== STORAGE_KEY) return;
      onChange();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(TEMPERATURE_UNIT_CHANGE_EVENT, onChange);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(TEMPERATURE_UNIT_CHANGE_EVENT, onChange);
    };
  }, []);

  return unit;
}
