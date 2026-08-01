import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  evaluateTentGrowCompatibility,
  resolveInitialPlantTentId,
} from "@/lib/createDialogGrowBindingRules";

const ROOT = resolve(__dirname, "../..");
const PLANT = readFileSync(resolve(ROOT, "src/components/CreatePlantDialog.tsx"), "utf8");

describe("create plant tent compatibility", () => {
  it("dialog clears incompatible tent and surfaces mismatch UI", () => {
    expect(PLANT).toMatch(/evaluateTentGrowCompatibility/);
    expect(PLANT).toMatch(/evaluateSuppliedDefaultTentBinding/);
    expect(PLANT).toMatch(/resolveInitialPlantTentId/);
    expect(PLANT).toMatch(/create-plant-tent-mismatch/);
    expect(PLANT).toMatch(/clearTentSelection|tent_id:\s*"none"/);
  });

  it("orphan default tent cannot remain selected under known grow", () => {
    expect(
      resolveInitialPlantTentId({
        defaultTentId: "t-bad",
        tentGrowId: null,
        targetGrowId: "g1",
      }),
    ).toBe("none");
  });

  it("mismatch tent blocks write path", () => {
    const r = evaluateTentGrowCompatibility({
      selectedTentId: "t1",
      tentGrowId: "other",
      targetGrowId: "g1",
    });
    expect(r.compatible).toBe(false);
    expect(r.clearTentSelection).toBe(true);
  });
});
