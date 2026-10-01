import { describe, expect, it } from "vitest";
import { resolveDailyCheckGrowContext } from "@/lib/dailyCheckGrowContextRules";

const plant = { grow_id: null, tent_id: "assigned-tent" };
const assignedTent = { id: "assigned-tent", grow_id: "plant-grow" };

describe("resolveDailyCheckGrowContext", () => {
  it.each([null, "workspace-grow"])(
    "uses the legacy plant's assigned grow before %s workspace grow",
    (activeGrowId) => {
      expect(resolveDailyCheckGrowContext({ plant, assignedTent, activeGrowId })).toBe(
        "plant-grow",
      );
    },
  );

  it("also supports an absent legacy grow field", () => {
    expect(
      resolveDailyCheckGrowContext({
        plant: { tent_id: "assigned-tent" },
        assignedTent,
        activeGrowId: "workspace-grow",
      }),
    ).toBe("plant-grow");
  });

  it("preserves a known plant grow over tent, URL and workspace fallback", () => {
    expect(
      resolveDailyCheckGrowContext({
        plant: { ...plant, grow_id: "known-grow" },
        assignedTent,
        urlGrowId: "url-grow",
        activeGrowId: "workspace-grow",
      }),
    ).toBe("known-grow");
  });

  it("preserves explicit empty plant grow handling rather than inventing an assignment", () => {
    expect(
      resolveDailyCheckGrowContext({
        plant: { ...plant, grow_id: "" },
        assignedTent,
        activeGrowId: "workspace-grow",
      }),
    ).toBe("");
  });

  it("does not use a different tent's grow for a legacy plant", () => {
    expect(
      resolveDailyCheckGrowContext({
        plant,
        assignedTent: { ...assignedTent, id: "unrelated-tent" },
        activeGrowId: "workspace-grow",
      }),
    ).toBe("workspace-grow");
  });

  it.each([null, undefined, ""])("does not invent a missing tent grow (%s)", (grow_id) => {
    expect(
      resolveDailyCheckGrowContext({
        plant,
        assignedTent: { ...assignedTent, grow_id },
        activeGrowId: "workspace-grow",
      }),
    ).toBe("workspace-grow");
  });

  it("keeps URL grow ahead of workspace fallback when the assignment is unavailable", () => {
    expect(
      resolveDailyCheckGrowContext({
        plant,
        assignedTent: null,
        urlGrowId: "url-grow",
        activeGrowId: "workspace-grow",
      }),
    ).toBe("url-grow");
  });

  it("retains the workspace fallback for a plain Daily Check with no selected plant", () => {
    expect(
      resolveDailyCheckGrowContext({ plant: null, assignedTent, activeGrowId: "workspace-grow" }),
    ).toBe("workspace-grow");
  });

  it.each([null, undefined])("handles %s input without a grow", (input) => {
    expect(resolveDailyCheckGrowContext(input)).toBeNull();
  });

  it("returns null when neither selection nor fallback provides a grow", () => {
    expect(
      resolveDailyCheckGrowContext({ plant: null, assignedTent: null, activeGrowId: null }),
    ).toBeNull();
  });

  it("is deterministic and does not mutate its input", () => {
    const input = Object.freeze({
      plant: Object.freeze({ ...plant }),
      assignedTent: Object.freeze({ ...assignedTent }),
      activeGrowId: "workspace-grow",
    });
    const before = JSON.stringify(input);
    expect(resolveDailyCheckGrowContext(input)).toBe("plant-grow");
    expect(resolveDailyCheckGrowContext(input)).toBe("plant-grow");
    expect(JSON.stringify(input)).toBe(before);
  });
});
