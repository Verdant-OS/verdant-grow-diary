/**
 * Archived / merged plant visibility — pure helper + static UI guardrails.
 *
 * Verifies:
 *   - isArchivedPlant / isMergedPlant / isActivePlant detection
 *   - filterActivePlants / filterVisiblePlants / getActivePlantCount /
 *     shouldShowArchivedToggle / getArchivedPlantLabel / getMergeTargetPlantId
 *   - Plants page hides archived by default and exposes a toggle
 *   - TentDetail hides archived by default and excludes them from the
 *     active count
 *   - PlantDetail renders an archived/merged banner
 *   - PlantMergeDialog excludes archived target candidates and blocks
 *     archived source merges
 *   - validatePlantMerge / buildPlantMergePreview reject archived source
 *   - Static safety: no merge RPC / schema / hard-delete / sensor / pi-ingest /
 *     alert persistence / Action Queue / service_role / automation
 *     strings were introduced.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  isArchivedPlant,
  isMergedPlant,
  isActivePlant,
  filterActivePlants,
  filterVisiblePlants,
  getActivePlantCount,
  shouldShowArchivedToggle,
  getArchivedPlantLabel,
  getMergeTargetPlantId,
} from "@/lib/archivedPlantVisibilityRules";
import {
  validatePlantMerge,
  buildPlantMergePreview,
  type PlantForMerge,
} from "@/lib/plantMergeRules";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const ACTIVE = { id: "a", isArchived: false, lastNote: "fine" };
const ARCHIVED = { id: "b", isArchived: true, lastNote: "manually archived" };
const MERGED = {
  id: "c",
  isArchived: true,
  lastNote:
    "Merged into 11111111-1111-1111-1111-111111111111 at 2026-05-24T00:00:00Z\noriginal note",
};

describe("archivedPlantVisibilityRules", () => {
  it("isArchivedPlant detects is_archived from either casing", () => {
    expect(isArchivedPlant(ACTIVE)).toBe(false);
    expect(isArchivedPlant(ARCHIVED)).toBe(true);
    expect(isArchivedPlant({ is_archived: true })).toBe(true);
    expect(isArchivedPlant(null)).toBe(false);
  });

  it("isMergedPlant detects the RPC merge marker in last_note", () => {
    expect(isMergedPlant(ACTIVE)).toBe(false);
    expect(isMergedPlant(MERGED)).toBe(true);
    expect(
      isMergedPlant({
        last_note: "Merged into 22222222-2222-2222-2222-222222222222 at x",
      }),
    ).toBe(true);
  });

  it("isActivePlant excludes both archived and merged plants", () => {
    expect(isActivePlant(ACTIVE)).toBe(true);
    expect(isActivePlant(ARCHIVED)).toBe(false);
    expect(isActivePlant(MERGED)).toBe(false);
  });

  it("filterActivePlants removes archived/merged plants", () => {
    expect(filterActivePlants([ACTIVE, ARCHIVED, MERGED])).toEqual([ACTIVE]);
  });

  it("filterVisiblePlants respects showArchived", () => {
    expect(filterVisiblePlants([ACTIVE, ARCHIVED, MERGED])).toEqual([ACTIVE]);
    expect(
      filterVisiblePlants([ACTIVE, ARCHIVED, MERGED], { showArchived: true }),
    ).toHaveLength(3);
  });

  it("getActivePlantCount counts only active", () => {
    expect(getActivePlantCount([ACTIVE, ARCHIVED, MERGED, ACTIVE])).toBe(2);
  });

  it("shouldShowArchivedToggle flips on when any archived/merged plant exists", () => {
    expect(shouldShowArchivedToggle([ACTIVE])).toBe(false);
    expect(shouldShowArchivedToggle([ACTIVE, ARCHIVED])).toBe(true);
    expect(shouldShowArchivedToggle([ACTIVE, MERGED])).toBe(true);
  });

  it("getArchivedPlantLabel returns kind + label", () => {
    expect(getArchivedPlantLabel(ACTIVE).kind).toBe("active");
    expect(getArchivedPlantLabel(ARCHIVED)).toMatchObject({
      kind: "archived",
      label: "Archived",
    });
    expect(getArchivedPlantLabel(MERGED)).toMatchObject({
      kind: "merged",
      label: "Merged",
    });
  });

  it("getMergeTargetPlantId extracts uuid from merge marker", () => {
    expect(getMergeTargetPlantId(MERGED)).toBe(
      "11111111-1111-1111-1111-111111111111",
    );
    expect(getMergeTargetPlantId(ACTIVE)).toBeNull();
    expect(getMergeTargetPlantId({ last_note: "Merged into not-a-uuid" })).toBeNull();
  });
});

const baseSource: PlantForMerge = {
  id: "src",
  name: "Source",
  grow_id: "g1",
  tent_id: "t1",
  is_archived: false,
};
const baseTarget: PlantForMerge = {
  id: "tgt",
  name: "Target",
  grow_id: "g1",
  tent_id: "t1",
  is_archived: false,
};

describe("plantMergeRules archived guards", () => {
  it("validatePlantMerge rejects archived source", () => {
    const v = validatePlantMerge({ ...baseSource, is_archived: true }, baseTarget);
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/already archived or merged/i);
  });

  it("validatePlantMerge still rejects archived target", () => {
    const v = validatePlantMerge(baseSource, { ...baseTarget, is_archived: true });
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/archived/i);
  });

  it("buildPlantMergePreview emits blocker when source is archived", () => {
    const p = buildPlantMergePreview(
      { ...baseSource, is_archived: true },
      baseTarget,
      { diaryEntries: 3 },
    );
    expect(p.recommendedAction).toBe("blocked");
    expect(p.blockers.some((b) => /already archived or merged/i.test(b))).toBe(
      true,
    );
  });
});

// ---------------------------------------------------------------------------
// Static UI guardrails
// ---------------------------------------------------------------------------

const PLANTS_PAGE = read("src/pages/Plants.tsx");
const TENT_DETAIL = read("src/pages/TentDetail.tsx");
const PLANT_DETAIL = read("src/pages/PlantDetail.tsx");
const MERGE_DIALOG = read("src/components/PlantMergeDialog.tsx");
const VISIBILITY = read("src/lib/archivedPlantVisibilityRules.ts");
const MERGE_RPC_MIGRATION = read(
  "supabase/migrations/20260524050218_7269629b-bbba-4d51-9362-b19a7aece1a4.sql",
);

describe("Plants page hides archived by default", () => {
  it("uses filterVisiblePlants", () => {
    expect(PLANTS_PAGE).toMatch(/filterVisiblePlants\(/);
  });
  it("exposes a show-archived toggle", () => {
    expect(PLANTS_PAGE).toMatch(/plants-show-archived-toggle/);
    expect(PLANTS_PAGE).toMatch(/showArchived/);
  });
  it("renders an archived badge on cards", () => {
    expect(PLANTS_PAGE).toMatch(/plant-card-archived-badge/);
  });
});

describe("TentDetail hides archived by default", () => {
  it("loads active + archived plant lists separately", () => {
    expect(TENT_DETAIL).toMatch(/includeArchived: true/);
  });
  it("uses getActivePlantCount + filterVisiblePlants", () => {
    expect(TENT_DETAIL).toMatch(/getActivePlantCount\(/);
    expect(TENT_DETAIL).toMatch(/filterVisiblePlants\(/);
  });
  it("exposes show-archived toggle in tent view", () => {
    expect(TENT_DETAIL).toMatch(/tent-detail-show-archived-toggle/);
  });
  it("labels archived cards", () => {
    expect(TENT_DETAIL).toMatch(/tent-detail-plant-archived-badge/);
  });
  it("shows 'No active plants in this tent.' empty state", () => {
    expect(TENT_DETAIL).toMatch(/No active plants in this tent\./);
  });
});

describe("PlantDetail surfaces archived/merged banner", () => {
  it("renders archived banner with optional target link", () => {
    expect(PLANT_DETAIL).toMatch(/plant-detail-archived-banner/);
    expect(PLANT_DETAIL).toMatch(/plant-detail-archived-back/);
    expect(PLANT_DETAIL).toMatch(/plant-detail-archived-view-target/);
  });
  it("imports the visibility helpers", () => {
    expect(PLANT_DETAIL).toMatch(/archivedPlantVisibilityRules/);
  });
});

describe("PlantMergeDialog excludes archived candidates + blocks archived source", () => {
  it("filters archived plants out of the candidate list", () => {
    expect(MERGE_DIALOG).toMatch(/\.filter\(\(p\) => !p\.isArchived\)/);
  });
  it("renders a source-archived block + testid", () => {
    expect(MERGE_DIALOG).toMatch(/plant-merge-source-archived/);
  });
  it("threads is_archived through the source payload", () => {
    expect(MERGE_DIALOG).toMatch(/is_archived: p\.isArchived \?\? false/);
  });
});

describe("Static safety: archived/merged visibility cleanup is read-path only", () => {
  it("merge RPC migration is untouched (still hash-pinned filename)", () => {
    expect(MERGE_RPC_MIGRATION).toMatch(
      /create or replace function public\.merge_duplicate_plant/i,
    );
  });
  it("visibility rules helper performs zero I/O and zero device strings", () => {
    expect(VISIBILITY).not.toMatch(/supabase/);
    expect(VISIBILITY).not.toMatch(/service_role/);
    expect(VISIBILITY).not.toMatch(/fetch\(/);
    expect(VISIBILITY).not.toMatch(/from\(['"](alerts|action_queue|sensor_readings|pi_ingest_)/);
    expect(VISIBILITY).not.toMatch(/\b(delete|insert|update|upsert|rpc)\b/i);
  });
  it("Plants / TentDetail / PlantDetail never call merge RPC or write tables themselves", () => {
    for (const src of [PLANTS_PAGE, TENT_DETAIL, PLANT_DETAIL]) {
      expect(src).not.toMatch(/merge_duplicate_plant/);
      expect(src).not.toMatch(/service_role/);
      expect(src).not.toMatch(/\.delete\(/);
    }
  });
  it("no new automation / device control strings introduced in this changeset", () => {
    const blob = [PLANTS_PAGE, TENT_DETAIL, PLANT_DETAIL, MERGE_DIALOG, VISIBILITY].join("\n");
    expect(blob).not.toMatch(/turn_on|turn_off|relay|setpoint_set|automation_execute/);
  });
});
