import { describe, expect, it } from "vitest";
import {
  buildTimelinePlantStrainLookup,
  selectTimelineCultivarReferencePlacements,
} from "@/lib/timelineCultivarReferenceRules";

describe("buildTimelinePlantStrainLookup", () => {
  it("keeps the first trimmed owner-directory strain per valid plant id", () => {
    const lookup = buildTimelinePlantStrainLookup([
      { id: " plant-a ", strain: " Blue Dream " },
      { id: "plant-a", strain: "GG4" },
      { id: "plant-b", strain: null },
      { id: "", strain: "Oreoz" },
      null,
    ]);

    expect([...lookup!]).toEqual([["plant-a", "Blue Dream"]]);
  });

  it("distinguishes an unavailable read from a successful empty directory", () => {
    expect(buildTimelinePlantStrainLookup(null)).toBeNull();
    expect(buildTimelinePlantStrainLookup([])).toEqual(new Map());
  });
});

describe("selectTimelineCultivarReferencePlacements", () => {
  it("selects only the newest visible entry per confidently matched plant", () => {
    const placements = selectTimelineCultivarReferencePlacements(
      [
        {
          id: "plant-a-older",
          plant_id: "plant-a",
          entry_at: "2026-07-20T12:00:00.000Z",
        },
        {
          id: "plant-b-newest",
          plant_id: "plant-b",
          entry_at: "2026-07-22T12:00:00.000Z",
        },
        {
          id: "plant-a-newest",
          plant_id: "plant-a",
          entry_at: "2026-07-21T12:00:00.000Z",
        },
      ],
      new Map([
        ["plant-a", "Blue Dream"],
        ["plant-b", "GG4"],
      ]),
    );

    expect([...placements.keys()]).toEqual(["plant-b-newest", "plant-a-newest"]);
    expect(placements.get("plant-a-newest")).toMatchObject({
      plantId: "plant-a",
      strain: "Blue Dream",
      cultivar: { slug: "blue-dream", name: "Blue Dream" },
    });
    expect(placements.has("plant-a-older")).toBe(false);
  });

  it("uses a stable lexical entry-id tie-break independent of input order", () => {
    const first = {
      id: "entry-b",
      plant_id: "plant-a",
      entry_at: "2026-07-20T12:00:00.000Z",
    };
    const second = { ...first, id: "entry-a" };
    const strains = new Map([["plant-a", "Oreoz"]]);

    expect([...selectTimelineCultivarReferencePlacements([first, second], strains).keys()]).toEqual(
      ["entry-a"],
    );
    expect([...selectTimelineCultivarReferencePlacements([second, first], strains).keys()]).toEqual(
      ["entry-a"],
    );
  });

  it("fails closed for unavailable, malformed, partial, or unknown strain evidence", () => {
    const validEntry = {
      id: "entry-1",
      plant_id: "plant-a",
      entry_at: "2026-07-20T12:00:00.000Z",
    };

    expect(selectTimelineCultivarReferencePlacements([validEntry], null).size).toBe(0);
    expect(
      selectTimelineCultivarReferencePlacements(
        [
          { ...validEntry, id: "", entry_at: "not-a-date" },
          { ...validEntry, id: "entry-no-plant", plant_id: null },
        ],
        new Map([["plant-a", "Blue Dream"]]),
      ).size,
    ).toBe(0);
    expect(
      selectTimelineCultivarReferencePlacements([validEntry], new Map([["plant-a", "Blue"]])).size,
    ).toBe(0);
    expect(
      selectTimelineCultivarReferencePlacements(
        [validEntry],
        new Map([["plant-a", "Mystery bagseed"]]),
      ).size,
    ).toBe(0);
  });
});
