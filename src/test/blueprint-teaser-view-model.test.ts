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
  it("previews the six scoreable veg targets in overlay order, day temp band when lights on", () => {
    const vm = buildBlueprintTeaserViewModel({ stage: "veg", isDay: true });
    expect(vm.stageKnown).toBe(true);
    expect(vm.stageLabel).toBe("Veg");
    // DLI is omitted — the overlay cannot score it yet (dli: null), so the
    // teaser must not advertise it.
    expect(vm.targetCount).toBe(6);
    expect(keys(vm)).toEqual(["vpdKpa", "tempC", "rh", "ppfd", "ec", "ph"]);
    expect(band(vm, "vpdKpa")).toEqual({ min: 0.8, max: 1.2 });
    expect(band(vm, "tempC")).toEqual({ min: 24, max: 27 }); // veg day band
    expect(band(vm, "rh")).toEqual({ min: 60, max: 70 });
    expect(band(vm, "ec")).toEqual({ min: 1.0, max: 1.8 });
    expect(band(vm, "ph")).toEqual({ min: 5.8, max: 5.9 });
    expect(band(vm, "ppfd")).toEqual({ min: 400, max: 700 });
    expect(band(vm, "dli")).toBeNull();
  });

  it("never previews DLI (structurally unscoreable) at any stage", () => {
    for (const stage of ["seedling", "veg", "preflower", "flower", "flush"]) {
      expect(keys(buildBlueprintTeaserViewModel({ stage }))).not.toContain("dli");
    }
  });

  it("labels the temperature row with the applicable day/night context", () => {
    const day = buildBlueprintTeaserViewModel({ stage: "veg", isDay: true });
    expect(day.rows.find((r) => r.metricKey === "tempC")?.context).toBe("Day");
    const night = buildBlueprintTeaserViewModel({ stage: "veg", isDay: false });
    expect(night.rows.find((r) => r.metricKey === "tempC")?.context).toBe("Night");
    const unknown = buildBlueprintTeaserViewModel({ stage: "veg", isDay: null });
    expect(unknown.rows.find((r) => r.metricKey === "tempC")?.context).toBe("Day + night");
    // Non-temperature rows carry no context.
    expect(day.rows.find((r) => r.metricKey === "rh")?.context).toBeUndefined();
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
    expect(flush.targetCount).toBe(6); // 7 minus the omitted DLI
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
