import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const TENT = readFileSync(resolve(ROOT, "src/components/CreateTentDialog.tsx"), "utf8");
const PLANT = readFileSync(resolve(ROOT, "src/components/CreatePlantDialog.tsx"), "utf8");

describe("create dialog hard-stop wiring", () => {
  it("CreateTentDialog uses binding view + grow_id write + read error path", () => {
    expect(TENT).toMatch(/buildCreateGrowBindingView/);
    expect(TENT).toMatch(/create-tent-hard-stop/);
    expect(TENT).toMatch(/create-tent-read-error/);
    expect(TENT).toMatch(/create-tent-requested-unavailable/);
    expect(TENT).toMatch(/grow_id:\s*targetGrowId/);
    expect(TENT).toMatch(/binding\.blockSubmit/);
  });

  it("CreatePlantDialog supplied-tent pending/error/conflict wiring", () => {
    expect(PLANT).toMatch(/evaluateSuppliedTentBinding/);
    expect(PLANT).toMatch(/create-plant-tent-pending/);
    expect(PLANT).toMatch(/create-plant-tent-unavailable/);
    expect(PLANT).toMatch(/create-plant-read-error/);
    expect(PLANT).toMatch(/grow_id:\s*targetGrowId/);
  });
});
