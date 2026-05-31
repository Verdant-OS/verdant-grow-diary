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

describe("buildOnboardingChecklistViewModel — activation states", () => {
  it("new user with no grow → all 4 steps incomplete, checklist shown", () => {
    const vm = buildOnboardingChecklistViewModel(base);
    expect(vm.totalCount).toBe(4);
    expect(vm.completeCount).toBe(0);
    expect(vm.isFullyActivated).toBe(false);
    expect(vm.shouldShowChecklist).toBe(true);
    expect(vm.steps.every((s) => !s.complete)).toBe(true);
  });

  it("user with grow only → grow complete, tent/plant/log incomplete", () => {
    const vm = buildOnboardingChecklistViewModel({ ...base, growCount: 1 });
    expect(vm.completeCount).toBe(1);
    expect(vm.steps.find((s) => s.key === "create_grow")?.complete).toBe(true);
    expect(vm.steps.find((s) => s.key === "add_tent")?.complete).toBe(false);
    expect(vm.steps.find((s) => s.key === "add_plant")?.complete).toBe(false);
    expect(vm.steps.find((s) => s.key === "first_log")?.complete).toBe(false);
    expect(vm.shouldShowChecklist).toBe(true);
  });

  it("grow + tent + plant but no log/sensor → only final step incomplete", () => {
    const vm = buildOnboardingChecklistViewModel({
      ...base,
      growCount: 1,
      tentCount: 1,
      plantCount: 1,
    });
    expect(vm.completeCount).toBe(3);
    expect(vm.steps.find((s) => s.key === "first_log")?.complete).toBe(false);
    expect(vm.shouldShowChecklist).toBe(true);
  });

  it("first_log completes via diary entry alone", () => {
    const vm = buildOnboardingChecklistViewModel({
      ...base,
      growCount: 1,
      tentCount: 1,
      plantCount: 1,
      diaryEntryCount: 1,
    });
    expect(vm.steps.find((s) => s.key === "first_log")?.complete).toBe(true);
    expect(vm.isFullyActivated).toBe(true);
    expect(vm.shouldShowChecklist).toBe(false);
  });

  it("first_log completes via sensor reading alone", () => {
    const vm = buildOnboardingChecklistViewModel({
      ...base,
      growCount: 1,
      tentCount: 1,
      plantCount: 1,
      sensorReadingCount: 1,
    });
    expect(vm.steps.find((s) => s.key === "first_log")?.complete).toBe(true);
    expect(vm.isFullyActivated).toBe(true);
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
});

describe("checklist links point to safe existing routes", () => {
  const vm = buildOnboardingChecklistViewModel(base);
  it.each([
    ["create_grow", "/grows"],
    ["add_tent", "/tents"],
    ["add_plant", "/plants"],
    ["first_log", "/"],
  ] as const)("%s → %s", (key, expected) => {
    expect(vm.steps.find((s) => s.key === key)?.href).toBe(expected);
    expect(ONBOARDING_ROUTES[key]).toBe(expected);
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
      "Start with one real grow. Verdant gets smarter as your plant history builds.",
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
