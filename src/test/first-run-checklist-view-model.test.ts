/**
 * View-model tests for the First-Run One-Tent Checklist.
 */
import { describe, expect, it } from "vitest";
import {
  buildFirstRunChecklistViewModel,
  FIRST_RUN_ROUTES,
  FIRST_RUN_DISMISS_STORAGE_KEY,
} from "@/lib/firstRunChecklistViewModel";

const base = {
  growCount: 0,
  tentCount: 0,
  plantCount: 0,
  quickLogCount: 0,
  sensorSnapshotCount: 0,
};

describe("firstRunChecklistViewModel", () => {
  it("with no grows: Grow step incomplete and checklist visible", () => {
    const vm = buildFirstRunChecklistViewModel(base);
    const grow = vm.steps.find((s) => s.key === "create_grow")!;
    expect(grow.state).toBe("incomplete");
    expect(vm.isVisible).toBe(true);
    expect(vm.isFullyActivated).toBe(false);
  });

  it("marks Grow complete when grow exists", () => {
    const vm = buildFirstRunChecklistViewModel({ ...base, growCount: 1 });
    expect(vm.steps.find((s) => s.key === "create_grow")!.state).toBe(
      "complete",
    );
  });

  it("marks Tent complete when tent exists", () => {
    const vm = buildFirstRunChecklistViewModel({ ...base, tentCount: 2 });
    expect(vm.steps.find((s) => s.key === "add_tent")!.state).toBe("complete");
  });

  it("marks Plant complete when plant exists", () => {
    const vm = buildFirstRunChecklistViewModel({ ...base, plantCount: 1 });
    expect(vm.steps.find((s) => s.key === "add_plant")!.state).toBe("complete");
  });

  it("fully complete: not visible and isFullyActivated true", () => {
    const vm = buildFirstRunChecklistViewModel({
      growCount: 1,
      tentCount: 1,
      plantCount: 1,
      quickLogCount: 1,
      sensorSnapshotCount: 1,
    });
    expect(vm.isFullyActivated).toBe(true);
    expect(vm.isVisible).toBe(false);
  });

  it("dismissed with partial setup hides the checklist (but not when zero grows)", () => {
    const dismissedPartial = buildFirstRunChecklistViewModel({
      growCount: 1,
      tentCount: 0,
      plantCount: 0,
      isDismissed: true,
    });
    expect(dismissedPartial.isVisible).toBe(false);
    expect(dismissedPartial.showRestoreCta).toBe(true);
  });

  it("zero grows overrides dismiss and remains visible", () => {
    const vm = buildFirstRunChecklistViewModel({
      ...base,
      isDismissed: true,
    });
    expect(vm.isVisible).toBe(true);
    expect(vm.showRestoreCta).toBe(false);
  });

  it("route targets match existing routes only", () => {
    const vm = buildFirstRunChecklistViewModel(base);
    expect(vm.steps.find((s) => s.key === "create_grow")!.href).toBe("/grows");
    expect(vm.steps.find((s) => s.key === "add_tent")!.href).toBe("/tents");
    expect(vm.steps.find((s) => s.key === "add_plant")!.href).toBe("/plants");
    expect(vm.steps.find((s) => s.key === "first_quick_log")!.href).toBe("/");
    expect(
      vm.steps.find((s) => s.key === "first_sensor_snapshot")!.href,
    ).toBe("/sensors");
    expect(FIRST_RUN_ROUTES.add_plant).toBe("/plants");
  });

  it("Quick Log and Sensor steps are 'recommended' when counts unavailable", () => {
    const vm = buildFirstRunChecklistViewModel({
      growCount: 1,
      tentCount: 1,
      plantCount: 1,
      quickLogCount: null,
      sensorSnapshotCount: null,
    });
    expect(vm.steps.find((s) => s.key === "first_quick_log")!.state).toBe(
      "recommended",
    );
    expect(
      vm.steps.find((s) => s.key === "first_sensor_snapshot")!.state,
    ).toBe("recommended");
  });

  it("Quick Log and Sensor are optional (not required)", () => {
    const vm = buildFirstRunChecklistViewModel(base);
    expect(vm.steps.find((s) => s.key === "first_quick_log")!.required).toBe(
      false,
    );
    expect(
      vm.steps.find((s) => s.key === "first_sensor_snapshot")!.required,
    ).toBe(false);
    expect(vm.requiredTotalCount).toBe(3);
  });

  it("uses a namespaced dismiss storage key", () => {
    expect(FIRST_RUN_DISMISS_STORAGE_KEY).toBe(
      "verdant:first-run-checklist-dismissed",
    );
  });

  it("copy is cautious: no automation / device-control / live-required claims", () => {
    const vm = buildFirstRunChecklistViewModel({
      growCount: 0,
      tentCount: 0,
      plantCount: 1,
    });
    const allCopy = [
      vm.intro,
      vm.safetyNote,
      vm.completedHeadline,
      ...vm.steps.flatMap((s) => [s.label, s.description, s.ctaLabel]),
    ].join(" | ");
    expect(allCopy).not.toMatch(/automation/i);
    expect(allCopy).not.toMatch(/device control/i);
    expect(allCopy).not.toMatch(/guaranteed/i);
    expect(allCopy).not.toMatch(/live data required/i);
    expect(allCopy).not.toMatch(/live sensor/i);
    expect(allCopy).not.toMatch(/ai diagnosis/i);
  });
});
