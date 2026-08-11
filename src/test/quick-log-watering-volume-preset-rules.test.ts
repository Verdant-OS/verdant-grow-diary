/**
 * Pure unit tests for Quick Log watering volume presets.
 */
import { describe, expect, it } from "vitest";
import {
  applyWateringVolumePreset,
  isWateringVolumePresetSelected,
  QUICK_LOG_WATERING_VOLUME_PRESET_OPTIONS,
  QUICK_LOG_WATERING_VOLUME_PRESETS_ML,
} from "@/lib/quickLogWateringVolumePresetRules";

describe("QUICK_LOG_WATERING_VOLUME_PRESETS_ML", () => {
  it("is a closed ascending set of positive volumes", () => {
    expect(QUICK_LOG_WATERING_VOLUME_PRESETS_ML.length).toBeGreaterThanOrEqual(4);
    for (const ml of QUICK_LOG_WATERING_VOLUME_PRESETS_ML) {
      expect(ml).toBeGreaterThan(0);
      expect(Number.isInteger(ml)).toBe(true);
    }
    const sorted = [...QUICK_LOG_WATERING_VOLUME_PRESETS_ML].sort((a, b) => a - b);
    expect([...QUICK_LOG_WATERING_VOLUME_PRESETS_ML]).toEqual(sorted);
  });

  it("exposes matching option labels and values", () => {
    expect(QUICK_LOG_WATERING_VOLUME_PRESET_OPTIONS).toHaveLength(
      QUICK_LOG_WATERING_VOLUME_PRESETS_ML.length,
    );
    for (const option of QUICK_LOG_WATERING_VOLUME_PRESET_OPTIONS) {
      expect(option.value).toBe(String(option.ml));
      expect(option.label).toBe(`${option.ml} ml`);
    }
  });
});

describe("isWateringVolumePresetSelected", () => {
  it("matches the exact preset string, ignoring surrounding whitespace", () => {
    expect(isWateringVolumePresetSelected("1500", 1500)).toBe(true);
    expect(isWateringVolumePresetSelected(" 1500 ", 1500)).toBe(true);
    expect(isWateringVolumePresetSelected("1500.0", 1500)).toBe(false);
    expect(isWateringVolumePresetSelected("1501", 1500)).toBe(false);
    expect(isWateringVolumePresetSelected("", 1500)).toBe(false);
  });
});

describe("applyWateringVolumePreset", () => {
  it("sets the preset volume when not already selected", () => {
    expect(applyWateringVolumePreset("", 1000)).toBe("1000");
    expect(applyWateringVolumePreset("500", 1800)).toBe("1800");
  });

  it("toggles off when the same preset is already selected", () => {
    expect(applyWateringVolumePreset("2000", 2000)).toBe("");
    expect(applyWateringVolumePreset(" 2000 ", 2000)).toBe("");
  });

  it("accepts option objects as well as raw ml numbers", () => {
    const option = QUICK_LOG_WATERING_VOLUME_PRESET_OPTIONS[0];
    expect(applyWateringVolumePreset("", option)).toBe(option.value);
    expect(applyWateringVolumePreset(option.value, option)).toBe("");
  });
});
