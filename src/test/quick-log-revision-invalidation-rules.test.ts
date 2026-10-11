/**
 * Pure tests for buildQuickLogRevisionInvalidationKeys.
 *
 * A correction/retraction must refresh the same read surface as diary removal
 * plus revision ledger, retracted-entry disclosure, sensor history, and AI
 * readiness caches — stale rows there mislead growers after a retract.
 */
import { describe, expect, it } from "vitest";
import {
  QUICKLOG_REVISION_INVALIDATION_KEY_CONTAINS,
  buildQuickLogRevisionInvalidationKeys,
} from "@/lib/quickLogRevisionInvalidationRules";
import { buildDiaryRemovalInvalidationKeys } from "@/lib/diaryEntryRemovalInvalidationRules";

describe("buildQuickLogRevisionInvalidationKeys", () => {
  const scopedMeta = {
    growEventId: "event-1",
    diaryEntryIds: ["diary-1", "diary-2"],
    plantId: "plant-1",
    tentId: "tent-1",
    growId: "grow-1",
  };

  it("extends diary-removal keys with revision, sensor, and AI readiness families", () => {
    const keys = buildQuickLogRevisionInvalidationKeys(scopedMeta);
    const joined = keys.map((k) => JSON.stringify(k));

    const removalKeys = buildDiaryRemovalInvalidationKeys({
      entryId: "diary-1",
      plantId: "plant-1",
      tentId: "tent-1",
      growId: "grow-1",
    }).map((k) => JSON.stringify(k));

    for (const removalKey of removalKeys) {
      expect(joined).toContain(removalKey);
    }

    expect(joined).toContain(JSON.stringify(["quicklog_entry_revisions"]));
    expect(joined).toContain(JSON.stringify(["quicklog_retracted_entries"]));
    expect(joined).toContain(JSON.stringify(["plant_manual_sensor_history"]));
    expect(joined).toContain(JSON.stringify(["plant_manual_sensor_logs"]));
    expect(joined).toContain(JSON.stringify(["ai_doctor_context"]));
    expect(joined).toContain(JSON.stringify(["ai_doctor_readiness"]));
    expect(joined).toContain(JSON.stringify(["pheno_evidence_receipts"]));
    expect(joined).toContain(JSON.stringify(["dashboard_memory"]));
    expect(joined).toContain(JSON.stringify(["dashboard_recent_activity"]));
    expect(joined).toContain(JSON.stringify(["tent_recent_activity"]));
    expect(joined).toContain(JSON.stringify(["grow_events"]));
  });

  it("delegates removal invalidation using diaryEntryIds[0] when both ids are present", () => {
    const keys = buildQuickLogRevisionInvalidationKeys({
      growEventId: "event-only",
      diaryEntryIds: ["diary-primary"],
      plantId: "plant-1",
    });
    const removalFromDiary = buildDiaryRemovalInvalidationKeys({
      entryId: "diary-primary",
      plantId: "plant-1",
    });

    expect(JSON.stringify(keys.slice(0, removalFromDiary.length))).toBe(
      JSON.stringify(removalFromDiary),
    );
  });

  it("falls back to growEventId when diaryEntryIds is empty", () => {
    const keys = buildQuickLogRevisionInvalidationKeys({
      growEventId: "event-fallback",
      diaryEntryIds: [],
      plantId: "plant-1",
    });
    const removalKeys = buildDiaryRemovalInvalidationKeys({
      entryId: "event-fallback",
      plantId: "plant-1",
    });

    expect(JSON.stringify(keys.slice(0, removalKeys.length))).toBe(JSON.stringify(removalKeys));
  });

  it("uses prefix-only plant keys when plantId is blank", () => {
    const keys = buildQuickLogRevisionInvalidationKeys({
      growEventId: "event-1",
      plantId: "   ",
    });
    const joined = keys.map((k) => JSON.stringify(k));
    expect(joined).toContain(JSON.stringify(["plant_recent_activity"]));
    expect(joined.some((k) => k.includes("plant-1"))).toBe(false);
  });

  it("is deterministic across calls", () => {
    const a = buildQuickLogRevisionInvalidationKeys(scopedMeta);
    const b = buildQuickLogRevisionInvalidationKeys(scopedMeta);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("QUICKLOG_REVISION_INVALIDATION_KEY_CONTAINS", () => {
  it("includes root_zone_observations for owner-scoped predicate invalidation", () => {
    expect(QUICKLOG_REVISION_INVALIDATION_KEY_CONTAINS).toContain("root_zone_observations");
  });
});
