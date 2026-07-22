import { describe, expect, it } from "vitest";
import { VERDANT_CULTIVARS } from "@/constants/verdantCultivars";
import {
  buildGlobalSearchItems,
  filterGlobalSearchItems,
} from "@/lib/globalSearchItems";

const ITEMS = buildGlobalSearchItems({
  grows: [
    { id: "grow-mcdonald", name: "Project McDonald" },
    { id: "grow-banana", name: "Banana Cough" },
  ],
  tents: [
    { id: "tent-seedling", name: "Seedling A", stage: "seedling" },
    { id: "tent-flower", name: "Flower", stage: "flower" },
  ],
  plants: [
    { id: "plant-candidate", name: "Candidate 04", strain: "Loud Cake", stage: "flower" },
    { id: "plant-starter", name: "Starter", strain: "Banana Cough", stage: "veg" },
  ],
  cultivars: VERDANT_CULTIVARS,
});

describe("shared global search entity results", () => {
  it.each([
    ["Banana Cough", "/grows/grow-banana"],
    ["McDonald", "/grows/grow-mcdonald"],
    ["Candidate", "/plants/plant-candidate"],
    ["Loud Cake", "/plants/plant-candidate"],
    ["Starter", "/plants/plant-starter"],
    ["Seedling A", "/tents/tent-seedling"],
  ])("resolves existing entity query %s", (query, route) => {
    expect(filterGlobalSearchItems(ITEMS, query).map((item) => item.to)).toContain(route);
  });

  it("uses the same search model for public cultivar aliases", () => {
    expect(filterGlobalSearchItems(ITEMS, "Gorilla Glue #4")[0]).toMatchObject({
      label: "Original Glue (GG4)",
      to: "/cultivars/gg4",
      group: "Strain Reference",
    });
  });

  it("deduplicates routes and returns stable ordering", () => {
    const duplicate = buildGlobalSearchItems({
      staticItems: [
        { label: "Plants", to: "/plants", group: "Cultivation" },
        { label: "Plants duplicate", to: "/plants", group: "Other" },
      ],
    });
    expect(duplicate).toHaveLength(1);
    expect(duplicate[0]?.label).toBe("Plants");
  });
});
