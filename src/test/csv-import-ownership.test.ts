import { describe, expect, it } from "vitest";
import {
  buildCsvImportPlan,
  type BuildCsvImportPlanInput,
  type OwnershipContext,
  type PreviewRowInput,
} from "@/lib/csvImportPlanRules";

const USER = "user-1";
const NOW = new Date("2026-06-04T12:00:00.000Z");
const ROW: PreviewRowInput = {
  rowIndex: 0,
  capturedAtRaw: "2026-06-01T10:00:00Z",
  metric: "temperature",
  value: 22.5,
};

function planWith(ownership: OwnershipContext): BuildCsvImportPlanInput {
  return {
    filename: "export.csv",
    fileSizeBytes: 1024,
    totalRowCount: 1,
    source: "csv",
    columnMappingVersion: "v1",
    rows: [ROW],
    ownership,
    now: NOW,
  };
}

describe("csv import — ownership enforcement", () => {
  it("rejects missing auth context", () => {
    const p = buildCsvImportPlan(planWith({
      authenticated: false, userId: null, grow: null, tent: null, plant: null,
    }));
    expect(p.hardBlockReasons).toContain("unauthenticated");
  });

  it("rejects unowned grow", () => {
    const p = buildCsvImportPlan(planWith({
      authenticated: true, userId: USER,
      grow: { id: "grow-1", ownerUserId: "other" },
      tent: { id: "tent-1", growId: "grow-1", ownerUserId: USER },
      plant: null,
    }));
    expect(p.hardBlockReasons).toContain("unowned_grow");
  });

  it("rejects unowned tent", () => {
    const p = buildCsvImportPlan(planWith({
      authenticated: true, userId: USER,
      grow: { id: "grow-1", ownerUserId: USER },
      tent: { id: "tent-1", growId: "grow-1", ownerUserId: "other" },
      plant: null,
    }));
    expect(p.hardBlockReasons).toContain("unowned_tent");
  });

  it("rejects plant not in selected tent/grow", () => {
    const p = buildCsvImportPlan(planWith({
      authenticated: true, userId: USER,
      grow: { id: "grow-1", ownerUserId: USER },
      tent: { id: "tent-1", growId: "grow-1", ownerUserId: USER },
      plant: { id: "plant-99", tentId: "other-tent", growId: "grow-1", ownerUserId: USER },
    }));
    expect(p.hardBlockReasons).toContain("plant_not_in_tent");
  });

  it("accepts owned grow/tent/plant context", () => {
    const p = buildCsvImportPlan(planWith({
      authenticated: true, userId: USER,
      grow: { id: "grow-1", ownerUserId: USER },
      tent: { id: "tent-1", growId: "grow-1", ownerUserId: USER },
      plant: { id: "plant-1", tentId: "tent-1", growId: "grow-1", ownerUserId: USER },
    }));
    expect(p.ok).toBe(true);
    expect(p.hardBlockReasons).toEqual([]);
    expect(p.acceptedWrites.length).toBe(1);
  });
});
