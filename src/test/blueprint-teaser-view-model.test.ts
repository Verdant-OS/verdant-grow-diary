/**
 * blueprintTeaserViewModel — locked-state teaser rows preview the REAL
 * per-stage SOP bands (via the same resolveBlueprintBand the unlocked overlay
 * uses), never a divergent list. Verifies stage normalization, day/night temp,
 * omission of untargeted metrics, and the band-table override seam.
 */
import { describe, it, expect } from "vitest";
import { buildBlueprintTeaserViewModel } from "@/lib/blueprintTeaserViewModel";
import { SOP_BLUEPRINT_TARGETS } from "@/constants/blueprintTargets";
import type { BlueprintMetricKey } from "@/lib/blueprintMetricRules";

function band(vm: ReturnType<typeof buildBlueprintTeaserViewModel>, key: BlueprintMetricKey) {
  return vm.rows.find((r) => r.metricKey === key)?.band ?? null;
}
function keys(vm: ReturnType<typeof buildBlueprintTeaserViewModel>) {
  return vm.rows.map((r) => r.metricKey);
}

describe("buildBlueprintTeaserViewModel", () => {
  it("previews all seven veg targets in overlay order, day temp band when lights on", () => {
    const vm = buildBlueprintTeaserViewModel({ stage: "veg", isDay: true });
    expect(vm.stageKnown).toBe(true);
    expect(vm.stageLabel).toBe("Veg");
    expect(vm.targetCount).toBe(7);
    expect(keys(vm)).toEqual(["vpdKpa", "tempC", "rh", "ppfd", "dli", "ec", "ph"]);
    expect(band(vm, "vpdKpa")).toEqual({ min: 0.8, max: 1.2 });
    expect(band(vm, "tempC")).toEqual({ min: 24, max: 27 }); // veg day band
    expect(band(vm, "rh")).toEqual({ min: 60, max: 70 });
    expect(band(vm, "ec")).toEqual({ min: 1.0, max: 1.8 });
    expect(band(vm, "ph")).toEqual({ min: 5.8, max: 5.9 });
    expect(band(vm, "ppfd")).toEqual({ min: 400, max: 700 });
    expect(band(vm, "dli")).toEqual({ min: 25, max: 40 });
  });

  it("uses the night temp band when lights are off", () => {
    const vm = buildBlueprintTeaserViewModel({ stage: "veg", isDay: false });
    expect(band(vm, "tempC")).toEqual({ min: 19, max: 22 });
  });

  it("merges day/night temp to the widest range when the light state is unknown", () => {
    const vm = buildBlueprintTeaserViewModel({ stage: "veg", isDay: null });
    expect(band(vm, "tempC")).toEqual({ min: 19, max: 27 });
  });

  it("previews only temperature + humidity for the dry & cure (harvest) stage", () => {
    const vm = buildBlueprintTeaserViewModel({ stage: "harvest" });
    expect(vm.stageKnown).toBe(true);
    expect(vm.stageLabel).toBe("Dry & cure");
    expect(keys(vm)).toEqual(["tempC", "rh"]);
    expect(band(vm, "tempC")).toEqual({ min: 15, max: 16 });
    expect(band(vm, "rh")).toEqual({ min: 58, max: 62 });
    // VPD is context-only at harvest → no VPD band is advertised.
    expect(band(vm, "vpdKpa")).toBeNull();
    expect(band(vm, "ec")).toBeNull();
  });

  it("normalizes real plants.stage values (cure → harvest, flush → late_flower)", () => {
    expect(keys(buildBlueprintTeaserViewModel({ stage: "cure" }))).toEqual(["tempC", "rh"]);
    const flush = buildBlueprintTeaserViewModel({ stage: "flush", isDay: true });
    expect(flush.stageLabel).toBe("Late flower / flush");
    expect(flush.targetCount).toBe(7);
    expect(band(flush, "ec")).toEqual({ min: 1.0, max: 1.6 }); // late_flower EC
  });

  it("returns nothing to preview for an unknown / unset stage", () => {
    const vm = buildBlueprintTeaserViewModel({ stage: null });
    expect(vm.stageKnown).toBe(false);
    expect(vm.rows).toEqual([]);
    expect(vm.targetCount).toBe(0);
    expect(vm.stageLabel).toBe("Stage not set");
    expect(buildBlueprintTeaserViewModel({ stage: "not-a-stage" }).stageKnown).toBe(false);
  });

  it("honors an injected band table for the non-VPD metrics", () => {
    const bands = {
      ...SOP_BLUEPRINT_TARGETS,
      veg: { ...SOP_BLUEPRINT_TARGETS.veg, rh: { min: 11, max: 22 } },
    };
    const vm = buildBlueprintTeaserViewModel({ stage: "veg", isDay: true, bands });
    expect(band(vm, "rh")).toEqual({ min: 11, max: 22 });
    // VPD is single-sourced from getVpdTargetBand, not the override table.
    expect(band(vm, "vpdKpa")).toEqual({ min: 0.8, max: 1.2 });
  });
});
