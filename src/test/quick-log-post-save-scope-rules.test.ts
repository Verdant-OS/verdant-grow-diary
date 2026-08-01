import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  growIdFromEntryCreatedDetail,
  shouldSyncActiveGrowAfterSave,
  timelineHrefAfterQuickLogSave,
  buildEntryCreatedScopeDetail,
} from "@/lib/quickLogPostSaveScopeRules";

const ROOT = resolve(__dirname, "../..");

describe("quickLogPostSaveScopeRules", () => {
  it("extracts growId from event detail", () => {
    expect(growIdFromEntryCreatedDetail({ growId: " g1 " })).toBe("g1");
    expect(growIdFromEntryCreatedDetail({ growId: "" })).toBeNull();
    expect(growIdFromEntryCreatedDetail(null)).toBeNull();
  });

  it("syncs active grow only when saved grow differs", () => {
    expect(shouldSyncActiveGrowAfterSave({ savedGrowId: "b", currentActiveGrowId: "a" })).toBe(
      true,
    );
    expect(shouldSyncActiveGrowAfterSave({ savedGrowId: "a", currentActiveGrowId: "a" })).toBe(
      false,
    );
    expect(shouldSyncActiveGrowAfterSave({ savedGrowId: null, currentActiveGrowId: "a" })).toBe(
      false,
    );
  });

  it("builds grow-scoped timeline href", () => {
    expect(timelineHrefAfterQuickLogSave("grow-1")).toBe("/logs?growId=grow-1");
    expect(timelineHrefAfterQuickLogSave(null)).toBeNull();
  });

  it("builds scoped entry-created detail", () => {
    const d = buildEntryCreatedScopeDetail({
      growId: "g1",
      plantId: "p1",
      tentId: "t1",
      createdAt: "2026-01-01T00:00:00.000Z",
      source: "plant_quick_log",
    });
    expect(d.growId).toBe("g1");
    expect(d.plantId).toBe("p1");
    expect(d.source).toBe("plant_quick_log");
  });
});

describe("post-save scope wiring", () => {
  const GROWS = readFileSync(resolve(ROOT, "src/store/grows.tsx"), "utf8");
  const PLANT_QL = readFileSync(resolve(ROOT, "src/components/PlantQuickLog.tsx"), "utf8");
  const QL = readFileSync(resolve(ROOT, "src/components/QuickLog.tsx"), "utf8");
  const V2 = readFileSync(resolve(ROOT, "src/components/QuickLogV2Sheet.tsx"), "utf8");

  it("GrowsProvider listens for entry-created and pins active grow", () => {
    expect(GROWS).toMatch(/ENTRY_CREATED_EVENT|verdant:entry-created/);
    expect(GROWS).toMatch(/growIdFromEntryCreatedDetail/);
    expect(GROWS).toMatch(/setActiveGrowId\(growId\)/);
  });

  it("PlantQuickLog dispatches growId and offers View timeline", () => {
    expect(PLANT_QL).toMatch(/buildEntryCreatedScopeDetail/);
    expect(PLANT_QL).toMatch(/setActiveGrowId\(growId\)/);
    expect(PLANT_QL).toMatch(/View timeline/);
    expect(PLANT_QL).toMatch(/timelineHrefAfterQuickLogSave/);
  });

  it("legacy QuickLog includes growId on entry-created", () => {
    expect(QL).toMatch(/growId:\s*activeGrowId/);
  });

  it("QuickLog V2 dispatch includes growId", () => {
    expect(V2).toMatch(/growId:\s*resolved\.growId/);
  });
});
