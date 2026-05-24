/**
 * Tent edit + duplicate plant merge + photo placeholder + Mixed copy.
 *
 * Pure helper unit tests + static guardrails. No sensor / pi-ingest /
 * Edge Function / alert persistence / Action Queue / service_role /
 * automation / device-control paths are introduced by the work covered
 * here.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildTentUpdatePayload,
  isTentUpdatePayloadValid,
  evaluateTentDeleteGuard,
  buildArchiveTentPayload,
} from "@/lib/tentManagementRules";
import {
  buildPlantMergePreview,
  buildPlantMergeUpdatePlan,
  detectPotentialDuplicatePlants,
  summarizePlantMergePlan,
  validatePlantMerge,
} from "@/lib/plantMergeRules";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const TENTS_PAGE = read("src/pages/Tents.tsx");
const TENT_DETAIL = read("src/pages/TentDetail.tsx");
const PLANT_DETAIL = read("src/pages/PlantDetail.tsx");
const PLANTS_PAGE = read("src/pages/Plants.tsx");
const EDIT_TENT = read("src/components/EditTentDialog.tsx");
const TENT_ACTIONS = read("src/components/TentCardActionsMenu.tsx");
const PLANT_ACTIONS = read("src/components/PlantCardActionsMenu.tsx");
const MERGE_DIALOG = read("src/components/PlantMergeDialog.tsx");
const PLANT_PHOTO = read("src/components/PlantPhoto.tsx");
const MERGE_RULES = read("src/lib/plantMergeRules.ts");
const TENT_RULES = read("src/lib/tentManagementRules.ts");
const DISCLOSURE = read("src/components/GrowDataSourceDisclosure.tsx");
const DASH_DISCLOSURE = read("src/components/DashboardDataSourceDisclosure.tsx");

// ---------------------------------------------------------------------------
// Tent management — pure rules
// ---------------------------------------------------------------------------

describe("tentManagementRules · buildTentUpdatePayload", () => {
  it("trims strings and coerces stage / wattage", () => {
    const p = buildTentUpdatePayload({
      name: "  Tent 1 ",
      brand: "  Gorilla ",
      size: " 4x4 ",
      stage: "veg",
      light_on: true,
      light_schedule: " 18/6 ",
      light_wattage: 240,
    });
    expect(p).toEqual({
      name: "Tent 1",
      brand: "Gorilla",
      size: "4x4",
      stage: "veg",
      light_on: true,
      light_schedule: "18/6",
      light_wattage: 240,
    });
  });
  it("falls back to seedling stage and null for empty optional fields", () => {
    const p = buildTentUpdatePayload({
      name: "T",
      brand: "",
      size: "",
      stage: "bogus",
      light_on: false,
      light_schedule: "",
      light_wattage: null,
    });
    expect(p.stage).toBe("seedling");
    expect(p.brand).toBeNull();
    expect(p.size).toBeNull();
    expect(p.light_schedule).toBeNull();
    expect(p.light_wattage).toBeNull();
    expect(p.light_on).toBe(false);
  });
  it("rejects empty name via validator", () => {
    expect(isTentUpdatePayloadValid(buildTentUpdatePayload({ name: " " }))).toBe(false);
    expect(isTentUpdatePayloadValid(buildTentUpdatePayload({ name: "Ok" }))).toBe(true);
  });
  it("archive payload is a pure soft-delete flag", () => {
    expect(buildArchiveTentPayload()).toEqual({ is_archived: true });
  });
});

describe("tentManagementRules · evaluateTentDeleteGuard", () => {
  it("blocks delete and archive when plants are attached", () => {
    const g = evaluateTentDeleteGuard({ tentId: "t1", assignedPlantCount: 2 });
    expect(g.canDelete).toBe(false);
    expect(g.canArchive).toBe(false);
    expect(g.recommendedAction).toBe("move_plants_first");
  });
  it("recommends archive when empty and archive supported", () => {
    const g = evaluateTentDeleteGuard({ tentId: "t1", assignedPlantCount: 0 });
    expect(g.canDelete).toBe(true);
    expect(g.canArchive).toBe(true);
    expect(g.recommendedAction).toBe("archive");
  });
});

// ---------------------------------------------------------------------------
// Plant merge — pure rules
// ---------------------------------------------------------------------------

const A = { id: "a", name: "Auto #1", strain: "Gelato", grow_id: "g1" };
const B = { id: "b", name: "Auto #2", strain: "Gelato", grow_id: "g1" };
const C = { id: "c", name: "Other", strain: "Wedding", grow_id: "g1" };
const D = { id: "d", name: "Foreign", strain: "Gelato", grow_id: "g2" };

describe("plantMergeRules · validatePlantMerge", () => {
  it("rejects self-merge", () => {
    expect(validatePlantMerge(A, A).ok).toBe(false);
  });
  it("rejects archived target", () => {
    expect(validatePlantMerge(A, { ...B, is_archived: true }).ok).toBe(false);
  });
  it("rejects cross-grow by default", () => {
    expect(validatePlantMerge(A, D).ok).toBe(false);
  });
  it("accepts same-grow target", () => {
    expect(validatePlantMerge(A, B).ok).toBe(true);
  });
});

describe("plantMergeRules · detectPotentialDuplicatePlants", () => {
  it("groups plants with same strain and similar names in same grow", () => {
    const groups = detectPotentialDuplicatePlants([A, B, C, D]);
    expect(groups.length).toBe(1);
    expect(groups[0].map((p) => p.id).sort()).toEqual(["a", "b"]);
  });
  it("ignores archived plants", () => {
    const groups = detectPotentialDuplicatePlants([
      A,
      { ...B, is_archived: true },
    ]);
    expect(groups.length).toBe(0);
  });
});

describe("plantMergeRules · buildPlantMergePreview", () => {
  it("marks safe data types as mergeable via RPC and keeps sensor readings tent-scoped", () => {
    const preview = buildPlantMergePreview(A, B, {
      diaryEntries: 3,
      growEvents: 2,
      photoEvents: 1,
      wateringEvents: 4,
      feedingEvents: 2,
      sensorReadings: 9,
    });
    expect(preview.sameGrow).toBe(true);
    expect(preview.previewOnly).toBe(false);
    expect(preview.recommendedAction).toBe("execute_via_rpc");
    const diary = preview.lines.find((l) => l.key === "diaryEntries");
    expect(diary?.sourceCount).toBe(3);
    expect(diary?.mergeable).toBe(true);
    const sensor = preview.lines.find((l) => l.key === "sensorReadings");
    expect(sensor?.mergeable).toBe(false);
    expect(sensor?.blockedReason).toMatch(/tent-scoped/i);
  });
  it("recommends archive-after-review when source has no history", () => {
    const preview = buildPlantMergePreview(A, B, {});
    expect(preview.recommendedAction).toBe("archive_source_after_review");
    expect(preview.previewOnly).toBe(true);
  });
  it("blocks cross-grow merges without opt-in", () => {
    const preview = buildPlantMergePreview(A, D, {});
    expect(preview.recommendedAction).toBe("blocked");
    expect(preview.blockers.join(" ")).toMatch(/Cross-grow/i);
  });
  it("warns on opted-in cross-grow merges", () => {
    const preview = buildPlantMergePreview(A, D, {}, { allowCrossGrow: true });
    expect(preview.warnings.join(" ")).toMatch(/Cross-grow/i);
  });
});

describe("plantMergeRules · buildPlantMergeUpdatePlan", () => {
  it("is executable via the merge_duplicate_plant RPC", () => {
    const plan = buildPlantMergeUpdatePlan("a", "b");
    expect(plan.executable).toBe(true);
    expect(plan.rpcName).toBe("merge_duplicate_plant");
    expect(plan.steps.every((s) => s.enabled && s.via === "rpc")).toBe(true);
    expect(plan.steps.map((s) => s.table).sort()).toEqual([
      "action_queue",
      "diary_entries",
      "grow_events",
      "alerts",
    ].sort());
  });
});

describe("plantMergeRules · summarizePlantMergePlan", () => {
  it("reports server-side transaction summary when source has history", () => {
    const out = summarizePlantMergePlan(
      buildPlantMergePreview(A, B, { diaryEntries: 5 }),
    );
    expect(out).toMatch(/single server-side transaction/i);
    expect(out).toMatch(/Sensor readings/i);
  });
  it("reports safe-to-archive when source has no history", () => {
    const out = summarizePlantMergePlan(buildPlantMergePreview(A, B, {}));
    expect(out).toMatch(/Safe to archive/i);
  });
});

// ---------------------------------------------------------------------------
// UI wiring guardrails (static)
// ---------------------------------------------------------------------------

describe("Edit Tent UI wiring", () => {
  it("Tents page exposes the tent card action menu", () => {
    expect(TENTS_PAGE).toContain("TentCardActionsMenu");
  });
  it("Tent Detail exposes Edit Tent action row", () => {
    expect(TENT_DETAIL).toContain("TentCardActionsMenu");
    expect(TENT_DETAIL).toContain('variant="row"');
  });
  it("EditTentDialog edits supported fields only", () => {
    expect(EDIT_TENT).toContain("edit-tent-name");
    expect(EDIT_TENT).toContain("edit-tent-stage");
    expect(EDIT_TENT).toContain("edit-tent-light-on");
    expect(EDIT_TENT).not.toMatch(/payload\.(user_id|grow_id)\s*=/);
  });
  it("Tent actions menu disables delete when guard blocks", () => {
    expect(TENT_ACTIONS).toMatch(/disabled=\{!guard\.canDelete\}/);
  });
  it("Tent actions only update is_archived for archive (no hard delete of plants/logs)", () => {
    expect(TENT_RULES).toContain("is_archived: true");
    expect(TENT_ACTIONS).not.toMatch(
      /from\("plants"\)\.delete|from\("diary_entries"\)\.delete|from\("sensor_readings"\)\.delete|from\("alerts"\)\.delete|from\("action_queue"\)\.delete/,
    );
  });
});

describe("Plant Merge UI wiring", () => {
  it("Plant Detail exposes Merge Duplicate via action row", () => {
    expect(PLANT_ACTIONS).toContain("plant-detail-merge-duplicate");
    expect(PLANT_ACTIONS).toContain("PlantMergeDialog");
  });
  it("Merge dialog limits targets to same-grow candidates via effective grow id", () => {
    expect(MERGE_DIALOG).toContain("useGrowPlants(");
    expect(MERGE_DIALOG).toContain("sourceEffectiveGrowId");
  });
  it("Merge dialog renders the preview badge and execution note", () => {
    expect(MERGE_DIALOG).toContain("plant-merge-preview-only-badge");
    expect(MERGE_DIALOG).toContain("plant-merge-execution-blocked-note");
  });
  it("Merge dialog never hard-deletes the source plant", () => {
    expect(MERGE_DIALOG).not.toMatch(/from\("plants"\)\.delete/);
    expect(MERGE_DIALOG).toContain("buildArchivePlantPayload");
  });
  it("Merge rules enable safe-table steps now that the RPC is live", () => {
    expect(MERGE_RULES).toContain("executable: true");
    expect(MERGE_RULES).toContain('rpcName: "merge_duplicate_plant"');
  });
});

describe("Plant photo placeholder", () => {
  it("PlantPhoto renders themed placeholder on missing src / error", () => {
    expect(PLANT_PHOTO).toContain("${testId}-placeholder");
    expect(PLANT_PHOTO).toContain("onError");
  });
  it("Plants page, Plant Detail, Tent Detail use PlantPhoto", () => {
    expect(PLANTS_PAGE).toContain("PlantPhoto");
    expect(PLANT_DETAIL).toContain("PlantPhoto");
    expect(TENT_DETAIL).toContain("PlantPhoto");
  });
  it("removed raw <img src={p.photo}> from card surfaces (no broken icons)", () => {
    expect(PLANTS_PAGE).not.toMatch(/<img src=\{p\.photo\}/);
    expect(TENT_DETAIL).not.toMatch(/<img src=\{p\.photo\}/);
    expect(PLANT_DETAIL).not.toMatch(/<img src=\{plant\.photo\}/);
  });
});

describe("Mixed data label copy", () => {
  it("GrowDataSourceDisclosure uses clearer mixed wording", () => {
    expect(DISCLOSURE).toMatch(/Some .+ are real, some are demo or manual/);
    expect(DISCLOSURE).not.toMatch(/Showing a mix of live and demo \$\{resource\}\./);
  });
  it("DashboardDataSourceDisclosure uses clearer mixed wording", () => {
    expect(DASH_DISCLOSURE).toMatch(/Some data is real, some is demo or manual/);
  });
  it("Live / Demo / Mixed / Unavailable labels are still present (classification unchanged)", () => {
    expect(DISCLOSURE).toContain('"Live"');
    expect(DISCLOSURE).toContain('"Demo"');
    expect(DISCLOSURE).toContain('"Mixed"');
    expect(DISCLOSURE).toContain('"Unavailable"');
  });
});

// ---------------------------------------------------------------------------
// Global safety guardrails (static)
// ---------------------------------------------------------------------------

describe("Global safety (static)", () => {
  const FILES = [
    EDIT_TENT,
    TENT_ACTIONS,
    MERGE_DIALOG,
    MERGE_RULES,
    TENT_RULES,
    PLANT_PHOTO,
  ];
  it("no service_role usage", () => {
    for (const f of FILES) expect(f).not.toMatch(/service_role/);
  });
  it("no pi-ingest / edge-function / alert / action_queue / sensor_readings writes", () => {
    for (const f of FILES) {
      expect(f).not.toMatch(/from\(["']pi_ingest|supabase\/functions\/pi-ingest|functions\.invoke\(["']pi-ingest/);
      expect(f).not.toMatch(/from\("alerts"\)\.(insert|update|delete)/);
      expect(f).not.toMatch(/from\("action_queue"\)\.(insert|update|delete)/);
      expect(f).not.toMatch(/from\("sensor_readings"\)\.(insert|update|delete)/);
    }
  });
  it("no automation / device-control strings", () => {
    for (const f of FILES) {
      expect(f.toLowerCase()).not.toMatch(
        /\b(turn_on|turn_off|device_control|automate|automation_enabled|relay_on|relay_off)\b/,
      );
    }
  });
});
