import { describe, expect, it } from "vitest";

import { buildAiDoctorEntryOptions, buildPlantAiDoctorReviewPath } from "@/lib/aiDoctorEntryRules";

const REVIEW_ANCHOR = "#plant-ai-doctor-review";

describe("buildPlantAiDoctorReviewPath", () => {
  it.each([undefined, null, "", "   "])("fails closed when plantId is %j", (plantId) => {
    expect(buildPlantAiDoctorReviewPath({ plantId })).toBeNull();
  });

  it("URL-encodes the plant id and appends the fixed review anchor", () => {
    expect(buildPlantAiDoctorReviewPath({ plantId: " plant /?# " })).toBe(
      `/plants/plant%20%2F%3F%23${REVIEW_ANCHOR}`,
    );
  });

  it("preserves only a normalized optional tent id before the review anchor", () => {
    expect(
      buildPlantAiDoctorReviewPath({
        plantId: "plant-1",
        tentId: " tent /?# ",
      }),
    ).toBe(`/plants/plant-1?tentId=tent+%2F%3F%23${REVIEW_ANCHOR}`);
    expect(buildPlantAiDoctorReviewPath({ plantId: "plant-1", tentId: "   " })).toBe(
      `/plants/plant-1${REVIEW_ANCHOR}`,
    );
  });
});

describe("buildAiDoctorEntryOptions", () => {
  it.each([undefined, null])("returns an honest empty list for %j", (plants) => {
    expect(buildAiDoctorEntryOptions(plants)).toEqual([]);
  });

  it("offers only active plants with valid ids and builds their exact context links", () => {
    const options = buildAiDoctorEntryOptions([
      {
        id: "active-1",
        name: "Blue Dream",
        strain: "Blue Dream",
        stage: "flower",
        tentId: "tent-1",
      },
      {
        id: "archived-1",
        name: "Archived",
        is_archived: true,
      },
      {
        id: "merged-1",
        name: "Merged",
        last_note: "Merged into 00000000-0000-4000-8000-000000000000",
      },
      { id: "   ", name: "Invalid" },
    ]);

    expect(options).toEqual([
      {
        id: "active-1",
        name: "Blue Dream",
        details: "Blue Dream · flower",
        href: `/plants/active-1?tentId=tent-1${REVIEW_ANCHOR}`,
      },
    ]);
  });

  it("sorts deterministically by normalized display name and then id", () => {
    const plants = [
      { id: "z-plant", name: "alpha", stage: "veg" },
      { id: "beta", name: "Beta" },
      { id: "a-plant", name: "Alpha", tent_id: "tent-a" },
      { id: "unnamed", name: "  " },
    ] as const;

    const forward = buildAiDoctorEntryOptions(plants);
    const reverse = buildAiDoctorEntryOptions([...plants].reverse());

    expect(forward).toEqual(reverse);
    expect(forward.map((option) => option.id)).toEqual(["a-plant", "z-plant", "beta", "unnamed"]);
    expect(forward[0]).toMatchObject({
      name: "Alpha",
      details: null,
      href: `/plants/a-plant?tentId=tent-a${REVIEW_ANCHOR}`,
    });
    expect(forward[3]).toMatchObject({
      name: "Unnamed plant",
      details: null,
    });
  });
});
