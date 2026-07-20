/**
 * Tests for the first-run onboarding checklist view model.
 *
 * Pure-logic tests: covers activation state, link targets, copy safety,
 * and the show/hide rule. The Dashboard renders this card via
 * <OnboardingChecklistCard vm={...} />; render tests live elsewhere.
 */
import { describe, it, expect } from "vitest";
import {
  buildOnboardingChecklistViewModel,
  ONBOARDING_HONESTY_NOTE,
  ONBOARDING_INTRO,
  ONBOARDING_ROUTES,
  ONBOARDING_COMPLETED_HEADLINE,
} from "@/lib/onboardingChecklistViewModel";

const base = {
  growCount: 0,
  tentCount: 0,
  plantCount: 0,
  diaryEntryCount: 0,
  sensorReadingCount: 0,
};
const CONNECTED_TENT_ID = "00000000-0000-4000-8000-00000000000b";

describe("buildOnboardingChecklistViewModel — activation states", () => {
  it("new user with no grow → all 5 steps incomplete, checklist shown", () => {
    const vm = buildOnboardingChecklistViewModel(base);
    expect(vm.totalCount).toBe(5);
    expect(vm.completeCount).toBe(0);
    expect(vm.isFullyActivated).toBe(false);
    expect(vm.shouldShowChecklist).toBe(true);
    expect(vm.steps.every((s) => !s.complete)).toBe(true);
  });

  it("user with grow only → grow complete, tent/plant/log/snapshot incomplete", () => {
    const vm = buildOnboardingChecklistViewModel({ ...base, growCount: 1 });
    expect(vm.completeCount).toBe(1);
    expect(vm.steps.find((s) => s.key === "create_grow")?.complete).toBe(true);
    expect(vm.steps.find((s) => s.key === "add_tent")?.complete).toBe(false);
    expect(vm.steps.find((s) => s.key === "add_plant")?.complete).toBe(false);
    expect(vm.steps.find((s) => s.key === "first_log")?.complete).toBe(false);
    expect(vm.steps.find((s) => s.key === "first_sensor_snapshot")?.complete).toBe(false);
    expect(vm.shouldShowChecklist).toBe(true);
  });

  it("grow + tent + plant but no log or snapshot → both evidence steps incomplete", () => {
    const vm = buildOnboardingChecklistViewModel({
      ...base,
      growCount: 1,
      tentCount: 1,
      plantCount: 1,
    });
    expect(vm.completeCount).toBe(3);
    expect(vm.steps.find((s) => s.key === "first_log")?.complete).toBe(false);
    expect(vm.steps.find((s) => s.key === "first_sensor_snapshot")?.complete).toBe(false);
    expect(vm.shouldShowChecklist).toBe(true);
  });

  it("a diary entry establishes plant memory but does not replace sensor truth", () => {
    const vm = buildOnboardingChecklistViewModel({
      ...base,
      growCount: 1,
      tentCount: 1,
      plantCount: 1,
      diaryEntryCount: 1,
    });
    expect(vm.steps.find((s) => s.key === "first_log")?.complete).toBe(true);
    expect(vm.steps.find((s) => s.key === "first_sensor_snapshot")?.complete).toBe(false);
    expect(vm.completeCount).toBe(4);
    expect(vm.isFullyActivated).toBe(false);
    expect(vm.shouldShowChecklist).toBe(true);
  });

  it("a sensor reading establishes sensor truth but does not replace plant memory", () => {
    const vm = buildOnboardingChecklistViewModel({
      ...base,
      growCount: 1,
      tentCount: 1,
      plantCount: 1,
      sensorReadingCount: 1,
    });
    expect(vm.steps.find((s) => s.key === "first_log")?.complete).toBe(false);
    expect(vm.steps.find((s) => s.key === "first_sensor_snapshot")?.complete).toBe(true);
    expect(vm.completeCount).toBe(4);
    expect(vm.isFullyActivated).toBe(false);
  });

  it("fully activated user → checklist hidden but completed headline available", () => {
    const vm = buildOnboardingChecklistViewModel({
      growCount: 2,
      tentCount: 1,
      plantCount: 3,
      diaryEntryCount: 4,
      sensorReadingCount: 12,
    });
    expect(vm.isFullyActivated).toBe(true);
    expect(vm.shouldShowChecklist).toBe(false);
    expect(vm.completedHeadline).toBe(ONBOARDING_COMPLETED_HEADLINE);
  });

  it("relationship-aware scope ignores unrelated counts and keeps the handoff grow-scoped", () => {
    const vm = buildOnboardingChecklistViewModel({
      growCount: 9,
      tentCount: 9,
      plantCount: 9,
      diaryEntryCount: 9,
      sensorReadingCount: 0,
      connectedScope: {
        growId: "grow with spaces",
        tentId: null,
        plantId: null,
      },
      firstLogEvidenceCount: 0,
      firstLogEvidenceStatus: "ok",
    });

    expect(vm.steps.find((s) => s.key === "create_grow")?.complete).toBe(true);
    expect(vm.steps.find((s) => s.key === "add_tent")?.complete).toBe(false);
    expect(vm.steps.find((s) => s.key === "add_plant")?.complete).toBe(false);
    expect(vm.steps.find((s) => s.key === "first_log")?.complete).toBe(false);
    expect(vm.steps.find((s) => s.key === "add_tent")?.href).toBe(
      "/tents?growId=grow%20with%20spaces&intent=one_tent_activation",
    );
    expect(vm.steps.find((s) => s.key === "first_log")?.href).toBe(
      "/dashboard?growId=grow%20with%20spaces&open=quick-log",
    );
    expect(vm.steps.find((s) => s.key === "first_sensor_snapshot")?.href).toBe(
      "/tents?growId=grow%20with%20spaces&intent=one_tent_activation",
    );
  });

  it("preserves the exact connected tent through the Add snapshot handoff", () => {
    const vm = buildOnboardingChecklistViewModel({
      ...base,
      connectedScope: {
        growId: "grow-a",
        tentId: CONNECTED_TENT_ID,
        plantId: "plant-a",
      },
      firstLogEvidenceCount: 1,
      firstLogEvidenceStatus: "ok",
    });

    const snapshotStep = vm.steps.find((step) => step.key === "first_sensor_snapshot");
    expect(snapshotStep?.href).toBe(
      `/sensors?tentId=${CONNECTED_TENT_ID}&tentIntent=required#manual-reading`,
    );
    expect(snapshotStep?.href).not.toContain("growId=");
  });
});

