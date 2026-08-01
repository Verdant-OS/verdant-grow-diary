import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const TENT = readFileSync(resolve(ROOT, "src/components/CreateTentDialog.tsx"), "utf8");
const PLANT = readFileSync(resolve(ROOT, "src/components/CreatePlantDialog.tsx"), "utf8");

describe("create dialog hard-stop wiring", () => {
  it("CreateTentDialog hard-stops and always writes grow_id from resolver", () => {
    expect(TENT).toMatch(/buildCreateGrowBindingHardStop/);
    expect(TENT).toMatch(/resolveCreateTargetGrowId/);
    expect(TENT).toMatch(/create-tent-hard-stop/);
    expect(TENT).toMatch(/create-tent-start-room-cta/);
    expect(TENT).toMatch(/hardStop\.startRoomHref|one_tent_activation/);
    expect(TENT).toMatch(/grow_id:\s*targetGrowId/);
    expect(TENT).toMatch(/hardStop\.blockSubmit/);
  });

  it("CreatePlantDialog hard-stops and always writes grow_id", () => {
    expect(PLANT).toMatch(/buildCreateGrowBindingHardStop/);
    expect(PLANT).toMatch(/create-plant-hard-stop/);
    expect(PLANT).toMatch(/create-plant-start-room-cta/);
    expect(PLANT).toMatch(/grow_id:\s*targetGrowId/);
    expect(PLANT).toMatch(/evaluateTentGrowCompatibility/);
  });

  it("no optional omit of grow_id on tent submit", () => {
    expect(TENT).not.toMatch(/if\s*\(defaultGrowId\)\s*payload\.grow_id/);
  });
});
