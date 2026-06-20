import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PLANT_PHOTOS_ANCHOR_ID } from "@/lib/plantDetailQuickActions";

describe("Plant Detail photos anchor", () => {
  it("exports PLANT_PHOTOS_ANCHOR_ID as plant-photos", () => {
    expect(PLANT_PHOTOS_ANCHOR_ID).toBe("plant-photos");
  });

  it("renders a wrapper using PLANT_PHOTOS_ANCHOR_ID around PlantDetailPhotoStrip", () => {
    const src = readFileSync(
      resolve(__dirname, "../pages/PlantDetail.tsx"),
      "utf8",
    );
    expect(src).toMatch(/PLANT_PHOTOS_ANCHOR_ID/);
    expect(src).toMatch(/id=\{PLANT_PHOTOS_ANCHOR_ID\}/);
    expect(src).toMatch(/PlantDetailPhotoStrip/);
  });
});
