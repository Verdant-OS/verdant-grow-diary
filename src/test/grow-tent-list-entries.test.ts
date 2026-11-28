// The grow page's tent list keeps every tent with an id, names a blank tent,
// and never treats a malformed read as a list (Cheek, 2026-11-28).
import { describe, expect, it } from "vitest";
import { toGrowTentListEntries } from "@/hooks/useGrowDetailData";

describe("toGrowTentListEntries", () => {
  it("keeps id and name for each tent", () => {
    expect(
      toGrowTentListEntries([
        { id: "t1", name: "Veg Alpha" },
        { id: "t2", name: "Flower" },
      ]),
    ).toEqual([
      { id: "t1", name: "Veg Alpha" },
      { id: "t2", name: "Flower" },
    ]);
  });

  it("names a blank or missing name, and drops rows without an id", () => {
    expect(
      toGrowTentListEntries([
        { id: "t1", name: "   " },
        { id: "t2" },
        { id: "", name: "ghost" },
        { name: "no id" },
        null,
      ]),
    ).toEqual([
      { id: "t1", name: "Unnamed tent" },
      { id: "t2", name: "Unnamed tent" },
    ]);
  });

  it("returns no tents for a read that is not a list", () => {
    expect(toGrowTentListEntries(null)).toEqual([]);
    expect(toGrowTentListEntries({ id: "t1" })).toEqual([]);
  });
});
