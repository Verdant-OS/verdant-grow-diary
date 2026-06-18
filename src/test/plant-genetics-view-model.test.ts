/**
 * Tests for buildPlantGeneticsViewModel.
 *
 * Pure helper — no I/O. Asserts: string strain, object strain w/ lineage,
 * trim, dedupe, lineage cap + hidden count, null/garbage safety.
 */
import { describe, it, expect } from "vitest";
import {
  buildPlantGeneticsViewModel,
  PLANT_GENETICS_DEFAULT_MAX_LINEAGE,
} from "@/lib/plantGeneticsViewModel";

describe("buildPlantGeneticsViewModel", () => {
  it("handles a plain strain string", () => {
    const vm = buildPlantGeneticsViewModel("Wedding Cake");
    expect(vm.strainName).toBe("Wedding Cake");
    expect(vm.shouldRender).toBe(true);
    expect(vm.lineagePreview).toEqual([]);
    expect(vm.hiddenLineageCount).toBe(0);
  });

  it("handles a strain object with genetics and lineage", () => {
    const vm = buildPlantGeneticsViewModel({
      strain: {
        name: "Wedding Cake",
        breeder: "Seed Junky",
        genetics: "Triangle Kush x Animal Mints",
        lineage: ["Triangle Kush", { name: "Animal Mints" }],
        generation: "F3",
      },
    });
    expect(vm.strainName).toBe("Wedding Cake");
    expect(vm.breeder).toBe("Seed Junky");
    expect(vm.genetics).toBe("Triangle Kush x Animal Mints");
    expect(vm.lineagePreview).toEqual(["Triangle Kush", "Animal Mints"]);
    expect(vm.generation).toBe("F3");
    expect(vm.shouldRender).toBe(true);
  });

  it("trims empty / whitespace values to null", () => {
    const vm = buildPlantGeneticsViewModel({
      strain: { name: "  ", breeder: "", genetics: "   ", lineage: ["  ", ""] },
    });
    expect(vm.strainName).toBeNull();
    expect(vm.breeder).toBeNull();
    expect(vm.genetics).toBeNull();
    expect(vm.lineagePreview).toEqual([]);
    expect(vm.shouldRender).toBe(false);
  });

  it("deduplicates lineage names case-insensitively", () => {
    const vm = buildPlantGeneticsViewModel({
      strain: {
        name: "X",
        lineage: ["OG Kush", "og kush", { name: "OG KUSH" }, "Sour Diesel"],
      },
    });
    expect(vm.lineagePreview).toEqual(["OG Kush", "Sour Diesel"]);
    expect(vm.hiddenLineageCount).toBe(0);
  });

  it("caps lineage chips and reports hidden count", () => {
    const lineage = ["A", "B", "C", "D", "E", "F"];
    const vm = buildPlantGeneticsViewModel({ strain: { name: "Y", lineage } });
    expect(vm.lineagePreview).toHaveLength(PLANT_GENETICS_DEFAULT_MAX_LINEAGE);
    expect(vm.lineagePreview).toEqual(["A", "B", "C", "D"]);
    expect(vm.hiddenLineageCount).toBe(2);
  });

  it("respects custom maxLineage", () => {
    const vm = buildPlantGeneticsViewModel(
      { strain: { name: "Z", lineage: ["A", "B", "C"] } },
      { maxLineage: 2 },
    );
    expect(vm.lineagePreview).toEqual(["A", "B"]);
    expect(vm.hiddenLineageCount).toBe(1);
  });

  it("never throws on null / undefined / malformed input", () => {
    expect(buildPlantGeneticsViewModel(null).shouldRender).toBe(false);
    expect(buildPlantGeneticsViewModel(undefined).shouldRender).toBe(false);
    expect(buildPlantGeneticsViewModel(42 as unknown).shouldRender).toBe(false);
    expect(buildPlantGeneticsViewModel([] as unknown).shouldRender).toBe(false);
    expect(
      buildPlantGeneticsViewModel({ strain: 99 as unknown, lineage: "not-an-array" }).shouldRender,
    ).toBe(false);
    // Bizarre nested shape — must not throw.
    expect(() =>
      buildPlantGeneticsViewModel({ strain: { name: { weird: true }, lineage: [null, 5, {}] } }),
    ).not.toThrow();
  });

  it("accepts flat strainName + lineage on the plant", () => {
    const vm = buildPlantGeneticsViewModel({
      strainName: "Gelato",
      lineage: ["Sunset Sherbet", "Thin Mint GSC"],
      generation: 4,
    });
    expect(vm.strainName).toBe("Gelato");
    expect(vm.lineagePreview).toEqual(["Sunset Sherbet", "Thin Mint GSC"]);
    expect(vm.generation).toBe("4");
  });
});
