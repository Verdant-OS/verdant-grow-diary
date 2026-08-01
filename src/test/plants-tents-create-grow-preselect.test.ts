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
    // URL scope wins when valid; otherwise fall back to active grow.
    expect(PLANTS).toMatch(
      /validGrowId\s*=\s*isValidScopedGrow\s*\?\s*\(urlGrowId\s*\?\?\s*undefined\)\s*:\s*\(activeGrowId\s*\?\?\s*undefined\)/,
    );
  });

  it("Plants passes validGrowId into CreatePlantDialog", () => {
    expect(PLANTS).toMatch(/<CreatePlantDialog\s+defaultGrowId=\{validGrowId\}\s*\/>/);
  });

  it("Tents validates URL growId against the user's RLS-loaded grows via useScopedGrow", () => {
    expect(TENTS).toMatch(/useScopedGrow\(\)/);
    expect(TENTS).toMatch(
      /validGrowId\s*=\s*isValidScopedGrow\s*\?\s*\(urlGrowId\s*\?\?\s*undefined\)\s*:\s*\(activeGrowId\s*\?\?\s*undefined\)/,
    );
  });

  it("Tents passes validGrowId into CreateTentDialog", () => {
    expect(TENTS).toMatch(/<CreateTentDialog\s+defaultGrowId=\{validGrowId\}\s*\/>/);
  });

  it("CreatePlantDialog accepts defaultGrowId and writes grow_id on insert", () => {
    expect(CREATE_PLANT).toMatch(/defaultGrowId\?\s*:\s*string/);
    expect(CREATE_PLANT).toMatch(/grow_id:\s*targetGrowId/);
  });

  it("CreatePlantDialog scopes tent options to the resolved target grow", () => {
    expect(CREATE_PLANT).toMatch(
      /targetGrowId\s*=\s*defaultGrowId\s*\?\?\s*\(form\.grow_id\s*\|\|\s*undefined\)/,
    );
    expect(CREATE_PLANT).toMatch(
      /allTents[\s\S]*?\.filter\([\s\S]*?t\.grow_id\s*===\s*targetGrowId/,
    );
  });

  it("CreateTentDialog accepts defaultGrowId and writes grow_id on insert", () => {
    expect(CREATE_TENT).toMatch(/defaultGrowId\?\s*:\s*string/);
    expect(CREATE_TENT).toMatch(/grow_id:\s*targetGrowId/);
  });

  it("Create dialogs do not bind via a bare growId variable", () => {
    expect(CREATE_PLANT).not.toMatch(/payload\.grow_id\s*=\s*growId\b/);
    expect(CREATE_TENT).not.toMatch(/payload\.grow_id\s*=\s*growId\b/);
  });

  it("Edit flows are not touched by URL growId (create dialogs only)", () => {
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
