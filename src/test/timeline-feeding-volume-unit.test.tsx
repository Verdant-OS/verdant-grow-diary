import { afterEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useWaterVolumeEntryUnit } from "@/hooks/useWaterVolumeEntryUnit";
import { presentTimelineDiaryEntryDetails } from "@/lib/timelineDiaryEntryDetailPresentationRules";
import {
  saveWaterVolumeEntryUnit,
  WATER_VOLUME_ENTRY_UNIT_STORAGE_KEY,
} from "@/lib/waterVolumeEntryUnitPreference";
import {
  removeLocalStorageItemForTest,
  setLocalStorageItemForTest,
} from "@/test/helpers/localStorageTestHelper";

afterEach(() => {
  removeLocalStorageItemForTest(WATER_VOLUME_ENTRY_UNIT_STORAGE_KEY);
});

const probe = {
  feeding: { ec_in: 1.2 },
  watering_amount_ml: 750,
  runoff_ml: 250,
};

describe("feeding volumes stay millilitres", () => {
  it("keeps a typeless feeding entry in ml when the water unit is L", () => {
    const { detailLines } = presentTimelineDiaryEntryDetails(probe, "celsius", {
      waterUnit: "L",
      entryType: "feeding",
    });
    expect(detailLines).toEqual(
      expect.arrayContaining([
        { key: "feeding.volume_ml", label: "Feed Volume", value: "750 ml" },
        { key: "feeding.runoff_ml", label: "Runoff", value: "250 ml" },
      ]),
    );
    expect(detailLines.map((line) => line.label)).not.toContain("Water Volume");
  });

  it("converts a typed watering entry into the water unit", () => {
    const { detailLines } = presentTimelineDiaryEntryDetails(
      { event_type: "watering", watering_amount_ml: 750, runoff_ml: 250 },
      "celsius",
      { waterUnit: "L", entryType: "watering" },
    );
    expect(detailLines).toEqual(
      expect.arrayContaining([
        { key: "watering.volume_ml", label: "Water Volume", value: "0.75 L" },
        { key: "watering.runoff_ml", label: "Runoff", value: "0.25 L" },
      ]),
    );
  });

  it("keeps a typed feeding entry in ml even when the water unit is L", () => {
    const { detailLines } = presentTimelineDiaryEntryDetails(
      { event_type: "feeding", watering_amount_ml: 750, runoff_ml: 250 },
      "celsius",
      { waterUnit: "L", entryType: "feeding" },
    );
    expect(detailLines).toEqual(
      expect.arrayContaining([
        { key: "feeding.volume_ml", label: "Feed Volume", value: "750 ml" },
        { key: "feeding.runoff_ml", label: "Runoff", value: "250 ml" },
      ]),
    );
  });

  it("treats a feeding envelope with no passed type as feeding", () => {
    const { detailLines } = presentTimelineDiaryEntryDetails(probe, "celsius", {
      waterUnit: "L",
    });
    expect(detailLines).toEqual(
      expect.arrayContaining([
        { key: "feeding.volume_ml", label: "Feed Volume", value: "750 ml" },
        { key: "feeding.runoff_ml", label: "Runoff", value: "250 ml" },
      ]),
    );
  });
});

describe("useWaterVolumeEntryUnit storage key", () => {
  it("reloads when the water key is removed", () => {
    setLocalStorageItemForTest(WATER_VOLUME_ENTRY_UNIT_STORAGE_KEY, "gal");
    const { result } = renderHook(() => useWaterVolumeEntryUnit());
    expect(result.current).toBe("gal");
    act(() => {
      removeLocalStorageItemForTest(WATER_VOLUME_ENTRY_UNIT_STORAGE_KEY);
      window.dispatchEvent(
        new StorageEvent("storage", { key: WATER_VOLUME_ENTRY_UNIT_STORAGE_KEY }),
      );
    });
    expect(result.current).toBe("L");
  });

  it("reloads when the storage key is null", () => {
    const { result } = renderHook(() => useWaterVolumeEntryUnit());
    act(() => {
      saveWaterVolumeEntryUnit("gal");
    });
    expect(result.current).toBe("gal");
    act(() => {
      setLocalStorageItemForTest(WATER_VOLUME_ENTRY_UNIT_STORAGE_KEY, "ml");
      window.dispatchEvent(new StorageEvent("storage", { key: null }));
    });
    expect(result.current).toBe("ml");
  });

  it("ignores an unrelated storage key", () => {
    const { result } = renderHook(() => useWaterVolumeEntryUnit());
    act(() => {
      saveWaterVolumeEntryUnit("gal");
    });
    expect(result.current).toBe("gal");
    act(() => {
      setLocalStorageItemForTest(WATER_VOLUME_ENTRY_UNIT_STORAGE_KEY, "ml");
      window.dispatchEvent(new StorageEvent("storage", { key: "verdant:somethingElse" }));
    });
    expect(result.current).toBe("gal");
  });
});
