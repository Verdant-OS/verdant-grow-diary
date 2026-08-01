/**
 * Create-dialog grow binding guard — static regression tests.
 *
 * Live-demo regression: with the active-grow context reset ("Switch grow…"),
 * CreateTentDialog / CreatePlantDialog silently created rows bound to a stale
 * or missing grow_id (a demo tent + 6 plants landed in the wrong grow while
 * the demo grow showed 0 plants / 0 tents). These tests pin the fix:
 *
 *  - both dialogs display the resolved target grow prominently;
 *  - when no grow context resolves and the user owns grows, submit is blocked
 *    until an explicit in-dialog grow selection is made (no silent unbound or
 *    mis-bound inserts);
 *  - the explicit selection is written to payload.grow_id;
 *  - dialogs seed from activeGrowId when page defaultGrowId is absent so
 *    unscoped /tents and /plants create into the current setup;
 *  - GrowLineageRepair backfills plants.grow_id when a tent is assigned to a
 *    grow, and surfaces plants whose grow_id disagrees with their tent's grow
 *    (EditPlantDialog moves tent_id but never writes grow_id).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const CREATE_TENT = readFileSync(resolve(ROOT, "src/components/CreateTentDialog.tsx"), "utf8");
const CREATE_PLANT = readFileSync(resolve(ROOT, "src/components/CreatePlantDialog.tsx"), "utf8");
const REPAIR = readFileSync(resolve(ROOT, "src/pages/GrowLineageRepair.tsx"), "utf8");
const TENTS_PAGE = readFileSync(resolve(ROOT, "src/pages/Tents.tsx"), "utf8");
const PLANTS_PAGE = readFileSync(resolve(ROOT, "src/pages/Plants.tsx"), "utf8");

describe("CreateTentDialog — target grow visibility + explicit binding", () => {
  it("resolves the target grow from page context first, then in-dialog selection", () => {
    expect(CREATE_TENT).toMatch(
      /targetGrowId\s*=\s*defaultGrowId\s*\?\?\s*\(form\.grow_id\s*\|\|\s*undefined\)/,
    );
  });

  it("seeds in-dialog grow from activeGrowId when page default is absent", () => {
    expect(CREATE_TENT).toMatch(/activeGrowId/);
    expect(CREATE_TENT).toMatch(
      /setForm\(\(f\)\s*=>\s*\(\{\s*\.\.\.f,\s*grow_id:\s*activeGrowId\s*\}\)\)/,
    );
  });

  it("displays the resolved target grow prominently in the dialog", () => {
    expect(CREATE_TENT).toContain('data-testid="create-tent-target-grow"');
    expect(CREATE_TENT).toMatch(/Creating in grow/);
    expect(CREATE_TENT).toMatch(/\{targetGrowName\}/);
  });

  it("renders an explicit grow selector when no grow context resolves", () => {
    expect(CREATE_TENT).toMatch(
      /needsGrowSelection\s*=\s*!defaultGrowId\s*&&\s*grows\.length\s*>\s*0/,
    );
    expect(CREATE_TENT).toContain('data-testid="create-tent-grow-select"');
    expect(CREATE_TENT).toMatch(/No grow selected/);
  });

  it("blocks submit while grows are loading or unresolved", () => {
    expect(CREATE_TENT).toMatch(/hardStop\.blockSubmit|buildCreateGrowHardStopView/);
    const guardIdx = CREATE_TENT.indexOf("if (hardStop.blockSubmit)");
    const insertIdx = CREATE_TENT.indexOf('.from("tents")');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(insertIdx).toBeGreaterThan(guardIdx);
  });

  it("writes the resolved targetGrowId to grow_id", () => {
    expect(CREATE_TENT).toMatch(/grow_id:\s*targetGrowId/);
  });

  it("hard-stops zero-grows path with Start your room (no unbound insert)", () => {
    expect(CREATE_TENT).toContain('data-testid="create-tent-start-room-hard-stop"');
    expect(CREATE_TENT).toContain('data-testid="create-tent-start-room-cta"');
    expect(CREATE_TENT).toMatch(/hardStop\.hardStopCta|startRoomHref/);
    expect(CREATE_TENT).not.toMatch(/created without a grow/);
  });
});

describe("CreatePlantDialog — target grow visibility + explicit binding", () => {
  it("resolves the target grow from page context first, then in-dialog selection", () => {
    expect(CREATE_PLANT).toMatch(
      /targetGrowId\s*=\s*defaultGrowId\s*\?\?\s*\(form\.grow_id\s*\|\|\s*undefined\)/,
    );
  });

  it("seeds in-dialog grow from activeGrowId when page default is absent", () => {
    expect(CREATE_PLANT).toMatch(/activeGrowId/);
    expect(CREATE_PLANT).toMatch(
      /setForm\(\(f\)\s*=>\s*\(\{\s*\.\.\.f,\s*grow_id:\s*activeGrowId\s*\}\)\)/,
    );
  });

  it("displays the resolved target grow prominently in the dialog", () => {
    expect(CREATE_PLANT).toContain('data-testid="create-plant-target-grow"');
    expect(CREATE_PLANT).toMatch(/Creating in grow/);
    expect(CREATE_PLANT).toMatch(/\{targetGrowName\}/);
  });

  it("renders an explicit grow selector when no grow context resolves", () => {
    expect(CREATE_PLANT).toMatch(
      /needsGrowSelection\s*=\s*!defaultGrowId\s*&&\s*grows\.length\s*>\s*0/,
    );
    expect(CREATE_PLANT).toContain('data-testid="create-plant-grow-select"');
    expect(CREATE_PLANT).toMatch(/No grow selected/);
  });

  it("blocks submit before the plants insert while the grow is unresolved", () => {
    const guardIdx = CREATE_PLANT.indexOf("if (hardStop.blockSubmit)");
    const insertIdx = CREATE_PLANT.indexOf('.from("plants")');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(insertIdx).toBeGreaterThan(guardIdx);
  });

  it("always writes targetGrowId (fail closed — no tent-derived-only path)", () => {
    expect(CREATE_PLANT).toMatch(/grow_id:\s*targetGrowId/);
    expect(CREATE_PLANT).toMatch(/canWriteCreateGrowId/);
  });

  it("hard-stops zero-grows path with Start your room (no unbound insert)", () => {
    expect(CREATE_PLANT).toContain('data-testid="create-plant-start-room-hard-stop"');
    expect(CREATE_PLANT).toContain('data-testid="create-plant-start-room-cta"');
    expect(CREATE_PLANT).toMatch(/hardStop\.hardStopCta|startRoomHref/);
    expect(CREATE_PLANT).not.toMatch(/created without a grow/);
  });

  it("clears a selected tent that does not belong to the newly selected grow", () => {
    expect(CREATE_PLANT).toMatch(/t\.id\s*===\s*f\.tent_id\s*&&\s*t\.grow_id\s*===\s*v/);
  });
});

describe("Tents/Plants pages — unscoped create uses active grow", () => {
  it("Tents falls back to activeGrowId when URL grow scope is absent", () => {
    expect(TENTS_PAGE).toMatch(/activeGrowId/);
    expect(TENTS_PAGE).toMatch(/isValidScopedGrow[\s\S]{0,80}activeGrowId/);
  });

  it("Plants falls back to activeGrowId when URL grow scope is absent", () => {
    expect(PLANTS_PAGE).toMatch(/activeGrowId/);
    expect(PLANTS_PAGE).toMatch(/isValidScopedGrow[\s\S]{0,80}activeGrowId/);
  });
});

describe("GrowLineageRepair — plants follow their tent's grow", () => {
  it("backfills plants.grow_id for the tent's plants after assigning the tent", () => {
    expect(REPAIR).toMatch(
      /\.from\(\s*["']plants["']\s*\)[\s\S]{0,120}\.update\(\s*\{\s*grow_id:\s*growId\s*\}\s*\)[\s\S]{0,200}\.eq\(\s*["']tent_id["']\s*,\s*tentId\s*\)/,
    );
  });

  it("scopes the plant backfill to the signed-in user (defense in depth)", () => {
    expect(REPAIR).toMatch(
      /\.eq\(\s*["']tent_id["']\s*,\s*tentId\s*\)[\s\S]{0,120}\.eq\(\s*["']user_id["']\s*,\s*user\.id\s*\)/,
    );
  });

  it("runs the backfill only after the tents update succeeded", () => {
    // Line-ending-neutral anchors (repo can be CRLF locally, LF in CI).
    const tentUpdateIdx = REPAIR.search(
      /\.from\(\s*["']tents["']\s*\)\s*\.update\(\s*\{\s*grow_id:\s*growId\s*\}\s*\)/,
    );
    const backfillIdx = REPAIR.indexOf('.eq("tent_id", tentId)');
    expect(tentUpdateIdx).toBeGreaterThan(-1);
    expect(backfillIdx).toBeGreaterThan(tentUpdateIdx);
  });

  it("lists plants whose grow_id disagrees with their tent's grow", () => {
    expect(REPAIR).toMatch(/mismatchedPlants/);
    expect(REPAIR).toMatch(/row\.plant\.grow_id\s*!==\s*row\.tent\.grow_id/);
    expect(REPAIR).toContain('data-testid="lineage-mismatched-plant"');
  });

  it("relinks a mismatched plant to its tent's grow only (no free-form target)", () => {
    expect(REPAIR).toMatch(/relinkPlant\(plant\.id,\s*tent\.grow_id\)/);
    expect(REPAIR).toMatch(/grows\.some\(\s*\(\s*g\s*\)\s*=>\s*g\.id\s*===\s*growId\s*\)/);
  });

  it("shows the all-in-sync empty state for plants", () => {
    expect(REPAIR).toMatch(/All plants match their tent's grow\./);
  });

  it("still never touches service_role or device-control surfaces", () => {
    expect(REPAIR).not.toMatch(/mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|webhook|service_role/i);
  });
});
