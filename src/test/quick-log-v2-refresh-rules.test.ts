/**
 * quickLogV2RefreshRules — pure mapping tests.
 *
 * Verifies that the refresh rule:
 *  - always invalidates broad memory keys
 *  - adds plant-specific keys for plant targets
 *  - never invents default/first-plant or default/first-tent scope
 *  - uses the resolved targetId, not a placeholder
 */
import { describe, it, expect } from "vitest";
import {
  buildQuickLogV2RefreshQueryKeys,
  type QuickLogV2RefreshScope,
} from "@/lib/quickLogV2RefreshRules";

function flatten(keys: ReadonlyArray<ReadonlyArray<unknown>>): string[] {
  return keys.map((k) => JSON.stringify(k));
}

describe("buildQuickLogV2RefreshQueryKeys", () => {
  it("always invalidates the broad grouped/timeline memory keys", () => {
    const scope: QuickLogV2RefreshScope = {
      targetType: "tent",
      targetId: "tent-1",
      tentId: "tent-1",
    };
    const out = flatten(buildQuickLogV2RefreshQueryKeys(scope));
    expect(out).toContain(JSON.stringify(["quick_log_grouped_timeline"]));
    expect(out).toContain(JSON.stringify(["timeline_memory"]));
    expect(out).toContain(JSON.stringify(["manual_snapshot_timeline_cards"]));
    expect(out).toContain(JSON.stringify(["diary_entries"]));
    expect(out).toContain(JSON.stringify(["grow_events"]));
    expect(out).toContain(JSON.stringify(["timeline"]));
  });

  it("adds plant-specific keys for plant targets, using the selected plant id", () => {
    const scope: QuickLogV2RefreshScope = {
      targetType: "plant",
      targetId: "plant-42",
      tentId: "tent-7",
    };
    const out = flatten(buildQuickLogV2RefreshQueryKeys(scope));
    expect(out).toContain(JSON.stringify(["plant_recent_activity", "plant-42"]));
    expect(out).toContain(JSON.stringify(["plant_manual_sensor_history", "plant-42"]));
    expect(out).toContain(JSON.stringify(["plant_manual_sensor_logs", "plant-42"]));
  });

  it("does NOT add plant-specific keys for tent targets", () => {
    const scope: QuickLogV2RefreshScope = {
      targetType: "tent",
      targetId: "tent-1",
      tentId: "tent-1",
    };
    const out = flatten(buildQuickLogV2RefreshQueryKeys(scope));
    expect(out.some((s) => s.startsWith('["plant_recent_activity"'))).toBe(false);
    expect(out.some((s) => s.startsWith('["plant_manual_sensor_history"'))).toBe(false);
    expect(out.some((s) => s.startsWith('["plant_manual_sensor_logs"'))).toBe(false);
  });

  it("derives plant scope from the resolved targetId, not a first/default plant", () => {
    const a = flatten(
      buildQuickLogV2RefreshQueryKeys({
        targetType: "plant",
        targetId: "plant-A",
        tentId: "tent-1",
      }),
    );
    const b = flatten(
      buildQuickLogV2RefreshQueryKeys({
        targetType: "plant",
        targetId: "plant-B",
        tentId: "tent-1",
      }),
    );
    expect(a).not.toEqual(b);
    expect(a).toContain(JSON.stringify(["plant_recent_activity", "plant-A"]));
    expect(b).toContain(JSON.stringify(["plant_recent_activity", "plant-B"]));
  });

  it("falls back to broad keys only when scope is malformed", () => {
    const out = flatten(
      buildQuickLogV2RefreshQueryKeys({
        // @ts-expect-error simulating defensive use
        targetType: "garbage",
        targetId: "",
        tentId: null,
      }),
    );
    expect(out).toContain(JSON.stringify(["quick_log_grouped_timeline"]));
    expect(out.some((s) => s.includes("plant_recent_activity"))).toBe(false);
  });
});
