import { describe, expect, it } from "vitest";
import { resolveStartYourRoomResume } from "@/lib/startYourRoomRules";

const GROW = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TENT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PLANT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

describe("resolveStartYourRoomResume uuid case parity", () => {
  it("opens done when tent and plant grow ids differ only by letter case", () => {
    expect(
      resolveStartYourRoomResume({
        grows: [{ id: GROW, name: "QA Mid" }],
        tents: [{ id: TENT, grow_id: GROW.toUpperCase(), name: "Tent" }],
        plants: [
          {
            id: PLANT,
            grow_id: GROW.toUpperCase(),
            tent_id: TENT.toUpperCase(),
            name: "Plant",
          },
        ],
        activeGrowId: GROW,
      }),
    ).toEqual({
      step: "done",
      growId: GROW,
      growName: "QA Mid",
      tentId: TENT,
      tentName: "Tent",
      plantId: PLANT,
      plantName: "Plant",
    });
  });

  it("opens plant when activeGrowId casing differs from the single grow row", () => {
    expect(
      resolveStartYourRoomResume({
        grows: [{ id: GROW }],
        tents: [{ id: TENT, grow_id: GROW.toUpperCase() }],
        plants: [],
        activeGrowId: GROW.toUpperCase(),
      }),
    ).toMatchObject({ step: "plant", growId: GROW, tentId: TENT });
  });
});
