/**
 * harvestWatchViewModel — presenter helper tests.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildHarvestWatchRowViewModel,
} from "@/lib/harvestWatchViewModel";
import type { HarvestWatchInput } from "@/lib/harvestWatchRules";

const SOURCE = readFileSync(
  resolve(__dirname, "../..", "src/lib/harvestWatchViewModel.ts"),
  "utf8",
);

function input(overrides: Partial<HarvestWatchInput> = {}): HarvestWatchInput {
  return {
    plantId: "p1",
    plantLabel: "Plant A",
    phenotypeLabel: "Pheno #1",
    daysInFlower: 60,
    expectedHarvestDay: 63,
    priorGrowCount: 2,
    photoEvidenceCount: 2,
    usableDrybackWindowCount: 2,
    irrigationPlantSelectionQuality: "explicit",
    drybackConfidence: "medium",
    daysVsHistoryConfidence: "medium",
    trichome: null,
    lastPhotoAt: "2026-06-17T00:00:00.000Z",
    now: new Date("2026-06-17T12:00:00.000Z"),
    ...overrides,
  };
}

describe("safety fences", () => {
  it("contains no forbidden imports", () => {
    expect(SOURCE).not.toMatch(/from\s+["'][^"']*supabase[^"']*["']/i);
    expect(SOURCE).not.toMatch(/from\s+["']react["']/);
  });
});

describe("row view model", () => {
  it("renders gated readiness message when evidence is short", () => {
    const vm = buildHarvestWatchRowViewModel(
      input({ photoEvidenceCount: 1, usableDrybackWindowCount: 2 }),
    );
    expect(vm.readiness.score).toBeNull();
    expect(vm.readinessDisplay).toMatch(/Not enough evidence/i);
    expect(vm.trend).toBe("unknown");
  });

  it("renders readiness score with formatted display", () => {
    const vm = buildHarvestWatchRowViewModel(input());
    expect(vm.readiness.score).not.toBeNull();
    expect(vm.readinessDisplay).toMatch(/\d+ \/ 100/);
  });

  it("keeps dryback visible but muted when plant selection skipped", () => {
    const vm = buildHarvestWatchRowViewModel(
      input({ irrigationPlantSelectionQuality: "skipped" }),
    );
    expect(vm.dryback.visible).toBe(true);
    expect(vm.dryback.muted).toBe(true);
    expect(vm.dryback.label).toBe("Lower Confidence");
  });

  it("shows a low-confidence broad window when no history", () => {
    const vm = buildHarvestWatchRowViewModel(
      input({ expectedHarvestDay: null, priorGrowCount: 0 }),
    );
    expect(vm.harvestWindow.anchor).toBe("broad");
    expect(vm.harvestWindow.confidence).toBe("low");
    expect(vm.harvestWindowLabel).toMatch(/^Day \d+–\d+$/);
  });

  it("surfaces trichome insight only at high confidence", () => {
    const hidden = buildHarvestWatchRowViewModel(
      input({ trichome: { confidence: "medium" } }),
    );
    expect(hidden.trichome.visible).toBe(false);

    const shown = buildHarvestWatchRowViewModel(
      input({ trichome: { confidence: "high", insight: "Cloudy heavy" } }),
    );
    expect(shown.trichome.visible).toBe(true);
    expect(shown.trichome.insight).toBe("Cloudy heavy");
  });

  it("downgrades confidence label when photos are stale (2+ days)", () => {
    const vm = buildHarvestWatchRowViewModel(
      input({
        lastPhotoAt: "2026-06-14T12:00:00.000Z",
        drybackConfidence: "high",
        daysVsHistoryConfidence: "high",
      }),
    );
    expect(vm.photoPrompt.tone).toBe("stronger");
    expect(vm.confidenceLabel).toBe("Low");
  });

  it("is deterministic for the same input", () => {
    const a = buildHarvestWatchRowViewModel(input());
    const b = buildHarvestWatchRowViewModel(input());
    expect(a).toEqual(b);
  });

  it("handles null phenotype + missing daysInFlower without claiming high confidence", () => {
    const vm = buildHarvestWatchRowViewModel(
      input({
        phenotypeLabel: null,
        daysInFlower: null,
        expectedHarvestDay: null,
        priorGrowCount: 0,
        drybackConfidence: null,
        daysVsHistoryConfidence: null,
        photoEvidenceCount: 0,
        usableDrybackWindowCount: 0,
        lastPhotoAt: null,
      }),
    );
    expect(vm.phenotypeLabel).toBe("Unknown phenotype");
    expect(vm.daysVsHistory.delta).toBeNull();
    expect(vm.readiness.score).toBeNull();
    expect(vm.confidenceLabel).toBe("Low");
    expect(vm.lastPhotoLabel).toBe("No photos yet");
  });

  it("computes days-vs-history delta with sign-aware label", () => {
    const ahead = buildHarvestWatchRowViewModel(
      input({ daysInFlower: 70, expectedHarvestDay: 63 }),
    );
    expect(ahead.daysVsHistory.delta).toBe(7);
    expect(ahead.daysVsHistory.label).toMatch(/past historical/);

    const before = buildHarvestWatchRowViewModel(
      input({ daysInFlower: 58, expectedHarvestDay: 63 }),
    );
    expect(before.daysVsHistory.delta).toBe(-5);
    expect(before.daysVsHistory.label).toMatch(/before historical/);
  });
});
