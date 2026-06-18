import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildTentPlantActivityPanelsViewModel,
  TENT_PLANT_ACTIVITY_HARVEST_WATCH_FALLBACK_COPY,
  TENT_PLANT_ACTIVITY_HARVEST_WATCH_CAUTION_COPY,
  TENT_PLANT_ACTIVITY_HARVEST_WATCH_HELP_TEXT,
  TENT_PLANT_ACTIVITY_NO_DIARY_COPY,
  TENT_PLANT_ACTIVITY_NO_PHOTOS_COPY,
  TENT_PLANT_ACTIVITY_EMPTY_NO_PLANTS_COPY,
  TENT_PLANT_ACTIVITY_SHARED_ENV_COPY,
} from "@/lib/tentPlantActivityPanelsViewModel";

const PLANTS = [
  { id: "p1", name: "Blue Dream", strain: "Hybrid", stage: "veg", isArchived: false },
  { id: "p2", name: "Plant B", strain: null, stage: "flower", isArchived: false },
  { id: "p3", name: "Gelato Auto", strain: null, stage: null, isArchived: true },
];

const ACTIVITY = {
  p1: {
    latestLogAt: "2026-06-10T12:00:00Z",
    latestLogSummary: "Watered 0.5L",
    hasRecentPhoto: true,
    harvestWatchPublicState: "watch_window",
  },
  p2: {
    latestLogAt: null,
    hasRecentPhoto: false,
    harvestWatchPublicState: null,
  },
  p3: {
    latestLogAt: "2026-05-01T00:00:00Z",
    hasRecentPhoto: false,
    harvestWatchPublicState: "ready_for_manual_review",
  },
};

const BASE = {
  plants: PLANTS,
  activityByPlantId: ACTIVITY,
  includeArchived: false,
  selectedPlantId: null,
  tentId: "t1",
  tentName: "Tent A",
  growId: "g1",
};

