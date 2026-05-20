/**
 * Static tests verifying that /plants?growId=… and /tents?growId=…
 * preselect the grow context for creation forms, validate growId
 * against the RLS-loaded grows list, and don't impact edit flows.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const PLANTS = readFileSync(resolve(ROOT, "src/pages/Plants.tsx"), "utf8");
const TENTS = readFileSync(resolve(ROOT, "src/pages/Tents.tsx"), "utf8");
const CREATE_PLANT = readFileSync(resolve(ROOT, "src/components/CreatePlantDialog.tsx"), "utf8");
const CREATE_TENT = readFileSync(resolve(ROOT, "src/components/CreateTentDialog.tsx"), "utf8");

describe("Plants/Tents — preselect grow on create", () => {
  it("Plants validates URL growId against the user's RLS-loaded grows via useScopedGrow", () => {
    expect(PLANTS).toMatch(/useScopedGrow\(\)/);
    expect(PLANTS).toMatch(/validGrowId\s*=\s*isValidScopedGrow\s*\?\s*urlGrowId\s*\?\?\s*undefined\s*:\s*undefined/);
  });

  it("Plants passes validGrowId into CreatePlantDialog", () => {
    expect(PLANTS).toMatch(/<CreatePlantDialog\s+defaultGrowId=\{validGrowId\}\s*\/>/);
  });

  it("Tents validates URL growId against the user's RLS-loaded grows via useScopedGrow", () => {
    expect(TENTS).toMatch(/useScopedGrow\(\)/);
    expect(TENTS).toMatch(/validGrowId\s*=\s*isValidScopedGrow\s*\?\s*urlGrowId\s*\?\?\s*undefined\s*:\s*undefined/);
  });

  it("Tents passes validGrowId into CreateTentDialog", () => {
    expect(TENTS).toMatch(/<CreateTentDialog\s+defaultGrowId=\{validGrowId\}\s*\/>/);
  });

  it("CreatePlantDialog accepts defaultGrowId and writes grow_id on insert", () => {
    expect(CREATE_PLANT).toMatch(/defaultGrowId\?\s*:\s*string/);
    expect(CREATE_PLANT).toMatch(/if\s*\(defaultGrowId\)\s*payload\.grow_id\s*=\s*defaultGrowId/);
  });

  it("CreatePlantDialog scopes tent options to the preselected grow", () => {
    expect(CREATE_PLANT).toMatch(/allTents[\s\S]*?\.filter\([\s\S]*?t\.grow_id\s*===\s*defaultGrowId/);
  });

  it("CreateTentDialog accepts defaultGrowId and writes grow_id on insert", () => {
    expect(CREATE_TENT).toMatch(/defaultGrowId\?\s*:\s*string/);
    expect(CREATE_TENT).toMatch(/if\s*\(defaultGrowId\)\s*payload\.grow_id\s*=\s*defaultGrowId/);
  });

  it("Create dialogs do not run when invalid growId is passed (falsy validGrowId yields no grow_id)", () => {
    // Both insert paths gate grow_id behind the truthy defaultGrowId prop.
    expect(CREATE_PLANT).not.toMatch(/payload\.grow_id\s*=\s*growId/);
    expect(CREATE_TENT).not.toMatch(/payload\.grow_id\s*=\s*growId/);
  });

  it("Edit flows are not touched by URL growId (create dialogs only)", () => {
    // The dialogs are creation-only; no edit-grow logic introduced.
    expect(CREATE_PLANT).not.toMatch(/update\(/);
    expect(CREATE_TENT).not.toMatch(/update\(/);
  });

  it("does not introduce ai-coach, device-control, or service_role surface", () => {
    for (const src of [PLANTS, TENTS, CREATE_PLANT, CREATE_TENT]) {
      expect(src).not.toMatch(/ai-coach|ai_coach/);
      expect(src).not.toMatch(/mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|webhook|\brelay\b|\bactuator\b|service_role/i);
    }
  });
});
