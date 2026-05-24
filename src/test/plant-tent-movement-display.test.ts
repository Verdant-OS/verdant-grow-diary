/**
 * Plant Detail "Recent Move" + current-tent clarity tests.
 *
 * Covers:
 *  - pure rules in src/lib/plantTentMovementDisplayRules.ts
 *  - PlantStatusStrip uses grower-native labels
 *  - PlantDetail wires PlantRecentMoveCard above the activity panel
 *  - static safety: no service_role / mqtt / pi_bridge / actuator /
 *    sensor_readings writes / alerts / action_queue mutations introduced
 *    by the new files.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  findLatestPlantTentMovement,
  formatMovementSummary,
  isPlantTentMovementEntry,
} from "@/lib/plantTentMovementDisplayRules";
import { PLANT_TENT_MOVE_KIND } from "@/lib/plantTentMovementRules";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const STRIP = read("src/components/PlantStatusStrip.tsx");
const PLANT_DETAIL = read("src/pages/PlantDetail.tsx");
const CARD = read("src/components/PlantRecentMoveCard.tsx");
const DISPLAY_RULES = read("src/lib/plantTentMovementDisplayRules.ts");

describe("plantTentMovementDisplayRules · isPlantTentMovementEntry", () => {
  it("matches rows tagged with the structured kind discriminator", () => {
    expect(
      isPlantTentMovementEntry({
        id: "d1",
        details: { kind: PLANT_TENT_MOVE_KIND, next_tent_id: "t2" },
      }),
    ).toBe(true);
  });

  it("falls back to deterministic note prefixes for older rows", () => {
    expect(
      isPlantTentMovementEntry({
        id: "d2",
        note: "Moved plant from Seedling Clone Tent to Veg Tent.",
      }),
    ).toBe(true);
    expect(
      isPlantTentMovementEntry({
        id: "d3",
        note: "Assigned plant to Veg Tent.",
      }),
    ).toBe(true);
  });

  it("ignores unrelated diary entries (watering, feeding, photos)", () => {
    expect(
      isPlantTentMovementEntry({ id: "d4", note: "Watered 1L", details: {} }),
    ).toBe(false);
    expect(
      isPlantTentMovementEntry({
        id: "d5",
        details: { kind: "watering" },
      }),
    ).toBe(false);
  });

  it("handles malformed details safely", () => {
    expect(isPlantTentMovementEntry({ id: "d6", details: "not-json" })).toBe(false);
    expect(isPlantTentMovementEntry(null)).toBe(false);
    expect(isPlantTentMovementEntry({})).toBe(false);
  });
});

describe("plantTentMovementDisplayRules · formatMovementSummary", () => {
  it("renders 'Moved from X to Y' with both tent names", () => {
    expect(
      formatMovementSummary({
        previousTentName: "Seedling Clone Tent",
        nextTentName: "Veg Tent",
      }),
    ).toBe("Moved from Seedling Clone Tent to Veg Tent");
  });

  it("renders 'Assigned to Y' when no previous tent", () => {
    expect(
      formatMovementSummary({
        previousTentName: null,
        nextTentName: "Veg Tent",
      }),
    ).toBe("Assigned to Veg Tent");
  });

  it("falls back to the deterministic note when names are missing", () => {
    expect(
      formatMovementSummary({
        previousTentName: null,
        nextTentName: null,
        noteFallback: "Moved plant from A to B.",
      }),
    ).toBe("Moved plant from A to B");
  });
});

describe("plantTentMovementDisplayRules · findLatestPlantTentMovement", () => {
  const rows = [
    {
      id: "older-move",
      note: "Moved plant from Seedling Clone Tent to Veg Tent.",
      details: {
        kind: PLANT_TENT_MOVE_KIND,
        previous_tent_name: "Seedling Clone Tent",
        next_tent_name: "Veg Tent",
        next_tent_id: "veg-id",
      },
      entry_at: "2026-05-01T10:00:00.000Z",
      tent_id: "veg-id",
    },
    {
      id: "newer-move",
      note: "Moved plant from Veg Tent to Flower Tent.",
      details: {
        kind: PLANT_TENT_MOVE_KIND,
        previous_tent_name: "Veg Tent",
        next_tent_name: "Flower Tent",
        next_tent_id: "flower-id",
      },
      entry_at: "2026-05-20T10:00:00.000Z",
      tent_id: "flower-id",
    },
    {
      id: "watering",
      note: "Watered 1L",
      details: {},
      entry_at: "2026-05-22T10:00:00.000Z",
    },
  ];

  it("returns the most recent movement event regardless of row order", () => {
    const latest = findLatestPlantTentMovement(rows);
    expect(latest?.id).toBe("newer-move");
    expect(latest?.summary).toBe("Moved from Veg Tent to Flower Tent");
    expect(latest?.nextTentId).toBe("flower-id");
  });

  it("returns null when there are no movement events", () => {
    expect(
      findLatestPlantTentMovement([
        { id: "w", note: "Watered", details: {}, entry_at: "2026-05-22" },
      ]),
    ).toBeNull();
    expect(findLatestPlantTentMovement([])).toBeNull();
    expect(findLatestPlantTentMovement(null)).toBeNull();
  });
});

describe("PlantStatusStrip · grower-native labels", () => {
  it("uses Current Tent / Current Environment / Tent Alerts / Pending Tasks", () => {
    expect(STRIP).toContain("Current Tent");
    expect(STRIP).toContain("Current Environment");
    expect(STRIP).toContain("Tent Alerts");
    expect(STRIP).toContain("Pending Tasks");
    expect(STRIP).not.toMatch(/>\s*Tent\s*</);
    expect(STRIP).not.toContain("Open Alerts");
  });

  it("shows a clear empty state when no tent is assigned", () => {
    expect(STRIP).toContain("No tent assigned");
  });

  it("preserves all existing strip test ids", () => {
    expect(STRIP).toContain('data-testid="plant-status-strip"');
    expect(STRIP).toContain('data-testid="plant-status-tent"');
    expect(STRIP).toContain('data-testid="plant-status-environment"');
    expect(STRIP).toContain('data-testid="plant-status-alerts"');
    expect(STRIP).toContain('data-testid="plant-status-tasks"');
  });
});

describe("PlantDetail · current-tent context wiring", () => {
  it("renders PlantRecentMoveCard above PlantRecentActivityPanel", () => {
    expect(PLANT_DETAIL).toContain("PlantRecentMoveCard");
    const moveIdx = PLANT_DETAIL.indexOf("<PlantRecentMoveCard");
    const activityIdx = PLANT_DETAIL.indexOf("<PlantRecentActivityPanel");
    expect(moveIdx).toBeGreaterThan(-1);
    expect(activityIdx).toBeGreaterThan(-1);
    expect(moveIdx).toBeLessThan(activityIdx);
  });

  it("still renders Move Plant action via AssignTentDialog (assigned + no-tent)", () => {
    expect(PLANT_DETAIL).toContain("AssignTentDialog");
    expect(PLANT_DETAIL).toMatch(/AssignTentDialog[\s\S]*currentTentId=\{plant\.tentId/);
    expect(PLANT_DETAIL).toMatch(/AssignTentDialog[\s\S]*currentTentId=\{null\}/);
  });

  it("keeps environment / alerts / actions keyed off plant.tentId (current tent)", () => {
    expect(PLANT_DETAIL).toMatch(/PlantTentEnvironmentPanel[\s\S]*tentId=\{plant\.tentId/);
    expect(PLANT_DETAIL).toMatch(/PlantAssignedTentAlertsPanel[\s\S]*tentId=\{plant\.tentId/);
    expect(PLANT_DETAIL).toMatch(/PlantAssignedTentActionsPanel[\s\S]*tentId=\{plant\.tentId/);
  });
});

describe("PlantRecentMoveCard · safety + sourcing", () => {
  it("sources movement events from usePlantRecentActivity (diary_entries)", () => {
    expect(CARD).toContain("usePlantRecentActivity");
    expect(CARD).toContain("findLatestPlantTentMovement");
  });

  it("performs no writes and touches no sensor/alert/action_queue tables", () => {
    for (const t of [
      "sensor_readings",
      "alerts",
      "alert_events",
      "action_queue",
      "action_queue_events",
    ]) {
      expect(CARD).not.toMatch(new RegExp(`\\.from\\(["']${t}["']\\)`));
      expect(DISPLAY_RULES).not.toMatch(new RegExp(`\\.from\\(["']${t}["']\\)`));
    }
    expect(CARD).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
    expect(DISPLAY_RULES).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
  });

  it("contains no automation / device-control / unsafe integration strings", () => {
    const blocked =
      /service_role|mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|relay|actuator|webhook|device_command|autopilot|Leads/i;
    expect(CARD).not.toMatch(blocked);
    expect(DISPLAY_RULES).not.toMatch(blocked);
  });
});
