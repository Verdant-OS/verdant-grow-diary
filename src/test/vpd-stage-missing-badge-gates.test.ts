import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { normalizeVpdStage } from "@/lib/vpdStageTargetRules";
import { mapTentRow, mapPlantRow } from "@/lib/growAdapters";

/**
 * P1 production regression fix: VPD stage-missing badges are no longer
 * dead-branched by stage coercion in the domain adapter. All six gates must
 * use `normalizeVpdStage(stage) === "unknown"` so missing/unmapped stages
 * surface the badge instead of being silently mapped to "seedling".
 */

const SITES: { file: string; gate: RegExp }[] = [
  {
    file: "src/pages/Tents.tsx",
    gate: /normalizeVpdStage\(t\.stage\)\s*===\s*"unknown"/,
  },
  {
    file: "src/pages/Sensors.tsx",
    gate: /normalizeVpdStage\(selectedTentStage\)\s*===\s*"unknown"/,
  },
  {
    file: "src/pages/GrowRoomMode.tsx",
    gate: /normalizeVpdStage\(tentStageById\[card\.tentId\]\)\s*===\s*"unknown"/,
  },
  {
    file: "src/pages/TentDetail.tsx",
    gate: /normalizeVpdStage\(tent\.stage\)\s*===\s*"unknown"/,
  },
  {
    file: "src/components/PlantTentEnvironmentPanel.tsx",
    gate: /normalizeVpdStage\(plantStage\)\s*===\s*"unknown"/,
  },
  {
    file: "src/pages/Dashboard.tsx",
    gate: /normalizeVpdStage\(scopedGrow\?\.stage\)\s*===\s*"unknown"/,
  },
];

const FORBIDDEN = [
  "saveAlert(",
  "logAlertEvent(",
  "from \"@/lib/alerts\"",
  "action_queue",
  "service_role",
  "device_control",
  "deviceControl",
];

describe("VPD stage-missing badge gates", () => {
  for (const { file, gate } of SITES) {
    it(`${file} gates the badge with normalizeVpdStage(...) === "unknown"`, () => {
      const src = readFileSync(resolve(process.cwd(), file), "utf8");
      expect(src).toContain("VpdStageMissingBadge");
      expect(src).toMatch(gate);
      // No legacy null-only gates remain.
      expect(src).not.toMatch(
        /VpdStageMissingBadge[\s\S]{0,400}stage\s*\)?\s*==\s*null/,
      );
    });

    it(`${file} introduces no alert/queue/automation/device-control strings via this slice`, () => {
      const src = readFileSync(resolve(process.cwd(), file), "utf8");
      // Allow existing alert/queue imports elsewhere in the file as long as
      // they are not introduced by this badge slice — we assert the badge
      // block itself stays presenter-only.
      const idx = src.indexOf("VpdStageMissingBadge");
      const window = src.slice(Math.max(0, idx - 200), idx + 400);
      for (const needle of FORBIDDEN) {
        expect(window).not.toContain(needle);
      }
    });
  }
});

describe("normalizeVpdStage classifies adapter output correctly", () => {
  const baseTent = {
    id: "t",
    user_id: "u",
    name: "T",
    brand: null,
    size: null,
    stage: "flower" as string | null,
    light_on: true,
    light_schedule: null,
    light_wattage: null,
    grow_id: null,
    is_archived: false,
    schema_version: 1,
    created_at: "x",
    updated_at: "x",
  };

  it("badge fires when adapter receives a null stage", () => {
    const t = mapTentRow({ ...baseTent, stage: null });
    expect(normalizeVpdStage(t.stage)).toBe("unknown");
  });

  it("badge fires for a truly unmapped legacy stage value", () => {
    const t = mapTentRow({ ...baseTent, stage: "weird_legacy_value" });
    expect(normalizeVpdStage(t.stage)).toBe("unknown");
  });

  it("badge does NOT fire for known mapped stages", () => {
    for (const s of ["seedling", "veg", "flower"]) {
      const t = mapTentRow({ ...baseTent, stage: s });
      expect(normalizeVpdStage(t.stage)).not.toBe("unknown");
    }
  });

  it("plant adapter behaves the same", () => {
    const basePlant = {
      id: "p",
      user_id: "u",
      tent_id: "t",
      name: "P",
      strain: null,
      grow_id: null,
      stage: null as string | null,
      started_at: "x",
      health: "healthy",
      photo_url: null,
      last_note: null,
      is_archived: false,
      schema_version: 1,
      created_at: "x",
      updated_at: "x",
    };
    expect(normalizeVpdStage(mapPlantRow(basePlant).stage)).toBe("unknown");
    expect(
      normalizeVpdStage(mapPlantRow({ ...basePlant, stage: "veg" }).stage),
    ).toBe("veg");
  });
});
