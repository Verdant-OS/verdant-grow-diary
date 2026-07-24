import { describe, it, expect } from "vitest";
import type { PlantRecentActivityRow } from "@/lib/plantRecentActivityRules";
import {
  buildPlantStabilizeModeViewModel,
  shouldShowPlantStabilizeMode,
} from "@/lib/plantStabilizeModeViewModel";

const NOW = Date.parse("2026-06-10T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;

function row(p: Partial<PlantRecentActivityRow>): PlantRecentActivityRow {
  return {
    id: "row-1",
    eventType: "quick_log",
    occurredAt: new Date(NOW - 2 * HOUR).toISOString(),
    occurredAtLabel: "2h ago",
    notePreview: "Response check: Same.",
    plantId: "p1",
    tentId: "t1",
    hasPhoto: false,
    hasSnapshot: false,
    snapshotAt: null,
    snapshotStale: false,
    snapshotSourceLabel: null,
    isManualEntry: true,
    warnings: [],
    hasHardwareReadings: false,
    hardwareReadingLines: [],
    ...p,
  };
}

describe("plantStabilizeModeViewModel", () => {
  it("stays hidden for calm recent activity", () => {
    const vm = buildPlantStabilizeModeViewModel({
      rows: [row({ notePreview: "Response check: Same." })],
      now: NOW,
      plantStage: "veg",
      plantStatus: "healthy",
    });
    expect(vm.level).toBe("off");
    expect(shouldShowPlantStabilizeMode(vm)).toBe(false);
  });

  it("does not count response-only check-ins as repeated interventions", () => {
    const vm = buildPlantStabilizeModeViewModel({
      rows: [
        row({ id: "a", notePreview: "Response check: Better." }),
        row({ id: "b", notePreview: "Response check: Same." }),
        row({ id: "c", notePreview: "Quick check: Worse." }),
      ],
      now: NOW,
    });
    expect(vm.level).toBe("off");
    expect(shouldShowPlantStabilizeMode(vm)).toBe(false);
  });

  it("does not count explanatory response prose as a new intervention", () => {
    const vm = buildPlantStabilizeModeViewModel({
      rows: [
        row({ id: "a", notePreview: "Response check: Better. Watering less helped." }),
        row({ id: "b", notePreview: "Response check: Same. Feed strength held steady." }),
        row({ id: "c", notePreview: "Response check: Worse. Training may have stressed it." }),
      ],
      now: NOW,
    });
    expect(vm.level).toBe("off");
    expect(shouldShowPlantStabilizeMode(vm)).toBe(false);
  });

  it("does not count major-change words inside response-only prose", () => {
    const vm = buildPlantStabilizeModeViewModel({
      rows: [
        row({ id: "a", notePreview: "Response check: Better. Training may have stressed it." }),
        row({ id: "b", notePreview: "Response check: Same. Raised light may have helped." }),
      ],
      now: NOW,
    });
    expect(vm.level).toBe("off");
    expect(shouldShowPlantStabilizeMode(vm)).toBe(false);
  });

  it("does not count nested Response wrapper prose as interventions", () => {
    const vm = buildPlantStabilizeModeViewModel({
      rows: [
        row({
          id: "a",
          notePreview: "Response: Response check: Better. Watering less helped.",
        }),
        row({ id: "b", notePreview: "Response: Quick check: Same. Feeding held steady." }),
        row({ id: "c", notePreview: "Response: Response check: Worse. Training may recover." }),
      ],
      now: NOW,
    });
    expect(vm.level).toBe("off");
    expect(shouldShowPlantStabilizeMode(vm)).toBe(false);
  });

  it("still counts explicit major actions on lines after response context", () => {
    const vm = buildPlantStabilizeModeViewModel({
      rows: [
        row({ id: "a", notePreview: "Response check: Better.\nTraining / pruning." }),
        row({ id: "b", notePreview: "Response check: Same.\nRaised light." }),
      ],
      now: NOW,
    });
    expect(vm.level).toBe("stabilize");
    expect(shouldShowPlantStabilizeMode(vm)).toBe(true);
  });

  it("shows stabilize mode for 3+ recent actions", () => {
    const vm = buildPlantStabilizeModeViewModel({
      rows: [
        row({ id: "a", eventType: "quick_log", notePreview: "Watered" }),
        row({ id: "b", eventType: "quick_log", notePreview: "Fed" }),
        row({ id: "c", eventType: "quick_log", notePreview: "Raised light" }),
      ],
      now: NOW,
    });
    expect(vm.level).toBe("stabilize");
    expect(shouldShowPlantStabilizeMode(vm)).toBe(true);
    expect(vm.what_not_to_do.join(" ")).toContain("stacking");
  });

  it("still counts an action when a response check and action share the note", () => {
    const vm = buildPlantStabilizeModeViewModel({
      rows: [
        row({ id: "a", notePreview: "Response check: Better.\nWatered." }),
        row({ id: "b", notePreview: "Response check: Same.\nFed." }),
        row({ id: "c", notePreview: "Response check: Worse.\nEnvironment changed." }),
      ],
      now: NOW,
    });
    expect(vm.level).toBe("stabilize");
    expect(shouldShowPlantStabilizeMode(vm)).toBe(true);
  });

  it("shows stabilize mode for 2+ major recent changes", () => {
    const vm = buildPlantStabilizeModeViewModel({
      rows: [
        row({ id: "a", eventType: "training", notePreview: "Pruned lower growth" }),
        row({ id: "b", eventType: "environment_change", notePreview: "Changed light height" }),
      ],
      now: NOW,
    });
    expect(vm.level).toBe("stabilize");
    expect(vm.why_now.join(" ")).toMatch(/major changes/i);
  });

  it("ignores old actions outside the 48h window", () => {
    const old = new Date(NOW - 96 * HOUR).toISOString();
    const vm = buildPlantStabilizeModeViewModel({
      rows: [
        row({ id: "a", occurredAt: old, notePreview: "Watered" }),
        row({ id: "b", occurredAt: old, notePreview: "Fed" }),
        row({ id: "c", occurredAt: old, notePreview: "Raised light" }),
      ],
      now: NOW,
    });
    expect(shouldShowPlantStabilizeMode(vm)).toBe(false);
  });

  it("keeps guidance calm and non-automated", () => {
    const vm = buildPlantStabilizeModeViewModel({
      rows: [
        row({ id: "a", notePreview: "Watered" }),
        row({ id: "b", notePreview: "Fed" }),
        row({ id: "c", notePreview: "Raised light" }),
      ],
      now: NOW,
    });
    const copy = [
      vm.headline,
      vm.one_thing_to_watch,
      vm.safe_next_log_prompt,
      vm.recommended_wait_period,
      ...vm.why_now,
      ...vm.what_not_to_do,
    ].join(" ");
    expect(copy).not.toMatch(/definitely|guaranteed|turn on|turn off|run pump|execute/i);
    expect(vm.action_queue_policy).toBe("review_only");
  });
});
