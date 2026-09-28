import { describe, expect, it } from "vitest";

import { buildTimelineInlineSnapshotViewModel } from "@/lib/timelineInlineSnapshotViewModel";

const NOW = Date.parse("2025-06-01T12:00:00Z");

describe("buildTimelineInlineSnapshotViewModel", () => {
  it("uses the stale copy for missing or unparseable capture times", () => {
    for (const sensor of [
      { source: "manual", temp: 24 },
      { source: "manual", ts: "nope", temp: 24 },
    ]) {
      const view = buildTimelineInlineSnapshotViewModel(
        {
          entry_at: "2025-06-01T11:55:00Z",
          stage: "veg",
          details: { source: "manual", sensor_snapshot: sensor },
        },
        { nowMs: NOW },
      );

      expect(view?.historyNotice).toBe("Capture time unverified — not current.");
      expect(view?.capturedAt ?? null).not.toBe("2025-06-01T11:55:00Z");
    }
  });

  it("treats a non-string nested source exactly like a blank nested source", () => {
    const blank = buildTimelineInlineSnapshotViewModel(
      {
        stage: "veg",
        details: {
          source: "manual",
          sensor_snapshot: { source: " ", ts: "2025-06-01T11:55:00Z", temp: 24, rh: 55, vpd: 1.1 },
        },
      },
      { nowMs: NOW },
    );

    const nonString = buildTimelineInlineSnapshotViewModel(
      {
        stage: "veg",
        details: {
          source: "manual",
          sensor_snapshot: {
            source: { kind: "manual" },
            ts: "2025-06-01T11:55:00Z",
            temp: 24,
            rh: 55,
            vpd: 1.1,
          },
        },
      },
      { nowMs: NOW },
    );

    expect(nonString?.sourceBadge.kind).toBe(blank?.sourceBadge.kind);
    expect(nonString?.historyNotice).toBe(blank?.historyNotice ?? null);
    expect(nonString?.sourceBadge.kind).toBe("manual");
  });

  it("falls back to invalid when the nested source is blank and the entry source claims live", () => {
    const view = buildTimelineInlineSnapshotViewModel(
      {
        stage: "veg",
        details: {
          source: "live",
          sensor_snapshot: { source: " ", ts: "2025-06-01T11:55:00Z", temp: 24, rh: 55, vpd: 1.1 },
        },
      },
      { nowMs: NOW },
    );

    expect(view?.sourceBadge.kind).toBe("invalid");
  });

  it("never reads capture time from entry_at", () => {
    const view = buildTimelineInlineSnapshotViewModel(
      {
        entry_at: "2025-06-01T11:55:00Z",
        stage: "veg",
        details: { source: "manual", sensor_snapshot: { source: "manual", temp: 24, rh: 55 } },
      },
      { nowMs: NOW },
    );

    expect(view?.capturedAt).toBeNull();
    expect(view?.recheckAtMs).toBeNull();
    expect(view?.changesAtMs).toBeNull();
    expect(view?.historyNotice).toBe("Capture time unverified — not current.");
  });

  it("never shows fresh stage guidance for future timestamps", () => {
    const view = buildTimelineInlineSnapshotViewModel(
      {
        stage: "veg",
        details: {
          source: "manual",
          sensor_snapshot: {
            source: "manual",
            ts: "2025-06-01T12:20:00Z",
            temp: 24,
            rh: 55,
            vpd: 1.1,
          },
        },
      },
      { nowMs: NOW },
    );

    expect(view?.hasFutureTimestamp).toBe(true);
    expect(view?.vpdStageHint).toBeNull();
  });
});
