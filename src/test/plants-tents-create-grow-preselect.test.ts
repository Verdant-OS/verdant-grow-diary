/**
 * Static tests verifying that /plants?growId=… and /tents?growId=…
 * preselect the grow context for creation forms, validate growId
 * against the RLS-loaded grows list, fall back to the persisted current
 * setup when unscoped, and don't impact edit flows.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const PLANTS = readFileSync(resolve(ROOT, "src/pages/Plants.tsx"), "utf8");
const TENTS = readFileSync(resolve(ROOT, "src/pages/Tents.tsx"), "utf8");
const CREATE_PLANT = readFileSync(resolve(ROOT, "src/components/CreatePlantDialog.tsx"), "utf8");
const CREATE_TENT = readFileSync(resolve(ROOT, "src/components/CreateTentDialog.tsx"), "utf8");
const BINDING_RULES = readFileSync(
  resolve(ROOT, "src/lib/createDialogGrowBindingRules.ts"),
  "utf8",
);

// Same expression with or without Prettier's parentheses around the nullish
// coalescing — the wiring pinned here (URL growId validated against the
// RLS-loaded grows via useScopedGrow) is identical in both shapes.
const VALID_GROW_ID_RE =
  /validGrowId\s*=\s*isValidScopedGrow\s*\?\s*\(?\s*urlGrowId\s*\?\?\s*undefined\s*\)?\s*:\s*undefined/;

const PAGE_DEFAULT_GROW_RE =
  /defaultGrowId=\{validGrowId\s*\?\?\s*activeGrowId\s*\?\?\s*undefined\}/;

describe("Plants/Tents — preselect grow on create", () => {
  it("Plants validates URL growId against the user's RLS-loaded grows via useScopedGrow", () => {
    expect(PLANTS).toMatch(/useScopedGrow\(\)/);
    expect(PLANTS).toMatch(VALID_GROW_ID_RE);
  });

  it("Plants prefers validGrowId and falls back to the current setup", () => {
    expect(PLANTS).toMatch(/activeGrowId/);
    expect(PLANTS).toMatch(/<CreatePlantDialog\b[\s\S]*?defaultGrowId=\{validGrowId/);
    expect(PLANTS).toMatch(PAGE_DEFAULT_GROW_RE);
  });

  it("Tents validates URL growId against the user's RLS-loaded grows via useScopedGrow", () => {
    expect(TENTS).toMatch(/useScopedGrow\(\)/);
    expect(TENTS).toMatch(VALID_GROW_ID_RE);
  });

  it("Tents prefers validGrowId and falls back to the current setup", () => {
    expect(TENTS).toMatch(/activeGrowId/);
    expect(TENTS).toMatch(/<CreateTentDialog\b[\s\S]*?defaultGrowId=\{validGrowId/);
    expect(TENTS).toMatch(PAGE_DEFAULT_GROW_RE);
  });

  it("Create dialogs resolve target grow with URL precedence over activeGrowId", () => {
    expect(BINDING_RULES).toContain("export function resolveTargetGrow");
    expect(BINDING_RULES).toMatch(/pageDefaultGrowId/);
    expect(BINDING_RULES).toMatch(/activeGrowId/);
    for (const source of [CREATE_PLANT, CREATE_TENT]) {
      expect(source).toContain("resolveTargetGrow");
      expect(source).toContain("useGrows()");
      expect(source).toMatch(/pageDefaultGrowId:\s*defaultGrowId/);
      expect(source).toMatch(/activeGrowId/);
      expect(source).toMatch(
        /payload[\s\S]*grow_id:\s*targetGrow\.id|payload\.grow_id\s*=\s*targetGrow\.id/,
      );
    }
  });

  it("CreatePlantDialog scopes tent options through the compatibility guard", () => {
    expect(CREATE_PLANT).toMatch(/checkTentGrowCompatibility/);
    expect(CREATE_PLANT).toMatch(/\.filter\([\s\S]*?checkTentGrowCompatibility/);
  });

  it("Create dialogs fail closed when no owned target grow resolves", () => {
    for (const source of [CREATE_PLANT, CREATE_TENT]) {
      expect(source).toContain("buildHardStopView");
      expect(source).toMatch(/if\s*\(hardStop\.blockSubmit\)/);
      expect(source).toMatch(/if\s*\(!targetGrow\)/);
      expect(source).not.toMatch(/if\s*\(defaultGrowId\)\s*payload\.grow_id/);
    }
  });

  it("Edit flows are not touched by URL growId (create dialogs only)", () => {
    // The dialogs are creation-only; no edit-grow logic introduced.
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
