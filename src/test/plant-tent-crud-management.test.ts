/**
 * Plant/Tent CRUD and relationship management.
 *
 * Pure-helper unit tests + static guardrails confirming that the new
 * EditPlantDialog, PlantCardActionsMenu, TentDetail card actions, and
 * PlantDetail action row are wired correctly without introducing
 * sensor / alert / Action Queue / Edge Function / automation paths.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  getEligiblePlantsForTentAttach,
  getEligibleTentsForPlantMove,
  isPlantAlreadyInTent,
  buildPlantTentMovePayload,
  buildRemovePlantFromTentPayload,
  buildArchivePlantPayload,
} from "@/lib/plantTentRelationshipRules";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const TENT_DETAIL = read("src/pages/TentDetail.tsx");
const PLANT_DETAIL = read("src/pages/PlantDetail.tsx");
const PLANTS_PAGE = read("src/pages/Plants.tsx");
const EDIT_DIALOG = read("src/components/EditPlantDialog.tsx");
const ACTIONS_MENU = read("src/components/PlantCardActionsMenu.tsx");
const ASSIGN_DIALOG = read("src/components/AssignTentDialog.tsx");
const ADD_EXISTING_DIALOG = read("src/components/AddExistingPlantDialog.tsx");
const RULES = read("src/lib/plantTentRelationshipRules.ts");

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe("plantTentRelationshipRules · getEligiblePlantsForTentAttach", () => {
  const plants = [
    { id: "p1", name: "A", tent_id: null, grow_id: "g1" },
    { id: "p2", name: "B", tent_id: "t1", grow_id: "g1" },
    { id: "p3", name: "C", tent_id: "t2", grow_id: "g1" },
    { id: "p4", name: "D", tent_id: null, grow_id: "g2" }, // wrong grow
    { id: "p5", name: "E", tent_id: null, grow_id: "g1", is_archived: true },
  ];

  it("groups unassigned, other-tent, and current-tent plants", () => {
    const out = getEligiblePlantsForTentAttach(plants, "t1", "g1");
    expect(out.unassigned.map((p) => p.id)).toEqual(["p1"]);
    expect(out.otherTent.map((p) => p.id)).toEqual(["p3"]);
    expect(out.currentTent.map((p) => p.id)).toEqual(["p2"]);
  });

  it("excludes archived and cross-grow plants", () => {
    const out = getEligiblePlantsForTentAttach(plants, "t1", "g1");
    const ids = [...out.unassigned, ...out.otherTent, ...out.currentTent].map(
      (p) => p.id,
    );
    expect(ids).not.toContain("p4");
    expect(ids).not.toContain("p5");
  });

  it("treats grow_id null as no cross-grow filter", () => {
    const out = getEligiblePlantsForTentAttach(plants, "t1", null);
    expect(out.unassigned.map((p) => p.id)).toContain("p4");
  });
});

describe("plantTentRelationshipRules · getEligibleTentsForPlantMove", () => {
  const tents = [
    { id: "t1", name: "Tent 1", grow_id: "g1" },
    { id: "t2", name: "Tent 2", grow_id: "g1" },
    { id: "t3", name: "Tent 3", grow_id: "g1", is_archived: true },
    { id: "t4", name: "Tent 4", grow_id: "g2" },
  ];

  it("splits others vs current tent in the same grow", () => {
    const out = getEligibleTentsForPlantMove(tents, "t1", "g1");
    expect(out.current.map((t) => t.id)).toEqual(["t1"]);
    expect(out.others.map((t) => t.id)).toEqual(["t2"]);
  });

  it("handles no other tents", () => {
    const out = getEligibleTentsForPlantMove(
      [{ id: "t1", name: "Only", grow_id: "g1" }],
      "t1",
      "g1",
    );
    expect(out.others).toEqual([]);
    expect(out.current.length).toBe(1);
  });

  it("includes all same-grow tents when plant has no current tent", () => {
    const out = getEligibleTentsForPlantMove(tents, null, "g1");
    expect(out.current).toEqual([]);
    expect(out.others.map((t) => t.id).sort()).toEqual(["t1", "t2"]);
  });
});

describe("plantTentRelationshipRules · payload helpers", () => {
  it("isPlantAlreadyInTent returns true only for current tent", () => {
    expect(isPlantAlreadyInTent({ tent_id: "t1" }, "t1")).toBe(true);
    expect(isPlantAlreadyInTent({ tent_id: "t1" }, "t2")).toBe(false);
    expect(isPlantAlreadyInTent({ tent_id: null }, "t2")).toBe(false);
  });

  it("buildPlantTentMovePayload only sets tent_id", () => {
    expect(buildPlantTentMovePayload("p1", "t2")).toEqual({ tent_id: "t2" });
  });

  it("buildRemovePlantFromTentPayload nulls tent_id only", () => {
    expect(buildRemovePlantFromTentPayload("p1")).toEqual({ tent_id: null });
  });

  it("buildArchivePlantPayload only sets is_archived", () => {
    expect(buildArchivePlantPayload("p1")).toEqual({ is_archived: true });
  });

  it("payload helpers never include user_id / grow_id / strain / stage", () => {
    for (const p of [
      buildPlantTentMovePayload("p1", "t1") as Record<string, unknown>,
      buildRemovePlantFromTentPayload("p1") as Record<string, unknown>,
      buildArchivePlantPayload("p1") as Record<string, unknown>,
    ]) {
      expect(p).not.toHaveProperty("user_id");
      expect(p).not.toHaveProperty("grow_id");
      expect(p).not.toHaveProperty("strain");
      expect(p).not.toHaveProperty("stage");
    }
  });
});

// ---------------------------------------------------------------------------
// Tent Detail wiring
// ---------------------------------------------------------------------------

describe("TentDetail · Add Plant / Add Existing Plant CTAs", () => {
  it("renders 'Add Plant to This Tent' with preselected tent and grow", () => {
    expect(TENT_DETAIL).toContain("Add Plant to This Tent");
    expect(TENT_DETAIL).toMatch(/CreatePlantDialog[\s\S]*defaultTentId=\{id\}/);
    expect(TENT_DETAIL).toMatch(/defaultGrowId=\{tent\.growId/);
  });

  it("renders 'Add Existing Plant' dialog", () => {
    expect(TENT_DETAIL).toContain("AddExistingPlantDialog");
  });

  it("plant card includes overflow actions menu", () => {
    expect(TENT_DETAIL).toContain("PlantCardActionsMenu");
  });

  it("plant card surfaces name, strain, stage and health", () => {
    expect(TENT_DETAIL).toContain('data-testid="tent-detail-plant-name"');
    expect(TENT_DETAIL).toContain('data-testid="tent-detail-plant-strain"');
    expect(TENT_DETAIL).toContain("<StageBadge stage={p.stage} />");
    expect(TENT_DETAIL).toMatch(/p\.health/);
  });
});

describe("AddExistingPlantDialog · empty-state truthfulness", () => {
  it("computes eligibleCount from unassigned + otherTent and only shows empty when both are zero", () => {
    expect(ADD_EXISTING_DIALOG).toMatch(
      /eligibleCount\s*=\s*unassigned\.length\s*\+\s*otherTent\.length/,
    );
    expect(ADD_EXISTING_DIALOG).toMatch(/eligibleCount\s*===\s*0/);
  });
});

// ---------------------------------------------------------------------------
// Plant Detail wiring
// ---------------------------------------------------------------------------

describe("PlantDetail · Edit / Move / Remove / Archive action row", () => {
  it("renders the PlantCardActionsMenu in row variant", () => {
    expect(PLANT_DETAIL).toContain("PlantCardActionsMenu");
    expect(PLANT_DETAIL).toMatch(/variant="row"/);
  });

  it("still allows assigning a tent via AssignTentDialog", () => {
    expect(PLANT_DETAIL).toContain("AssignTentDialog");
  });

  it("performs no direct writes (writes live in dialogs/menus)", () => {
    expect(PLANT_DETAIL).not.toMatch(/\.(insert|update|delete|upsert)\(/);
  });
});

describe("PlantCardActionsMenu · separate Remove vs Archive", () => {
  it("Remove from Tent uses tent_id:null and shows confirmation", () => {
    expect(ACTIONS_MENU).toContain("Remove this plant from this tent?");
    expect(ACTIONS_MENU).toContain("buildRemovePlantFromTentPayload");
  });

  it("Archive uses is_archived:true and asks for confirmation", () => {
    expect(ACTIONS_MENU).toContain("buildArchivePlantPayload");
    expect(ACTIONS_MENU).toMatch(/Archive .{0,40}\?/);
  });

  it("does not call .delete on the plants table (uses archive instead)", () => {
    expect(ACTIONS_MENU).not.toMatch(/\.delete\(/);
  });

  it("invalidates plant + tent + grow caches after a write", () => {
    expect(ACTIONS_MENU).toMatch(/queryKey:\s*\["plants"\]/);
    expect(ACTIONS_MENU).toMatch(/queryKey:\s*\["grow",\s*"plants"\]/);
    expect(ACTIONS_MENU).toMatch(/queryKey:\s*\["tent-detail"\]/);
  });
});

describe("EditPlantDialog · safe field-level updates", () => {
  it("renders Edit Plant fields: name, strain, stage, health, tent, started_at, notes", () => {
    expect(EDIT_DIALOG).toContain('data-testid="edit-plant-name"');
    expect(EDIT_DIALOG).toContain('data-testid="edit-plant-strain"');
    expect(EDIT_DIALOG).toContain('data-testid="edit-plant-tent"');
    expect(EDIT_DIALOG).toContain('data-testid="edit-plant-notes"');
    expect(EDIT_DIALOG).toMatch(/started_at/);
  });

  it("update payload never touches user_id or grow_id", () => {
    const updates = [...EDIT_DIALOG.matchAll(/payload:\s*Record<string,\s*unknown>\s*=\s*\{([\s\S]*?)\};/g)];
    expect(updates.length).toBeGreaterThan(0);
    for (const m of updates) {
      expect(m[1]).not.toMatch(/\buser_id\b/);
      expect(m[1]).not.toMatch(/\bgrow_id\b/);
    }
  });
});

describe("AssignTentDialog · Move Plant empty-state and current-tent labeling", () => {
  it("labels current tent and disables selection", () => {
    expect(ASSIGN_DIALOG).toContain("Current Tent");
    expect(ASSIGN_DIALOG).toMatch(/disabled[\s\S]{0,80}assign-tent-option-current/);
  });

  it("shows empty message when no eligible tents exist", () => {
    expect(ASSIGN_DIALOG).toMatch(/No tents available/i);
  });
});

// ---------------------------------------------------------------------------
// Plants page card clarity
// ---------------------------------------------------------------------------

describe("Plants page · card clarity", () => {
  it("shows plant name, strain, stage, health, and tent label", () => {
    expect(PLANTS_PAGE).toContain("{p.name}");
    expect(PLANTS_PAGE).toContain("{p.strain}");
    expect(PLANTS_PAGE).toContain("StageBadge");
    expect(PLANTS_PAGE).toMatch(/p\.health/);
    expect(PLANTS_PAGE).toMatch(/tent\.name/);
  });
});

// ---------------------------------------------------------------------------
// Safety guardrails
// ---------------------------------------------------------------------------

describe("safety · CRUD/relationship changes introduce no risky surfaces", () => {
  const FORBIDDEN = [
    "service_role",
    "action_queue",
    "alert_events",
    "sensor_readings",
    "pi_ingest_idempotency_keys",
    "pi_ingest_bridge_credentials",
    "mqtt",
    "home_assistant",
    "device_command",
    "actuator",
    "relay",
  ];
  const FILES = {
    EditPlantDialog: EDIT_DIALOG,
    PlantCardActionsMenu: ACTIONS_MENU,
    plantTentRelationshipRules: RULES,
  };
  for (const [label, body] of Object.entries(FILES)) {
    for (const needle of FORBIDDEN) {
      it(`${label} does not contain "${needle}"`, () => {
        expect(body.toLowerCase()).not.toContain(needle.toLowerCase());
      });
    }
  }

  it("relationship rules file is pure (no React / supabase imports)", () => {
    expect(RULES).not.toMatch(/from\s+["']react["']/);
    expect(RULES).not.toMatch(/from\s+["']@\/integrations\/supabase/);
    expect(RULES).not.toMatch(/\.from\(/);
  });
});
