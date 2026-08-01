import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  evaluateSuppliedTentBinding,
  evaluateTentGrowCompatibility,
  plantCreateAllowsTentless,
} from "@/lib/createDialogGrowBindingRules";

const ROOT = resolve(__dirname, "../..");
const PLANT = readFileSync(resolve(ROOT, "src/components/CreatePlantDialog.tsx"), "utf8");

describe("create plant tent compatibility", () => {
  it("dialog never tentless-escapes a supplied tent", () => {
    expect(PLANT).toMatch(/evaluateSuppliedTentBinding/);
    expect(PLANT).toMatch(/plantCreateAllowsTentless/);
    expect(PLANT).toMatch(/create-plant-tent-pending/);
    expect(plantCreateAllowsTentless({ suppliedTentId: "t1" })).toBe(false);
  });

  it("orphan/mismatch block submit with zero clear-to-none contract", () => {
    const orphan = evaluateSuppliedTentBinding({
      suppliedTentId: "t1",
      tentsLoaded: true,
      suppliedTentRow: { id: "t1", grow_id: null },
      targetGrowId: "g1",
    });
    expect(orphan.blockSubmit).toBe(true);
    expect(orphan.tentId).toBe("t1");

    const noneBlocked = evaluateTentGrowCompatibility({
      selectedTentId: "none",
      tentGrowId: null,
      targetGrowId: "g1",
      requireTentForWrite: true,
    });
    expect(noneBlocked.compatible).toBe(false);
  });
});
