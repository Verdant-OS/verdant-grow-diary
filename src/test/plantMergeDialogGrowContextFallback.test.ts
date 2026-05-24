/**
 * Static safety tests for the plant grow-context fallback in
 * PlantMergeDialog + CreatePlantDialog. No cross-grow enablement,
 * no hard delete, no sensor/pi-ingest/Edge Function/automation
 * surface, no service_role.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const DIALOG = readFileSync(resolve(ROOT, "src/components/PlantMergeDialog.tsx"), "utf8");
const CREATE = readFileSync(resolve(ROOT, "src/components/CreatePlantDialog.tsx"), "utf8");
const RULES = readFileSync(resolve(ROOT, "src/lib/plantGrowContextRules.ts"), "utf8");

describe("PlantMergeDialog grow-context fallback", () => {
  it("loads tents to derive effective grow id", () => {
    expect(DIALOG).toMatch(/useTents\(\)/);
    expect(DIALOG).toMatch(/getEffectivePlantGrowId/);
  });

  it("scopes candidates by sourceEffectiveGrowId, not raw plant.grow_id", () => {
    expect(DIALOG).toMatch(/useGrowPlants\(\s*undefined,\s*sourceEffectiveGrowId/);
    expect(DIALOG).not.toMatch(/useGrowPlants\(undefined,\s*source\.grow_id/);
  });

  it("uses validatePlantGrowContextForMerge instead of legacy validatePlantMerge", () => {
    expect(DIALOG).toMatch(/validatePlantGrowContextForMerge\(/);
    expect(DIALOG).not.toMatch(/\bvalidatePlantMerge\(/);
  });

  it("shows a missing-grow-context guidance block", () => {
    expect(DIALOG).toMatch(/plant-merge-missing-grow-context/);
    expect(DIALOG).toMatch(/missing grow context/i);
  });

  it("offers a repair button that updates only grow_id", () => {
    expect(DIALOG).toMatch(/plant-merge-repair-grow-context/);
    expect(DIALOG).toMatch(/buildPlantGrowContextRepairPayload/);
    // Repair handler must call .update with the payload (grow_id only).
    expect(DIALOG).toMatch(/\.update\(payload\b/);
  });

  it("filters target candidates by effective grow id", () => {
    expect(DIALOG).toMatch(/getEffectivePlantGrowId\(p,\s*tentLinks\)/);
  });

  it("still routes execution through the merge_duplicate_plant RPC only", () => {
    expect(DIALOG).toMatch(/supabase\.rpc\(\s*"merge_duplicate_plant"/);
  });

  it("does not enable cross-grow merges in the client", () => {
    expect(DIALOG).not.toMatch(/allowCrossGrow\s*:\s*true/);
  });

  it("never hard-deletes plants from the client", () => {
    expect(DIALOG).not.toMatch(/\.delete\(\s*\)\s*\.from\(\s*["']plants["']/);
    expect(DIALOG).not.toMatch(/from\(\s*["']plants["']\s*\)\s*\.delete\(/);
  });

  it("never touches sensor ingestion, pi-ingest, automation, device control, or service_role", () => {
    for (const src of [DIALOG, RULES, CREATE]) {
      expect(src).not.toMatch(/sensor_readings|pi_ingest|pi-ingest/);
      expect(src).not.toMatch(/mqtt|home[\s_-]?assistant|webhook|actuator|relay/i);
      expect(src).not.toMatch(/service_role/);
    }
  });
});

describe("CreatePlantDialog grow-context hardening", () => {
  it("derives grow_id from the selected tent when defaultGrowId is missing", () => {
    expect(CREATE).toMatch(/selectedTent\?\.grow_id/);
    expect(CREATE).toMatch(/payload\.grow_id\s*=\s*selectedTent\.grow_id/);
  });

  it("still preserves defaultGrowId when explicitly preselected", () => {
    expect(CREATE).toMatch(/if\s*\(defaultGrowId\)/);
    expect(CREATE).toMatch(/payload\.grow_id\s*=\s*defaultGrowId/);
  });

  it("does not introduce any cross-grow override", () => {
    expect(CREATE).not.toMatch(/allowCrossGrow/);
  });
});

describe("plantGrowContextRules safety surface", () => {
  it("repair payload type is strictly { grow_id: string }", () => {
    expect(RULES).toMatch(/\{\s*grow_id:\s*string\s*\}\s*\|\s*null/);
  });

  it("does not export anything that loosens cross-grow rules", () => {
    expect(RULES).not.toMatch(/allowCrossGrow/);
    expect(RULES).not.toMatch(/crossGrow\s*:\s*true/);
  });
});
