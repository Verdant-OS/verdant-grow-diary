import { describe, expect, it } from "vitest";
import { VERDANT_CULTIVARS } from "@/constants/verdantCultivars";
import {
  buildGlobalSearchItems,
  filterGlobalSearchItems,
  type GlobalSearchEntityInput,
} from "@/lib/globalSearchItems";

function entityItems(query: string, entity: GlobalSearchEntityInput) {
  return filterGlobalSearchItems(
    buildGlobalSearchItems({
      entityResults: [entity],
      cultivars: [],
      staticItems: [],
    }),
    query,
  );
}

describe("shared global search entity results", () => {
  it.each([
    [
      "Banana Cough",
      { entity_type: "grow", id: "grow-banana", label: "Banana Cough", sublabel: "Grow" },
      "/grows/grow-banana",
    ],
    [
      "McDonald",
      {
        entity_type: "grow",
        id: "grow-mcdonald",
        label: "Project McDonald",
        sublabel: "Grow",
      },
      "/grows/grow-mcdonald",
    ],
    [
      "Candidate",
      {
        entity_type: "plant",
        id: "plant-candidate",
        label: "Candidate 04",
        sublabel: "Plant · Loud Cake",
      },
      "/plants/plant-candidate",
    ],
    [
      "Loud Cake",
      {
        entity_type: "plant",
        id: "plant-candidate",
        label: "Candidate 04",
        sublabel: "Plant · Loud Cake",
      },
      "/plants/plant-candidate",
    ],
    [
      "Starter",
      {
        entity_type: "plant",
        id: "plant-starter",
        label: "Starter",
        sublabel: "Plant · Banana Cough",
      },
      "/plants/plant-starter",
    ],
    [
      "Seedling A",
      {
        entity_type: "tent",
        id: "tent-seedling",
        label: "Seedling A",
        sublabel: "Tent · seedling",
      },
      "/tents/tent-seedling",
    ],
  ] as const)("preserves the RLS-backed entity result for query %s", (query, entity, route) => {
    expect(entityItems(query, entity).map((item) => item.to)).toEqual([route]);
  });

  it("does not discard a valid server-side fuzzy match with a local substring check", () => {
    const result = entityItems("mcdonld", {
      entity_type: "grow",
      id: "grow-mcdonald",
      label: "Project McDonald",
      sublabel: "Grow",
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      to: "/grows/grow-mcdonald",
      matchedByServer: true,
      kind: "grow",
    });
  });

  it("uses the same presenter model for public cultivar aliases", () => {
    const result = filterGlobalSearchItems(
      buildGlobalSearchItems({
        entityResults: [],
        cultivars: VERDANT_CULTIVARS,
        staticItems: [],
      }),
      "Gorilla Glue #4",
    );

    expect(result[0]).toMatchObject({
      label: "Original Glue (GG4)",
      to: "/cultivars/gg4",
      group: "Strain Reference",
      kind: "cultivar",
    });
  });

  it("deduplicates routes and returns stable ordering", () => {
    const duplicate = buildGlobalSearchItems({
      staticItems: [
        { label: "Plants", to: "/plants", group: "Cultivation", kind: "page" },
        { label: "Plants duplicate", to: "/plants", group: "Other", kind: "page" },
      ],
    });

    expect(duplicate).toHaveLength(1);
    expect(duplicate[0]?.label).toBe("Plants");
  });
});
