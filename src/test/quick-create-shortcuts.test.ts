/**
 * Quick plant/tent creation shortcuts — static guardrail tests.
 *
 * Verifies:
 *  - TentDetail exposes "Add Plant to This Tent" with preselected tent+grow ids.
 *  - CreatePlantDialog renders an inline "Add new tent" shortcut and selects
 *    the newly created tent automatically without losing form state.
 *  - CreateTentDialog supports the onCreated callback by returning the
 *    inserted row via .select().single().
 *  - Empty states guide the user.
 *  - No automation, device control, action_queue, or alert persistence code
 *    was introduced by this shortcut work.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const TENT_DETAIL = readFileSync(resolve(ROOT, "src/pages/TentDetail.tsx"), "utf8");
const CREATE_PLANT = readFileSync(resolve(ROOT, "src/components/CreatePlantDialog.tsx"), "utf8");
const CREATE_TENT = readFileSync(resolve(ROOT, "src/components/CreateTentDialog.tsx"), "utf8");

describe("Quick creation shortcuts — TentDetail → Add Plant", () => {
  it("imports CreatePlantDialog", () => {
    expect(TENT_DETAIL).toMatch(/import CreatePlantDialog from "@\/components\/CreatePlantDialog"/);
  });

  it("renders an 'Add Plant to This Tent' affordance", () => {
    expect(TENT_DETAIL).toMatch(/Add Plant to This Tent/);
  });

  it("preselects the current tent id on the create plant dialog", () => {
    expect(TENT_DETAIL).toMatch(/<CreatePlantDialog[\s\S]*?defaultTentId=\{id\}/);
  });

  it("preselects the current grow id when available", () => {
    expect(TENT_DETAIL).toMatch(/defaultGrowId=\{tent\.growId\s*\?\?\s*undefined\}/);
  });

  it("shows an empty-state hint when the tent has no plants yet", () => {
    expect(TENT_DETAIL).toMatch(/No plants in this tent yet\. Add Plant\./);
  });
});

describe("Quick creation shortcuts — CreatePlantDialog → Add new tent", () => {
  it("imports CreateTentDialog", () => {
    expect(CREATE_PLANT).toMatch(/import CreateTentDialog from "@\/components\/CreateTentDialog"/);
  });

  it("renders an inline 'Add new tent' shortcut", () => {
    expect(CREATE_PLANT).toMatch(/Add new tent/);
  });

  it("auto-selects the newly created tent on onCreated callback", () => {
    expect(CREATE_PLANT).toMatch(/onCreated=\{\(t\)\s*=>\s*setForm\(\(f\)\s*=>\s*\(\{\s*\.\.\.f,\s*tent_id:\s*t\.id\s*\}\)\)\}/);
  });

  it("preserves plant form data via functional setState (no full reset)", () => {
    // The onCreated callback must use the functional setter so other entered
    // fields (name/strain/etc.) are preserved when a tent is created mid-flow.
    expect(CREATE_PLANT).toMatch(/setForm\(\(f\)\s*=>\s*\(\{\s*\.\.\.f/);
  });

  it("shows an empty-state hint when no tents exist", () => {
    expect(CREATE_PLANT).toMatch(/No tents yet\. Create a tent first\./);
  });

  it("forwards the preselected grow to the nested tent creator", () => {
    expect(CREATE_PLANT).toMatch(/<CreateTentDialog[\s\S]*?defaultGrowId=\{defaultGrowId\}/);
  });
});

describe("Quick creation shortcuts — CreateTentDialog onCreated contract", () => {
  it("exposes an optional onCreated callback in its Props", () => {
    expect(CREATE_TENT).toMatch(/onCreated\?:\s*\(tent:\s*\{\s*id:\s*string;\s*name:\s*string\s*\}\)\s*=>\s*void/);
  });

  it("returns the inserted row via select(\"id, name\").single()", () => {
    expect(CREATE_TENT).toMatch(/\.insert\(payload as never\)\s*\.select\("id, name"\)\s*\.single\(\)/);
  });

  it("invokes onCreated only on successful insert", () => {
    expect(CREATE_TENT).toMatch(/if\s*\(data\s*&&\s*onCreated\)\s*onCreated\(data as \{ id: string; name: string \}\)/);
  });
});

describe("Quick creation shortcuts — V0 safety guardrails", () => {
  const FORBIDDEN = [
    "action_queue",
    "alerts",
    "alert_events",
    "service_role",
    "target_device",
    "device_command",
    "automation",
  ];

  it("TentDetail does not reference automation / device / alert persistence surfaces", () => {
    for (const term of FORBIDDEN) {
      expect(TENT_DETAIL.toLowerCase()).not.toContain(term);
    }
  });

  it("CreatePlantDialog does not reference automation / device / alert persistence surfaces", () => {
    for (const term of FORBIDDEN) {
      expect(CREATE_PLANT.toLowerCase()).not.toContain(term);
    }
  });

  it("CreateTentDialog does not reference automation / device / alert persistence surfaces", () => {
    for (const term of FORBIDDEN) {
      expect(CREATE_TENT.toLowerCase()).not.toContain(term);
    }
  });

  it("CreatePlantDialog inserts into the plants table only", () => {
    const tables = Array.from(
      CREATE_PLANT.matchAll(/\.from\("([^"]+)"\)[\s\S]{0,200}?\.insert\(/g),
      (m) => m[1],
    );
    expect(new Set(tables)).toEqual(new Set(["plants"]));
    expect(CREATE_PLANT).toContain('.from("plants")');
    expect(CREATE_PLANT).toContain(".insert(payload as never)");
  });

  it("CreateTentDialog inserts into the tents table only", () => {
    const tables = Array.from(
      CREATE_TENT.matchAll(/\.from\("([^"]+)"\)[\s\S]{0,200}?\.insert\(/g),
      (m) => m[1],
    );
    expect(new Set(tables)).toEqual(new Set(["tents"]));
    expect(CREATE_TENT).toContain('.from("tents")');
    expect(CREATE_TENT).toContain(".insert(payload as never)");
  });
});
