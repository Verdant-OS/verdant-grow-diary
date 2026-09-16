import { describe, expect, it } from "vitest";
import {
  QUICK_LOG_GROW_STAGE_UNCONFIRMED_MESSAGE,
  isQuickLogGrowStageUnconfirmed,
  shouldAttemptQuickLogGrowStageWriteback,
} from "@/lib/quickLogGrowStageWritebackRules";

describe("shouldAttemptQuickLogGrowStageWriteback", () => {
  it("requires a grow, manual stage edit, known stage, and a stage change", () => {
    expect(
      shouldAttemptQuickLogGrowStageWriteback({
        saveGrow: { stage: "veg" },
        saveStageWasUserTouched: true,
        saveStage: "flower",
      }),
    ).toBe(true);
  });

  it.each([
    ["missing grow", { saveGrow: null, saveStageWasUserTouched: true, saveStage: "flower" }],
    [
      "stage never touched",
      { saveGrow: { stage: "veg" }, saveStageWasUserTouched: false, saveStage: "flower" },
    ],
    [
      "unknown stage",
      { saveGrow: { stage: "veg" }, saveStageWasUserTouched: true, saveStage: "mystery" },
    ],
    [
      "unchanged stage",
      { saveGrow: { stage: "veg" }, saveStageWasUserTouched: true, saveStage: "veg" },
    ],
  ] as const)("skips writeback when %s", (_label, input) => {
    expect(shouldAttemptQuickLogGrowStageWriteback(input)).toBe(false);
  });
});

describe("isQuickLogGrowStageUnconfirmed", () => {
  const expected = { expectedGrowId: "g1", expectedStage: "flower" };

  it("accepts a matching grow receipt", () => {
    expect(
      isQuickLogGrowStageUnconfirmed({
        ...expected,
        stageError: null,
        updatedGrow: { id: "g1", stage: "flower" },
      }),
    ).toBe(false);
  });

  it.each([
    ["returned error", { stageError: { message: "denied" }, updatedGrow: null }],
    ["missing row", { stageError: null, updatedGrow: null }],
    ["wrong grow id", { stageError: null, updatedGrow: { id: "other-grow", stage: "flower" } }],
    ["wrong stage", { stageError: null, updatedGrow: { id: "g1", stage: "veg" } }],
  ] as const)("flags %s as unconfirmed", (_label, input) => {
    expect(isQuickLogGrowStageUnconfirmed({ ...expected, ...input })).toBe(true);
  });
});

describe("QUICK_LOG_GROW_STAGE_UNCONFIRMED_MESSAGE", () => {
  it("stays pinned for UI and toast parity", () => {
    expect(QUICK_LOG_GROW_STAGE_UNCONFIRMED_MESSAGE).toMatch(
      /wasn't confirmed\. Check the grow's stage before changing it again\.$/,
    );
  });
});
