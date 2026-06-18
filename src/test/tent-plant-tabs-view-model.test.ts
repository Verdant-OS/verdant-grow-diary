import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildTentPlantTabsViewModel,
  TENT_PLANT_TABS_ALL_COPY,
  TENT_PLANT_TABS_ALL_LABEL,
  TENT_PLANT_TABS_EMPTY_NO_PLANTS_COPY,
  TENT_PLANT_TABS_EMPTY_SELECTED_PLANT_COPY,
  TENT_PLANT_TABS_SHARED_ENV_COPY,
} from "@/lib/tentPlantTabsViewModel";

const ACTIVE = [
  { id: "p1", name: "Blue Dream", isArchived: false },
  { id: "p2", name: "Plant B", isArchived: false },
];
const ARCHIVED = [{ id: "p3", name: "Gelato Auto", isArchived: true }];

describe("buildTentPlantTabsViewModel", () => {
  it("includes an All plants tab and one tab per visible active plant", () => {
    const vm = buildTentPlantTabsViewModel({
      plants: ACTIVE,
      includeArchived: false,
      selectedPlantId: null,
    });
    expect(vm.tabs.map((t) => t.id)).toEqual([null, "p1", "p2"]);
    expect(vm.tabs[0].label).toBe(TENT_PLANT_TABS_ALL_LABEL);
  });

  it("excludes archived plants when archived is hidden", () => {
    const vm = buildTentPlantTabsViewModel({
      plants: [...ACTIVE, ...ARCHIVED],
      includeArchived: false,
      selectedPlantId: null,
    });
    expect(vm.tabs.map((t) => t.id)).toEqual([null, "p1", "p2"]);
  });

  it("includes and labels archived plants when archived is shown", () => {
    const vm = buildTentPlantTabsViewModel({
      plants: [...ACTIVE, ...ARCHIVED],
      includeArchived: true,
      selectedPlantId: null,
    });
    expect(vm.tabs.map((t) => t.id)).toEqual([null, "p1", "p2", "p3"]);
    const arc = vm.tabs.find((t) => t.id === "p3")!;
    expect(arc.isArchived).toBe(true);
    expect(arc.ariaLabel).toBe("Gelato Auto (archived)");
  });

  it("defaults to All plants when selectedPlantId is null", () => {
    const vm = buildTentPlantTabsViewModel({
      plants: ACTIVE,
      includeArchived: false,
      selectedPlantId: null,
    });
    expect(vm.tabs[0].isSelected).toBe(true);
    expect(vm.selectedPlantId).toBeNull();
    expect(vm.selectedPlantCopy).toBeNull();
    expect(vm.allPlantsCopy).toBe(TENT_PLANT_TABS_ALL_COPY);
    expect(vm.filteredPlantIds).toEqual(["p1", "p2"]);
  });

  it("filters to a single plant id when one is selected", () => {
    const vm = buildTentPlantTabsViewModel({
      plants: ACTIVE,
      includeArchived: false,
      selectedPlantId: "p2",
    });
    expect(vm.selectedPlantId).toBe("p2");
    expect(vm.selectedPlantName).toBe("Plant B");
    expect(vm.selectedPlantCopy).toBe(
      "Viewing plant-specific activity for Plant B.",
    );
    expect(vm.filteredPlantIds).toEqual(["p2"]);
  });

  it("resets selection to All when an archived plant becomes hidden", () => {
    const vm = buildTentPlantTabsViewModel({
      plants: [...ACTIVE, ...ARCHIVED],
      includeArchived: false,
      selectedPlantId: "p3",
    });
    expect(vm.selectedPlantId).toBeNull();
    expect(vm.selectionWasReset).toBe(true);
    expect(vm.selectionResetReason).toBe("archived-hidden");
    expect(vm.tabs[0].isSelected).toBe(true);
  });

  it("resets selection when the selected id is not in the tent at all", () => {
    const vm = buildTentPlantTabsViewModel({
      plants: ACTIVE,
      includeArchived: false,
      selectedPlantId: "ghost",
    });
    expect(vm.selectedPlantId).toBeNull();
    expect(vm.selectionWasReset).toBe(true);
    expect(vm.selectionResetReason).toBe("missing");
  });

  it("exposes shared environment + empty copies", () => {
    const vm = buildTentPlantTabsViewModel({
      plants: [],
      includeArchived: false,
      selectedPlantId: null,
    });
    expect(vm.sharedEnvironmentReminderCopy).toBe(TENT_PLANT_TABS_SHARED_ENV_COPY);
    expect(vm.emptyNoPlantsCopy).toBe(TENT_PLANT_TABS_EMPTY_NO_PLANTS_COPY);
    expect(vm.emptySelectedPlantActivityCopy).toBe(
      TENT_PLANT_TABS_EMPTY_SELECTED_PLANT_COPY,
    );
    expect(vm.tabs).toHaveLength(1);
    expect(vm.tabs[0].id).toBeNull();
    expect(vm.filteredPlantIds).toEqual([]);
  });

  it("is deterministic for the same input", () => {
    const a = buildTentPlantTabsViewModel({
      plants: ACTIVE,
      includeArchived: false,
      selectedPlantId: "p1",
    });
    const b = buildTentPlantTabsViewModel({
      plants: ACTIVE,
      includeArchived: false,
      selectedPlantId: "p1",
    });
    expect(a).toEqual(b);
  });

  it("treats blank plant names as 'Unnamed plant'", () => {
    const vm = buildTentPlantTabsViewModel({
      plants: [{ id: "p9", name: "   ", isArchived: false }],
      includeArchived: false,
      selectedPlantId: "p9",
    });
    expect(vm.tabs[1].label).toBe("Unnamed plant");
    expect(vm.selectedPlantCopy).toBe(
      "Viewing plant-specific activity for Unnamed plant.",
    );
  });
});

describe("tentPlantTabsViewModel static safety", () => {
  const path = resolve(__dirname, "../lib/tentPlantTabsViewModel.ts");
  const raw = readFileSync(path, "utf8");
  const content = raw
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

  it("does not import Supabase or write helpers", () => {
    expect(content).not.toMatch(/from\s+["']@\/integrations\/supabase/);
    expect(content).not.toMatch(/supabase\.from\(/);
  });
  it("does not import AI/model/alerts/action-queue/device-control surfaces", () => {
    expect(content).not.toMatch(/ai-?doctor|aiCoach|model-?call/i);
    expect(content).not.toMatch(/from\s+["'][^"']*\/alerts?/);
    expect(content).not.toMatch(/actionQueue|action_queue/);
    expect(content).not.toMatch(/deviceControl|device_control/);
  });
});