describe("checklist links point to safe existing routes", () => {
  const vm = buildOnboardingChecklistViewModel(base);

  it("keeps the one-tent setup order: Grow → Tent → Plant → Quick Log → Sensor Snapshot", () => {
    expect(vm.steps.map((s) => s.key)).toEqual([
      "create_grow",
      "add_tent",
      "add_plant",
      "first_log",
      "first_sensor_snapshot",
    ]);
  });

  it.each([
    ["create_grow", "/grows"],
    ["add_tent", "/tents"],
    ["add_plant", "/plants"],
    ["first_log", "/dashboard?open=quick-log"],
    ["first_sensor_snapshot", "/sensors"],
  ] as const)("%s → %s", (key, expected) => {
    expect(vm.steps.find((s) => s.key === key)?.href).toBe(expected);
    expect(ONBOARDING_ROUTES[key]).toBe(expected);
  });

  it("first log step routes to Dashboard where QuickLogV2Fab opens the sheet", () => {
    const firstLog = vm.steps.find((s) => s.key === "first_log");

    expect(firstLog?.href).toBe("/dashboard?open=quick-log");
    expect(firstLog?.title).toMatch(/log/i);
  });

  it("never links to automation/device-control or admin routes", () => {
    const FORBIDDEN = ["/admin", "/leads", "/diagnostics", "/pi-ingest-status"];
    for (const s of vm.steps) {
      for (const f of FORBIDDEN) {
        expect(s.href.startsWith(f)).toBe(false);
      }
    }
  });
});

describe("checklist copy is safe", () => {
  it("intro and honesty note match the approved strings", () => {
    expect(ONBOARDING_INTRO).toBe(
      "Connect one real grow, tent, and plant. Then preserve what you did and what the room measured.",
    );
    expect(ONBOARDING_HONESTY_NOTE).toBe(
      "No fake-live data. Manual readings are welcome when clearly labeled.",
    );
  });

  it("no step copy contains forbidden fake-live or autopilot claims", () => {
    const vm = buildOnboardingChecklistViewModel(base);
    const allText = [
      vm.intro,
      vm.honestyNote,
      vm.completedHeadline,
      ...vm.steps.flatMap((s) => [s.title, s.description, s.ctaLabel]),
    ].join("\n");
    for (const re of [
      /autopilot/i,
      /AI grows for you/i,
      /guaranteed yield/i,
      /(?<!no\s+fake[- ])\blive data\b/i,
    ]) {
      expect(allText).not.toMatch(re);
    }
  });
});
