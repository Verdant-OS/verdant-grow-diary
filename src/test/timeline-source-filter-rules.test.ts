/**
 * timeline-source-filter-rules — tests for the new sensorSources filter
 * dimension and the deriveTimelineRowSensorSource helper.
 */
import { describe, it, expect } from "vitest";
import {
  deriveTimelineRowSensorSource,
  filterTimelineEvidenceRows,
  isTimelineEvidenceFilterActive,
} from "@/lib/timelineEvidenceFilterRules";

const NOW = Date.parse("2025-06-01T12:00:00Z");

function row(id: string, details: Record<string, unknown> | null) {
  return {
    id,
    note: id,
    stage: "veg",
    plant_id: "p1",
    tent_id: "t1",
    entry_at: "2025-06-01T11:59:30Z",
    details,
  };
}

describe("deriveTimelineRowSensorSource", () => {
  it("returns null for non-sensor rows", () => {
    expect(deriveTimelineRowSensorSource(row("a", { event_type: "note" }))).toBeNull();
    expect(deriveTimelineRowSensorSource(row("b", null))).toBeNull();
  });

  it("returns canonical kind for sensor_snapshot", () => {
    expect(
      deriveTimelineRowSensorSource(
        row("a", { sensor_snapshot: { source: "live", ts: "2025-06-01T11:59:50Z" } }),
        { now: NOW, staleMs: 60_000 },
      ),
    ).toBe("live");
    expect(
      deriveTimelineRowSensorSource(row("b", { sensor_snapshot: { source: "csv" } })),
    ).toBe("csv");
  });

  it("falls back to manual for Quick Log snapshots without source", () => {
    expect(
      deriveTimelineRowSensorSource(row("a", { sensor_snapshot: { temp: 22 } })),
    ).toBe("manual");
  });

  it("downgrades stale live snapshots to stale", () => {
    expect(
      deriveTimelineRowSensorSource(
        row("a", {
          sensor_snapshot: { source: "live", ts: "2025-01-01T00:00:00Z" },
        }),
        { now: NOW, staleMs: 60_000 },
      ),
    ).toBe("stale");
  });
});

describe("filterTimelineEvidenceRows + sensorSources", () => {
  const rows = [
    row("live", { sensor_snapshot: { source: "live", ts: "2025-06-01T11:59:50Z" } }),
    row("manual", { sensor_snapshot: { temp: 22 } }),
    row("csv", { sensor_snapshot: { source: "csv" } }),
    row("demo", { sensor_snapshot: { source: "demo" } }),
    row("invalid", { sensor_snapshot: { source: "bogus" } }),
    row("note", { event_type: "note" }),
  ];

  it("isActive flips when sensorSources is non-empty", () => {
    expect(isTimelineEvidenceFilterActive({ sensorSources: [] })).toBe(false);
    expect(isTimelineEvidenceFilterActive({ sensorSources: ["live"] })).toBe(true);
  });

  it("filters to a single kind and hides non-sensor entries", () => {
    const out = filterTimelineEvidenceRows(rows, { sensorSources: ["live"] });
    expect(out.map((r) => r.id)).toEqual(["live"]);
  });

  it("supports multi-select OR semantics across selected kinds", () => {
    const out = filterTimelineEvidenceRows(rows, { sensorSources: ["csv", "manual"] });
    expect(out.map((r) => r.id).sort()).toEqual(["csv", "manual"]);
  });

  it("invalid filter matches missing/unknown sources", () => {
    const out = filterTimelineEvidenceRows(rows, { sensorSources: ["invalid"] });
    expect(out.map((r) => r.id)).toEqual(["invalid"]);
  });

  it("empty filter array returns all rows unchanged", () => {
    const out = filterTimelineEvidenceRows(rows, { sensorSources: [] });
    expect(out.length).toBe(rows.length);
  });
});
