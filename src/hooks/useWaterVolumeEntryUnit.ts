/**
 * useWaterVolumeEntryUnit — the grower's remembered Quick Log Water unit,
 * for read surfaces that show a stored ml amount back (Timeline, history).
 *
 * Wraps `loadWaterVolumeEntryUnit` (per device, default L). Display only:
 * stored rows stay canonical ml. Follows the `storage` event (other tabs)
 * and `WATER_VOLUME_ENTRY_UNIT_CHANGE_EVENT` (this tab), like
 * `useTemperatureUnitPreference`.
 */
import { useEffect, useState } from "react";
import type { WaterEntryUnit } from "@/lib/quickLogWaterVolumeUnitRules";
import {
  loadWaterVolumeEntryUnit,
  WATER_VOLUME_ENTRY_UNIT_CHANGE_EVENT,
  WATER_VOLUME_ENTRY_UNIT_STORAGE_KEY,
} from "@/lib/waterVolumeEntryUnitPreference";

export function useWaterVolumeEntryUnit(): WaterEntryUnit {
  const [unit, setUnit] = useState<WaterEntryUnit>(loadWaterVolumeEntryUnit);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onChange = () => setUnit(loadWaterVolumeEntryUnit());
    const onStorage = (e: StorageEvent) => {
      if (e.key && e.key !== WATER_VOLUME_ENTRY_UNIT_STORAGE_KEY) return;
      onChange();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(WATER_VOLUME_ENTRY_UNIT_CHANGE_EVENT, onChange);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(WATER_VOLUME_ENTRY_UNIT_CHANGE_EVENT, onChange);
    };
  }, []);

  return unit;
}
