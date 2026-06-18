/**
 * Tests for quickLogDraftPreviewViewModel — pure helper.
 */
import { describe, it, expect } from "vitest";
import {
  buildQuickLogDraftPreview,
  QUICK_LOG_DRAFT_PHOTO_BLOCKED_COPY,
  QUICK_LOG_DRAFT_DEMO_SNAPSHOT_COPY,
} from "@/lib/quickLogDraftPreviewViewModel";

describe("buildQuickLogDraftPreview", () => {
  it("returns show=false when no prefill is provided", () => {
    expect(buildQuickLogDraftPreview({}).show).toBe(false);
    expect(buildQuickLogDraftPreview({ prefill: null }).show).toBe(false);
  });

  it("renders event type label and note summary from a hyperlog prefill", () => {
    const vm = buildQuickLogDraftPreview({
      prefill: {
        eventType: "watering",
        note: "Watered 250 ml · runoff clear",
        source: "hyperlog",
      },
    });
    expect(vm.show).toBe(true);
    expect(vm.eventTypeLabel).toBe("Watering");
    expect(vm.noteSummary).toBe("Watered 250 ml · runoff clear");
    expect(vm.sourceLabel).toBe("From HyperLog draft (manual)");
    expect(vm.isHyperLog).toBe(true);
  });

  it("labels HyperLog snapshot data as demo, never live", () => {
    const vm = buildQuickLogDraftPreview({
      prefill: { eventType: "environment", source: "hyperlog" },
    });
    expect(vm.snapshotLabel).toBe(QUICK_LOG_DRAFT_DEMO_SNAPSHOT_COPY);
    // Never asserts the data IS live (positive live claims).
    expect(vm.snapshotLabel).not.toMatch(/\bis live\b/i);
    expect(vm.sourceLabel).not.toMatch(/\bis live\b/i);
    expect(vm.sourceLabel).not.toMatch(/\blive sensor\b/i);
  });

  it("surfaces the photo-blocked copy when photoCount > 0", () => {
    const vm = buildQuickLogDraftPreview({
      prefill: { eventType: "observation", source: "hyperlog", photoCount: 2 },
    });
    expect(vm.photoLabel).toBe(QUICK_LOG_DRAFT_PHOTO_BLOCKED_COPY);
  });

  it("never positively claims HyperLog data is live", () => {
    const vm = buildQuickLogDraftPreview({
      prefill: {
        eventType: "environment",
        source: "hyperlog",
        tentId: "t-1",
        suggestSnapshot: true,
        note: "Temp 24, RH 58",
        photoCount: 1,
      },
    });
    const serialized = JSON.stringify(vm);
    // No positive "live" claim — only the negation "not ... live sensor data" is allowed.
    expect(serialized).not.toMatch(/\bis live\b/i);
    expect(serialized).not.toMatch(/\blive telemetry\b/i);
    expect(serialized).not.toMatch(/\bLIVE SNAPSHOT\b/);
  });

  it("falls back to non-hyperlog snapshot copy for plant-detail handoff", () => {
    const vm = buildQuickLogDraftPreview({
      prefill: {
        eventType: "observation",
        suggestSnapshot: true,
        tentId: "t-1",
        source: null,
      },
    });
    expect(vm.snapshotLabel).toMatch(/Sensor snapshot suggested/);
    expect(vm.snapshotLabel).not.toMatch(/\bis live\b/i);
  });

  it("never throws on malformed input", () => {
    expect(() =>
      buildQuickLogDraftPreview({
        // @ts-expect-error intentional malformed
        prefill: { eventType: 99, note: { weird: true }, photoCount: "x" },
      }),
    ).not.toThrow();
  });
});
