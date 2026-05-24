/**
 * Plant tent lifecycle movement tests.
 *
 * Covers:
 *  - pure rules in src/lib/plantTentMovementRules.ts
 *  - static guardrails for AssignTentDialog: writes a movement event to
 *    diary_entries but never to sensor_readings / alerts / action_queue.
 *  - grower-native labels: Move Plant, Current Tent, Previous Tent.
 *  - Add Tent / Add Plant entry points still exist.
 *  - Archive preferred over hard delete on tents/plants UI surfaces.
 *
 * No automation. No device control. No Home Assistant / MQTT / Pi ingest.
 * No fake live sensor data. No alert/action_queue mutation changes.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildPlantTentMovementDetails,
  formatPlantTentMovementNote,
  PLANT_TENT_MOVE_KIND,
} from "@/lib/plantTentMovementRules";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

describe("plantTentMovementRules · formatPlantTentMovementNote", () => {
  it("formats Seedling Clone → Veg moves with both tent names", () => {
    expect(
      formatPlantTentMovementNote({
        previousTentName: "Seedling Clone Tent",
        nextTentName: "Veg Tent",
      }),
    ).toBe("Moved plant from Seedling Clone Tent to Veg Tent.");
  });

  it("formats Veg → Flower moves with both tent names", () => {
    expect(
      formatPlantTentMovementNote({
        previousTentName: "Veg Tent",
        nextTentName: "Flower Tent",
      }),
    ).toBe("Moved plant from Veg Tent to Flower Tent.");
  });

  it("falls back to an Assigned message when there is no previous tent", () => {
    expect(
      formatPlantTentMovementNote({
        previousTentName: null,
        nextTentName: "Veg Tent",
      }),
    ).toBe("Assigned plant to Veg Tent.");
    expect(
      formatPlantTentMovementNote({
        previousTentName: "   ",
        nextTentName: "Veg Tent",
      }),
    ).toBe("Assigned plant to Veg Tent.");
  });

  it("uses safe fallbacks for missing/blank tent names", () => {
    expect(
      formatPlantTentMovementNote({
        previousTentName: undefined,
        nextTentName: undefined,
      }),
    ).toBe("Assigned plant to another tent.");
    expect(
      formatPlantTentMovementNote({
        previousTentName: "Veg Tent",
        nextTentName: "",
      }),
    ).toBe("Moved plant from Veg Tent to another tent.");
  });

  it("is deterministic for repeated calls", () => {
    const a = formatPlantTentMovementNote({
      previousTentName: "A",
      nextTentName: "B",
    });
    const b = formatPlantTentMovementNote({
      previousTentName: "A",
      nextTentName: "B",
    });
    expect(a).toBe(b);
  });
});

describe("plantTentMovementRules · buildPlantTentMovementDetails", () => {
  it("captures both tent IDs and names with a stable kind discriminator", () => {
    const d = buildPlantTentMovementDetails({
      previousTentId: "prev-id",
      nextTentId: "next-id",
      previousTentName: "Seedling Clone Tent",
      nextTentName: "Veg Tent",
    });
    expect(d).toEqual({
      kind: PLANT_TENT_MOVE_KIND,
      previous_tent_id: "prev-id",
      next_tent_id: "next-id",
      previous_tent_name: "Seedling Clone Tent",
      next_tent_name: "Veg Tent",
    });
    expect(d.kind).toBe("plant_tent_move");
  });

  it("normalises missing previous tent context to null", () => {
    const d = buildPlantTentMovementDetails({
      previousTentId: null,
      nextTentId: "next-id",
      previousTentName: null,
      nextTentName: "Veg Tent",
    });
    expect(d.previous_tent_id).toBeNull();
    expect(d.previous_tent_name).toBeNull();
    expect(d.next_tent_id).toBe("next-id");
  });
});

// ---------------------------------------------------------------------------
// Static guardrails — source-level only, no rendering.
// ---------------------------------------------------------------------------

const DIALOG = read("src/components/AssignTentDialog.tsx");
const PLANT_DETAIL = read("src/pages/PlantDetail.tsx");
const TENTS_PAGE = read("src/pages/Tents.tsx");
const PLANTS_PAGE = read("src/pages/Plants.tsx");
const CREATE_TENT = read("src/components/CreateTentDialog.tsx");
const CREATE_PLANT = read("src/components/CreatePlantDialog.tsx");
const QUICK_LOG = read("src/components/QuickLog.tsx");

describe("AssignTentDialog · movement timeline event", () => {
  it("writes a single movement event to diary_entries after the plant update", () => {
    expect(DIALOG).toMatch(/\.from\(["']diary_entries["']\)/);
    expect(DIALOG).toMatch(/\.insert\(/);
    expect(DIALOG).toContain("formatPlantTentMovementNote");
    expect(DIALOG).toContain("buildPlantTentMovementDetails");
  });

  it("invalidates plant recent activity + diary caches after a move", () => {
    expect(DIALOG).toMatch(
      /invalidateQueries\(\{\s*queryKey:\s*\["plant_recent_activity",\s*plantId\]/,
    );
    expect(DIALOG).toMatch(
      /invalidateQueries\(\{\s*queryKey:\s*\["diary_entries"\]/,
    );
  });

  it("only updates plants.tent_id (no user_id / grow_id / strain / stage / notes)", () => {
    const plantUpdates = [
      ...DIALOG.matchAll(/\.from\(["']plants["']\)\s*\.update\(\s*\{([^}]*)\}\s*\)/g),
    ];
    expect(plantUpdates.length).toBe(1);
    const payload = plantUpdates[0][1];
    expect(payload).toMatch(/tent_id/);
    expect(payload).not.toMatch(/\buser_id\b/);
    expect(payload).not.toMatch(/\bgrow_id\b/);
    expect(payload).not.toMatch(/\bstrain\b/);
    expect(payload).not.toMatch(/\bstage\b/);
    expect(payload).not.toMatch(/\bnotes\b/);
  });

  it("does NOT write sensor_readings / alerts / action_queue when moving a plant", () => {
    for (const t of [
      "sensor_readings",
      "alerts",
      "alert_events",
      "action_queue",
      "action_queue_events",
    ]) {
      expect(DIALOG).not.toMatch(new RegExp(`\\.from\\(["']${t}["']\\)`));
    }
  });

  it("contains no automation / device-control / pi-ingest strings", () => {
    expect(DIALOG).not.toMatch(
      /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|relay|actuator|webhook|device_command|autopilot|service_role/i,
    );
  });

  it("uses grower-native labels (Move Plant / Current Tent / Previous Tent)", () => {
    expect(DIALOG).toContain("Move Plant");
    expect(DIALOG).toContain("Current Tent");
    expect(DIALOG).toContain("Previous Tent");
  });
});

describe("Plant Detail · tent context wiring after a move", () => {
  it("renders environment / activity panels keyed off the plant's current tent_id", () => {
    expect(PLANT_DETAIL).toMatch(/PlantTentEnvironmentPanel[\s\S]*tentId=\{plant\.tentId/);
    expect(PLANT_DETAIL).toMatch(/PlantAssignedTentAlertsPanel[\s\S]*tentId=\{plant\.tentId/);
    expect(PLANT_DETAIL).toMatch(/PlantAssignedTentActionsPanel[\s\S]*tentId=\{plant\.tentId/);
    expect(PLANT_DETAIL).toMatch(/PlantRecentActivityPanel[\s\S]*plantId=\{plant\.id/);
  });
});

describe("QuickLog · defaults to the plant's current tent", () => {
  it("scopes diary_entries inserts to selectedPlant?.tent_id", () => {
    expect(QUICK_LOG).toMatch(/tent_id:\s*selectedPlant\?\.tent_id/);
    expect(QUICK_LOG).toMatch(/grow_id:\s*activeGrowId/);
  });
});

describe("Add Tent / Add Plant flows exist and are grow-scoped", () => {
  it("Tents page renders CreateTentDialog", () => {
    expect(TENTS_PAGE).toContain("CreateTentDialog");
  });
  it("Plants page renders CreatePlantDialog", () => {
    expect(PLANTS_PAGE).toContain("CreatePlantDialog");
  });
  it("CreateTentDialog inserts grow-scoped tents and never injects user_id", () => {
    expect(CREATE_TENT).toMatch(/\.from\(["']tents["']\)/);
    expect(CREATE_TENT).toMatch(/\.insert\(/);
    const inserts = [
      ...CREATE_TENT.matchAll(/\.insert\(\s*\{([^}]*)\}\s*\)/g),
    ];
    for (const m of inserts) {
      expect(m[1]).not.toMatch(/\buser_id\b/);
    }
  });
  it("CreatePlantDialog inserts grow-scoped plants and never injects user_id", () => {
    expect(CREATE_PLANT).toMatch(/\.from\(["']plants["']\)/);
    expect(CREATE_PLANT).toMatch(/\.insert\(/);
    const inserts = [
      ...CREATE_PLANT.matchAll(/\.insert\(\s*\{([^}]*)\}\s*\)/g),
    ];
    for (const m of inserts) {
      expect(m[1]).not.toMatch(/\buser_id\b/);
    }
  });
});

describe("Archive preferred over hard delete", () => {
  it("Tents/Plants surfaces use the is_archived flag (soft archive) rather than .delete()", () => {
    // Archive flag is the canonical filter for active rows.
    expect(read("src/hooks/use-tents.ts")).toMatch(/is_archived/);
    expect(read("src/hooks/use-plants.ts")).toMatch(/is_archived/);
  });
});
