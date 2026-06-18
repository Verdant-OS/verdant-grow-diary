/**
 * Pure tests for buildDiaryRemovalInvalidationKeys.
 */
import { describe, it, expect } from "vitest";
import { buildDiaryRemovalInvalidationKeys } from "@/lib/diaryEntryRemovalInvalidationRules";

describe("buildDiaryRemovalInvalidationKeys", () => {
  it("includes diary_entries, plant_recent_activity, tent_plant_roster_activity, and timeline caches", () => {
    const keys = buildDiaryRemovalInvalidationKeys({
      entryId: "e1",
      plantId: "p1",
      tentId: "t1",
      growId: "g1",
      isPhotoLog: false,
    });
    const joined = keys.map((k) => JSON.stringify(k));
    expect(joined).toContain(JSON.stringify(["diary_entries"]));
    expect(joined).toContain(JSON.stringify(["plant_recent_activity", "p1"]));
    expect(joined).toContain(JSON.stringify(["tent_plant_roster_activity", "p1"]));
    expect(joined).toContain(JSON.stringify(["quick_log_grouped_timeline"]));
    expect(joined).toContain(JSON.stringify(["manual_snapshot_timeline_cards"]));
    expect(joined).toContain(JSON.stringify(["timeline_memory"]));
  });

  it("scopes plant-keyed invalidation to the source plant id only", () => {
    const keys = buildDiaryRemovalInvalidationKeys({
      entryId: "e1",
      plantId: "plant-A",
    });
    const joined = keys.map((k) => JSON.stringify(k));
    expect(joined).toContain(JSON.stringify(["plant_recent_activity", "plant-A"]));
    expect(joined).toContain(JSON.stringify(["tent_plant_roster_activity", "plant-A"]));
    // Does not invalidate unrelated plants explicitly.
    expect(joined.some((k) => k.includes("plant-B"))).toBe(false);
  });

  it("falls back to prefix-only keys when plantId is missing", () => {
    const keys = buildDiaryRemovalInvalidationKeys({ entryId: "e1" });
    const joined = keys.map((k) => JSON.stringify(k));
    expect(joined).toContain(JSON.stringify(["plant_recent_activity"]));
    expect(joined).toContain(JSON.stringify(["tent_plant_roster_activity"]));
  });

  it("treats blank/whitespace plantId as missing", () => {
    const keys = buildDiaryRemovalInvalidationKeys({ entryId: "e1", plantId: "   " });
    const joined = keys.map((k) => JSON.stringify(k));
    expect(joined).toContain(JSON.stringify(["plant_recent_activity"]));
  });

  it("is deterministic across calls", () => {
    const a = buildDiaryRemovalInvalidationKeys({ entryId: "e1", plantId: "p1" });
    const b = buildDiaryRemovalInvalidationKeys({ entryId: "e1", plantId: "p1" });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
