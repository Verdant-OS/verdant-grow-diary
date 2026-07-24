import { describe, expect, it } from "vitest";
import {
  WATERING_CONTEXT_PLANT_SPECIFIC,
  WATERING_CONTEXT_UNKNOWN,
  buildQuickLogWateringContext,
  type QuickLogWateringContextInput,
} from "@/lib/quickLogWateringContextViewModel";

const plantTarget: QuickLogWateringContextInput["resolved"] = {
  ok: true,
  targetType: "plant",
  targetId: "plant-2",
  plantId: "plant-2",
  tentId: "tent-2",
  growId: "grow-1",
};

const tentTarget: QuickLogWateringContextInput["resolved"] = {
  ok: true,
  targetType: "tent",
  targetId: "tent-2",
  plantId: null,
  tentId: "tent-2",
  growId: "grow-1",
};

function build(patch: Partial<QuickLogWateringContextInput> = {}) {
  return buildQuickLogWateringContext({
    resolved: plantTarget,
    plants: [
      {
        id: "plant-1",
        grow_id: "grow-1",
        tent_id: "tent-1",
        stage: "seedling",
        medium: "soil",
        pot_size: "1 gal",
      },
      {
        id: "plant-2",
        grow_id: "grow-1",
        tent_id: "tent-2",
        stage: "early_flower",
        medium: "coco coir",
        pot_size: "5 gal",
      },
    ],
    tents: [
      { id: "tent-1", grow_id: "grow-1", stage: "vegetative" },
      { id: "tent-2", grow_id: "grow-1", stage: "flowering" },
    ],
    grows: [{ id: "grow-1", stage: "flowering" }],
    ...patch,
  });
}

describe("buildQuickLogWateringContext — fail-closed states", () => {
  it.each([null, undefined, { ok: false, reason: "no_selection" }, { ok: true }])(
    "stays hidden without a resolved typed target",
    (resolved) => {
      expect(build({ resolved })).toEqual({
        visible: false,
        scope: "none",
        fields: [],
        helper: "",
      });
    },
  );

  it("shows explicit unknown fields instead of guessing missing plant context", () => {
    const model = build({
      plants: [{ id: "plant-2", grow_id: null, tent_id: null }],
      tents: [],
      grows: [],
    });

    expect(model.visible).toBe(true);
    expect(model.fields).toEqual([
      {
        label: "Stage",
        testId: "stage",
        value: WATERING_CONTEXT_UNKNOWN,
        source: "Not recorded",
        present: false,
      },
      {
        label: "Medium",
        testId: "medium",
        value: WATERING_CONTEXT_UNKNOWN,
        source: "Not recorded",
        present: false,
      },
      {
        label: "Pot size",
        testId: "pot-size",
        value: WATERING_CONTEXT_UNKNOWN,
        source: "Not recorded",
        present: false,
      },
    ]);
  });
});

describe("buildQuickLogWateringContext — plant target", () => {
  it("uses the exact selected plant instead of the first loaded plant", () => {
    const model = build();

    expect(model.scope).toBe("plant");
    expect(model.fields).toEqual([
      {
        label: "Stage",
        testId: "stage",
        value: "Early Flower",
        source: "Plant record",
        present: true,
      },
      {
        label: "Medium",
        testId: "medium",
        value: "Coco Coir",
        source: "Plant record",
        present: true,
      },
      {
        label: "Pot size",
        testId: "pot-size",
        value: "5 Gal",
        source: "Plant record",
        present: true,
      },
    ]);
    expect(model.helper).toMatch(/read-only plant context/i);
    expect(model.helper).toMatch(/does not turn.*watering target/i);
  });

  it("resolves stage in plant, then tent, then grow specificity order", () => {
    const withoutPlantStage = build({
      plants: [
        {
          id: "plant-2",
          grow_id: "grow-1",
          tent_id: "tent-2",
          stage: " ",
        },
      ],
    });
    expect(withoutPlantStage.fields[0]).toMatchObject({
      value: "Flowering",
      source: "Tent record",
    });

    const withoutTentStage = build({
      plants: [{ id: "plant-2", grow_id: "grow-1", tent_id: "tent-2" }],
      tents: [{ id: "tent-2", grow_id: "grow-1", stage: null }],
    });
    expect(withoutTentStage.fields[0]).toMatchObject({
      value: "Flowering",
      source: "Grow record",
    });
  });

  it("derives tent and grow references from the selected plant when resolution omits them", () => {
    const model = build({
      resolved: {
        ok: true,
        targetType: "plant",
        targetId: "plant-2",
        plantId: "plant-2",
      },
      plants: [{ id: "plant-2", tent_id: "tent-2", grow_id: "grow-1" }],
      tents: [{ id: "tent-2", grow_id: "grow-1", stage: "late_flower" }],
      grows: [{ id: "grow-1", stage: "vegetative" }],
    });

    expect(model.fields[0]).toMatchObject({
      value: "Late Flower",
      source: "Tent record",
    });
  });
});

describe("buildQuickLogWateringContext — tent target", () => {
  it("keeps medium and pot size plant-specific for whole-tent watering", () => {
    const model = build({ resolved: tentTarget });

    expect(model.scope).toBe("tent");
    expect(model.fields[0]).toMatchObject({
      value: "Flowering",
      source: "Tent record",
      present: true,
    });
    expect(model.fields.slice(1)).toEqual([
      {
        label: "Medium",
        testId: "medium",
        value: WATERING_CONTEXT_PLANT_SPECIFIC,
        source: "Not recorded",
        present: false,
      },
      {
        label: "Pot size",
        testId: "pot-size",
        value: WATERING_CONTEXT_PLANT_SPECIFIC,
        source: "Not recorded",
        present: false,
      },
    ]);
    expect(model.helper).toMatch(/whole-tent context/i);
    expect(model.helper).toMatch(/does not infer/i);
  });

  it("falls back to the grow stage when the tent stage is missing", () => {
    const model = build({
      resolved: tentTarget,
      tents: [{ id: "tent-2", grow_id: "grow-1", stage: "" }],
    });

    expect(model.fields[0]).toMatchObject({
      value: "Flowering",
      source: "Grow record",
    });
  });
});

describe("buildQuickLogWateringContext — determinism", () => {
  it("returns equal frozen field collections and never mutates source records", () => {
    const input: QuickLogWateringContextInput = {
      resolved: plantTarget,
      plants: [{ id: "plant-2", stage: "vegetative", medium: "soil", pot_size: "3 gal" }],
      tents: [],
      grows: [],
    };
    const before = structuredClone(input);
    const first = buildQuickLogWateringContext(input);
    const second = buildQuickLogWateringContext(input);

    expect(first).toEqual(second);
    expect(Object.isFrozen(first.fields)).toBe(true);
    expect(input).toEqual(before);
  });
});
