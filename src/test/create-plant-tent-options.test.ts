import { describe, expect, it } from "vitest";
import {
  plantCreateNoTentsHintVisible,
  selectCreatePlantTents,
} from "@/lib/createDialogGrowBindingRules";

const GROW = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TENT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("selectCreatePlantTents", () => {
  it("keeps a tent whose grow id differs only by letter case", () => {
    const tents = selectCreatePlantTents(
      [{ id: TENT, name: "QA Test Alpha", grow_id: GROW.toUpperCase() }],
      GROW,
    );
    expect(tents.map((tent) => tent.id)).toEqual([TENT]);
  });

  it("drops a tent that belongs to another grow", () => {
    const tents = selectCreatePlantTents(
      [
        {
          id: TENT,
          name: "Other",
          grow_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        },
      ],
      GROW,
    );
    expect(tents).toEqual([]);
  });

  it("drops duplicate ids so one ambiguous tent cannot be offered twice", () => {
    const row = { id: TENT, name: "QA Test Alpha", grow_id: GROW };
    expect(selectCreatePlantTents([row, { ...row }], GROW)).toEqual([]);
  });
});

describe("plantCreateNoTentsHintVisible", () => {
  it("shows the empty hint only after a successful read with no selectable tent", () => {
    expect(
      plantCreateNoTentsHintVisible({
        selectableTentCount: 0,
        tentsSettled: true,
        tentsReadFailed: false,
      }),
    ).toBe(true);
  });

  it("hides the hint while the tent read is still unsettled", () => {
    expect(
      plantCreateNoTentsHintVisible({
        selectableTentCount: 0,
        tentsSettled: false,
        tentsReadFailed: false,
      }),
    ).toBe(false);
  });

  it("hides the hint when the tent read failed", () => {
    expect(
      plantCreateNoTentsHintVisible({
        selectableTentCount: 0,
        tentsSettled: true,
        tentsReadFailed: true,
      }),
    ).toBe(false);
  });

  it("hides the hint when a tent is already in the dropdown", () => {
    expect(
      plantCreateNoTentsHintVisible({
        selectableTentCount: 1,
        tentsSettled: true,
        tentsReadFailed: false,
      }),
    ).toBe(false);
  });
});
