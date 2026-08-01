/**
 * Static tests: URL grow preselect + fail-closed create binding wiring.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const PLANTS = readFileSync(resolve(ROOT, "src/pages/Plants.tsx"), "utf8");
const TENTS = readFileSync(resolve(ROOT, "src/pages/Tents.tsx"), "utf8");
const CREATE_PLANT = readFileSync(resolve(ROOT, "src/components/CreatePlantDialog.tsx"), "utf8");
const CREATE_TENT = readFileSync(resolve(ROOT, "src/components/CreateTentDialog.tsx"), "utf8");

const VALID_GROW_ID_RE =
  /validGrowId\s*=\s*isValidScopedGrow\s*\?\s*\(?\s*urlGrowId\s*\?\?\s*undefined\s*\)?\s*:\s*undefined/;

describe("Plants/Tents — preselect grow on create", () => {
  it("Plants validates URL growId against the user's RLS-loaded grows via useScopedGrow", () => {
    expect(PLANTS).toMatch(/useScopedGrow\(\)/);
    expect(PLANTS).toMatch(VALID_GROW_ID_RE);
  });

  it("Plants passes validGrowId into CreatePlantDialog", () => {
    expect(PLANTS).toMatch(/<CreatePlantDialog\b[\s\S]*?defaultGrowId=\{validGrowId\}/);
  });

  it("Tents validates URL growId against the user's RLS-loaded grows via useScopedGrow", () => {
    expect(TENTS).toMatch(/useScopedGrow\(\)/);
    expect(TENTS).toMatch(VALID_GROW_ID_RE);
  });

  it("Tents passes validGrowId into CreateTentDialog", () => {
    expect(TENTS).toMatch(/<CreateTentDialog\b[\s\S]*?defaultGrowId=\{validGrowId\}/);
  });

  it("CreatePlantDialog always writes grow_id from binding view when allowed", () => {
    expect(CREATE_PLANT).toMatch(/defaultGrowId\?\s*:\s*string/);
    expect(CREATE_PLANT).toMatch(/buildCreateGrowBindingView/);
    expect(CREATE_PLANT).toMatch(/grow_id:\s*targetGrowId/);
  });

  it("CreatePlantDialog scopes tent options to the resolved target setup", () => {
    expect(CREATE_PLANT).toMatch(
      /targetGrowId[\s\S]*?\.filter\([\s\S]*?t\.grow_id\s*===\s*targetGrowId/,
    );
  });

  it("CreateTentDialog always writes grow_id from binding view when allowed", () => {
    expect(CREATE_TENT).toMatch(/defaultGrowId\?\s*:\s*string/);
    expect(CREATE_TENT).toMatch(/buildCreateGrowBindingView/);
    expect(CREATE_TENT).toMatch(/grow_id:\s*targetGrowId/);
  });

  it("Create dialogs fail closed without resolvable target", () => {
    expect(CREATE_TENT).toMatch(/formBlocked|binding\.blockSubmit/);
    expect(CREATE_PLANT).toMatch(/formBlocked|binding\.blockSubmit/);
  });

  it("Edit flows are not touched (create dialogs only)", () => {
    expect(CREATE_PLANT).not.toMatch(/\.update\(/);
    expect(CREATE_TENT).not.toMatch(/\.update\(/);
  });

  it("does not introduce ai-coach, device-control, or service_role surface", () => {
    for (const src of [PLANTS, TENTS, CREATE_PLANT, CREATE_TENT]) {
      expect(src).not.toMatch(/ai-coach|ai_coach/);
      expect(src).not.toMatch(
        /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|webhook|\brelay\b|\bactuator\b|service_role/i,
      );
    }
  });
});