describe("buildTentPlantActivityPanelsViewModel", () => {
  it("All plants mode renders one panel per visible (non-archived) plant", () => {
    const vm = buildTentPlantActivityPanelsViewModel(BASE);
    expect(vm.panels.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(vm.sharedEnvironmentReminderCopy).toBe(TENT_PLANT_ACTIVITY_SHARED_ENV_COPY);
  });

  it("Selected plant mode renders only that plant's panel", () => {
    const vm = buildTentPlantActivityPanelsViewModel({
      ...BASE,
      selectedPlantId: "p2",
    });
    expect(vm.panels.map((p) => p.id)).toEqual(["p2"]);
    expect(vm.selectedPlantId).toBe("p2");
  });

  it("Archived hidden excludes archived plant panels", () => {
    const vm = buildTentPlantActivityPanelsViewModel(BASE);
    expect(vm.panels.find((p) => p.id === "p3")).toBeUndefined();
  });

  it("Archived shown includes archived plant panels (with archived flag)", () => {
    const vm = buildTentPlantActivityPanelsViewModel({
      ...BASE,
      includeArchived: true,
    });
    const arc = vm.panels.find((p) => p.id === "p3")!;
    expect(arc).toBeDefined();
    expect(arc.isArchived).toBe(true);
  });

  it("falls back to All plants when selected archived plant is hidden", () => {
    const vm = buildTentPlantActivityPanelsViewModel({
      ...BASE,
      selectedPlantId: "p3",
    });
    expect(vm.selectedPlantId).toBeNull();
    expect(vm.panels.map((p) => p.id)).toEqual(["p1", "p2"]);
  });

  it("latest diary date + summary surface on the correct plant only", () => {
    const vm = buildTentPlantActivityPanelsViewModel(BASE);
    const p1 = vm.panels.find((p) => p.id === "p1")!;
    expect(p1.latestLogAt).toBe(ACTIVITY.p1.latestLogAt);
    expect(p1.latestLogDateLabel).toBeTruthy();
    expect(p1.latestLogSummary).toBe("Watered 0.5L");
    expect(p1.diaryEmptyCopy).toBeNull();
    const p2 = vm.panels.find((p) => p.id === "p2")!;
    expect(p2.latestLogAt).toBeNull();
    expect(p2.diaryEmptyCopy).toBe(TENT_PLANT_ACTIVITY_NO_DIARY_COPY);
  });

  it("photo indicator/empty state is per plant", () => {
    const vm = buildTentPlantActivityPanelsViewModel(BASE);
    const p1 = vm.panels.find((p) => p.id === "p1")!;
    const p2 = vm.panels.find((p) => p.id === "p2")!;
    expect(p1.hasRecentPhoto).toBe(true);
    expect(p1.photoEmptyCopy).toBeNull();
    expect(p2.hasRecentPhoto).toBe(false);
    expect(p2.photoEmptyCopy).toBe(TENT_PLANT_ACTIVITY_NO_PHOTOS_COPY);
  });

  it("Harvest Watch public state renders when available; fallback otherwise", () => {
    const vm = buildTentPlantActivityPanelsViewModel(BASE);
    const p1 = vm.panels.find((p) => p.id === "p1")!;
    const p2 = vm.panels.find((p) => p.id === "p2")!;
    expect(p1.harvestWatch.state).toBe("watch_window");
    expect(p1.harvestWatch.isFallback).toBe(false);
    expect(p1.harvestWatch.copy).toMatch(/observation window/i);
    expect(p2.harvestWatch.state).toBeNull();
    expect(p2.harvestWatch.isFallback).toBe(true);
    expect(p2.harvestWatch.copy).toBe(TENT_PLANT_ACTIVITY_HARVEST_WATCH_FALLBACK_COPY);
  });

  it("Unknown Harvest Watch states fall back safely", () => {
    const vm = buildTentPlantActivityPanelsViewModel({
      ...BASE,
      activityByPlantId: {
        ...ACTIVITY,
        p1: { ...ACTIVITY.p1, harvestWatchPublicState: "made_up_state" },
      },
    });
    const p1 = vm.panels.find((p) => p.id === "p1")!;
    expect(p1.harvestWatch.isFallback).toBe(true);
  });

  it("Add Quick Log prefill carries the full plant+tent+grow context", () => {
    const vm = buildTentPlantActivityPanelsViewModel(BASE);
    const p1 = vm.panels.find((p) => p.id === "p1")!;
    expect(p1.quickLogPrefill).toEqual({
      plantId: "p1",
      plantName: "Blue Dream",
      growId: "g1",
      tentId: "t1",
      tentName: "Tent A",
      eventType: "observation",
      suggestSnapshot: true,
    });
    expect(p1.quickLogDisabled).toBe(false);
    expect(p1.quickLogCtaAccessibleLabel).toBe("Add Quick Log for Blue Dream");
  });

  it("Add Quick Log is disabled when tent/grow context is missing", () => {
    const vm = buildTentPlantActivityPanelsViewModel({
      ...BASE,
      tentId: null,
      growId: null,
    });
    const p1 = vm.panels.find((p) => p.id === "p1")!;
    expect(p1.quickLogPrefill).toBeNull();
    expect(p1.quickLogDisabled).toBe(true);
  });

  it("Diary/photos links carry accessible labels including plant name", () => {
    const vm = buildTentPlantActivityPanelsViewModel(BASE);
    const p1 = vm.panels.find((p) => p.id === "p1")!;
    expect(p1.diaryHref).toBe("/plants/p1#plant-relative-timeline");
    expect(p1.diaryAccessibleLabel).toBe("Open Blue Dream diary on Plant Detail");
    expect(p1.photosHref).toBe("/plants/p1#plant-photos");
    expect(p1.photosAccessibleLabel).toBe("Open Blue Dream photos on Plant Detail");
    expect(p1.photosAnchorBlocked).toBe(false);
  });

  it("Reports photos anchor blocked when override says it is unavailable", () => {
    const vm = buildTentPlantActivityPanelsViewModel({
      ...BASE,
      photosAnchorAvailable: false,
    });
    const p1 = vm.panels.find((p) => p.id === "p1")!;
    expect(p1.photosHref).toBe("/plants/p1");
    expect(p1.photosAnchorBlocked).toBe(true);
  });

  it("Empty copy when no plants in the tent", () => {
    const vm = buildTentPlantActivityPanelsViewModel({
      ...BASE,
      plants: [],
    });
    expect(vm.panels).toEqual([]);
    expect(vm.emptyCopy).toBe(TENT_PLANT_ACTIVITY_EMPTY_NO_PLANTS_COPY);
  });

  it("Activity data does not leak between plants", () => {
    const vm = buildTentPlantActivityPanelsViewModel({
      ...BASE,
      activityByPlantId: {
        p1: {
          latestLogAt: "2026-06-10T12:00:00Z",
          latestLogSummary: "p1 only",
          hasRecentPhoto: true,
          harvestWatchPublicState: "watch_window",
        },
      },
    });
    const p2 = vm.panels.find((p) => p.id === "p2")!;
    expect(p2.latestLogAt).toBeNull();
    expect(p2.latestLogSummary).toBeNull();
    expect(p2.hasRecentPhoto).toBe(false);
    expect(p2.harvestWatch.state).toBeNull();
  });

  it("blank plant name falls back to 'Unnamed plant' for CTA accessible label", () => {
    const vm = buildTentPlantActivityPanelsViewModel({
      ...BASE,
      plants: [{ id: "px", name: "  ", isArchived: false }],
      activityByPlantId: {},
    });
    expect(vm.panels[0].quickLogCtaAccessibleLabel).toBe(
      "Add Quick Log for Unnamed plant",
    );
  });
});

describe("buildTentPlantActivityPanelsViewModel — Harvest Watch help text", () => {
  const STATES = [
    "not_enough_evidence",
    "too_early_to_call",
    "watch_window",
    "ready_for_manual_review",
    "past_expected_window",
    "unknown",
  ] as const;

  for (const state of STATES) {
    it(`emits help text for "${state}"`, () => {
      const vm = buildTentPlantActivityPanelsViewModel({
        plants: [{ id: "p1", name: "P", isArchived: false }],
        activityByPlantId: { p1: { harvestWatchPublicState: state } },
        includeArchived: false,
        selectedPlantId: null,
        tentId: "t1",
        tentName: "T",
        growId: "g1",
      });
      const p1 = vm.panels[0];
      expect(p1.harvestWatch.helpText).toBe(
        TENT_PLANT_ACTIVITY_HARVEST_WATCH_HELP_TEXT[state],
      );
      expect(p1.harvestWatch.cautionText).toBe(
        TENT_PLANT_ACTIVITY_HARVEST_WATCH_CAUTION_COPY,
      );
      expect(p1.harvestWatch.cautionText).toMatch(/evidence-only/i);
    });
  }

  it("emits fallback help text for null/unknown states", () => {
    const vm = buildTentPlantActivityPanelsViewModel({
      plants: [{ id: "p1", name: "P", isArchived: false }],
      activityByPlantId: { p1: { harvestWatchPublicState: null } },
      includeArchived: false,
      selectedPlantId: null,
      tentId: "t1",
      tentName: "T",
      growId: "g1",
    });
    const p1 = vm.panels[0];
    expect(p1.harvestWatch.helpText).toBe(
      TENT_PLANT_ACTIVITY_HARVEST_WATCH_HELP_TEXT.unknown,
    );
    expect(p1.harvestWatch.copy).toBe(
      TENT_PLANT_ACTIVITY_HARVEST_WATCH_FALLBACK_COPY,
    );
  });

  it("help text avoids forbidden harvest instruction language", () => {
    const FORBIDDEN = [
      /harvest now/i,
      /ready to harvest/i,
      /\bchop\b/i,
      /\bflush\b/i,
      /dark period/i,
      /fix immediately/i,
    ];
    for (const state of Object.keys(TENT_PLANT_ACTIVITY_HARVEST_WATCH_HELP_TEXT)) {
      const text = TENT_PLANT_ACTIVITY_HARVEST_WATCH_HELP_TEXT[state];
      for (const re of FORBIDDEN) expect(text).not.toMatch(re);
    }
  });
});

describe("tentPlantActivityPanelsViewModel forbidden copy + static safety", () => {
  const vmPath = resolve(__dirname, "../lib/tentPlantActivityPanelsViewModel.ts");
  const cmpPath = resolve(__dirname, "../components/TentPlantActivityPanels.tsx");
  function stripComments(raw: string) {
    return raw
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  }
  const vmContent = stripComments(readFileSync(vmPath, "utf8"));
  const cmpContent = stripComments(readFileSync(cmpPath, "utf8"));

  const FORBIDDEN = [
    /harvest now/i,
    /ready to harvest/i,
    /\boptimal\b/i,
    /guaranteed/i,
    /\bdone\b/i,
    /\bchop\b/i,
    /\bflush\b/i,
    /dark period/i,
    /fix immediately/i,
    /plant is unhealthy/i,
  ];

  it("view-model never embeds forbidden harvest instruction copy", () => {
    for (const re of FORBIDDEN) expect(vmContent).not.toMatch(re);
  });
  it("component never embeds forbidden harvest instruction copy", () => {
    for (const re of FORBIDDEN) expect(cmpContent).not.toMatch(re);
  });

  it("view-model does not import Supabase / sensor_readings / writes", () => {
    expect(vmContent).not.toMatch(/from\s+["']@\/integrations\/supabase/);
    expect(vmContent).not.toMatch(/supabase\.from\(/);
    expect(vmContent).not.toMatch(/sensor_readings/);
  });
  it("view-model does not import AI/alerts/action-queue/device-control", () => {
    expect(vmContent).not.toMatch(/ai-?doctor|aiCoach|model-?call/i);
    expect(vmContent).not.toMatch(/from\s+["'][^"']*\/alerts?/);
    expect(vmContent).not.toMatch(/actionQueue|action_queue/);
    expect(vmContent).not.toMatch(/deviceControl|device_control/);
  });
  it("component does not import Supabase / sensor_readings / writes", () => {
    expect(cmpContent).not.toMatch(/from\s+["']@\/integrations\/supabase/);
    expect(cmpContent).not.toMatch(/supabase\.from\(/);
    expect(cmpContent).not.toMatch(/sensor_readings/);
  });
  it("component does not import AI/alerts/action-queue/device-control", () => {
    expect(cmpContent).not.toMatch(/ai-?doctor|aiCoach|model-?call/i);
    expect(cmpContent).not.toMatch(/from\s+["'][^"']*\/alerts?/);
    expect(cmpContent).not.toMatch(/actionQueue|action_queue/);
    expect(cmpContent).not.toMatch(/deviceControl|device_control/);
  });
});
