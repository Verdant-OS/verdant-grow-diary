/**
 * Plant Detail's top back link goes to the plant's own tent, by name, instead
 * of the whole Plants list (field-notebook walk: "View Tent" sits about a
 * phone screen below the header). Pure rule; the mounted page is covered in
 * plant-detail-assigned-tent-read-state.test.tsx.
 */
import { describe, expect, it } from "vitest";
import { resolvePlantDetailTopBack } from "@/lib/plantDetailBlockedStateViewModel";

describe("resolvePlantDetailTopBack", () => {
  it("goes to the plant's own tent and names it once the tent has loaded", () => {
    expect(
      resolvePlantDetailTopBack({
        plant: { tentId: "tent-1" } as never,
        tentName: "Flower Tent 2",
      }),
    ).toEqual({
      testId: "plant-detail-top-back",
      label: "Flower Tent 2",
      path: "/tents/tent-1",
      kind: "tent",
    });
  });

  it("says Tent while the name is loading, missing or blank", () => {
    for (const tentName of [null, undefined, "", "   "]) {
      const back = resolvePlantDetailTopBack({ plant: { tentId: "tent-1" } as never, tentName });
      expect(back.label).toBe("Tent");
      expect(back.path).toBe("/tents/tent-1");
    }
  });

  it("reads the snake_case tent id of an unmapped row", () => {
    expect(resolvePlantDetailTopBack({ plant: { tent_id: "tent-9" } as never }).path).toBe(
      "/tents/tent-9",
    );
  });

  it("keeps Plants for a plant with no tent, and never shows a tent name there", () => {
    for (const plant of [{ tentId: null }, { tentId: "" }, null, undefined]) {
      expect(
        resolvePlantDetailTopBack({ plant: plant as never, tentName: "Flower Tent 2" }),
      ).toEqual({
        testId: "plant-detail-top-back",
        label: "Plants",
        path: "/plants",
        kind: "plants",
      });
    }
  });

  it("URL-encodes an unusual tent id", () => {
    expect(resolvePlantDetailTopBack({ plant: { tentId: "a/b c" } as never }).path).toBe(
      "/tents/a%2Fb%20c",
    );
  });
});
