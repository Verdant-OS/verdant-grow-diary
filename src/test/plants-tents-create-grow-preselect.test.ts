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

// Same expression with or without Prettier's parentheses around the nullish
// coalescing — the wiring pinned here (URL growId validated against the
// RLS-loaded grows via useScopedGrow) is identical in both shapes.
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

  it("CreatePlantDialog accepts defaultGrowId and writes verified grow_id on insert", () => {
    expect(CREATE_PLANT).toMatch(/defaultGrowId\?\s*:\s*string/);
    expect(CREATE_PLANT).toMatch(/grow_id:\s*binding\.growId/);
    expect(CREATE_PLANT).toMatch(/resolveCreateGrowBinding/);
  });

  it("CreatePlantDialog scopes tent options to the resolved grow", () => {
    expect(CREATE_PLANT).toMatch(/filterTentsForResolvedGrow/);
    expect(CREATE_PLANT).toMatch(/resolvedGrowId/);
  });

  it("CreateTentDialog accepts defaultGrowId and writes grow_id on insert", () => {
    expect(CREATE_TENT).toMatch(/defaultGrowId\?\s*:\s*string/);
    expect(CREATE_TENT).toMatch(/buildGrowBoundTentInsertPayload/);
    expect(CREATE_TENT).toMatch(/resolveCreateGrowBinding/);
  });

  it("Create dialogs do not insert without a ready grow binding", () => {
    expect(CREATE_PLANT).toMatch(/if\s*\(binding\.kind\s*!==\s*"ready"\)\s*return/);
    expect(CREATE_TENT).toMatch(/if\s*\(binding\.kind\s*!==\s*"ready"\)\s*return/);
  });

  it("Edit flows are not touched by URL growId (create dialogs only)", () => {
    // The dialogs are creation-only; no edit-grow logic introduced.
    expect(CREATE_PLANT).not.toMatch(/update\(/);
    expect(CREATE_TENT).not.toMatch(/update\(/);
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
