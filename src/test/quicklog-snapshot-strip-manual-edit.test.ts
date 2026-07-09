/**
 * Tests for the Quick Log sensor snapshot strip adapter's manual-edit
 * behavior and absolute `capturedAtLabel` output.
 *
 * Contract:
 *  - Edit action appears only for source === "manual" (usable or stale).
 *  - Edit action never appears for live / sim / demo / csv sources.
 *  - Editing never promotes source; source stays "manual" in the trust
 *    badge and provider label.
 *  - `capturedAtLabel` is a deterministic absolute string when a
 *    snapshot exists; null when no data.
 */
import { describe, it, expect } from "vitest";
import {
  buildQuickLogSnapshotStrip,
  buildQuickLogStripFromTentState,
  MANUAL_SNAPSHOT_EDIT_ACTION,
  formatCapturedAtAbsolute,
} from "@/lib/quickLogSnapshotStripAdapter";
import { EMPTY_SNAPSHOT, type SensorSnapshot } from "@/lib/sensorSnapshot";
import type { SensorSnapshot as StrictSnapshot } from "@/lib/latestSensorSnapshotRules";

const NOW = new Date("2026-07-07T19:14:00Z");
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();

function snap(partial: Partial<SensorSnapshot>): SensorSnapshot {
  return {
    ...EMPTY_SNAPSHOT,
    source: "manual",
    ts: minutesAgo(5),
    temp: 24,
    rh: 55,
    vpd: 1.32,
    ...partial,
  };
}

function strictManualSnap(partial: Partial<StrictSnapshot> = {}): StrictSnapshot {
  return {
    status: "fresh_non_live",
    source: "manual",
    captured_at: minutesAgo(5),
    age_minutes: 5,
    freshness: "fresh",
    badge_label: "manual • as of 5 min ago",
    metrics: { temp_f: 75.2, humidity_pct: 55, vpd_kpa: 1.32 },
    ...partial,
  } as StrictSnapshot;
}

describe("quickLogSnapshotStripAdapter — manual edit action + captured label", () => {
  it("legacy adapter: manual usable snapshot exposes Edit manual readings action", () => {
    const v = buildQuickLogSnapshotStrip({ snapshot: snap({}), hasTent: true, now: NOW });
    expect(v.status).toBe("usable");
    expect(v.action).toEqual(MANUAL_SNAPSHOT_EDIT_ACTION);
    expect(v.action.kind).toBe("edit");
    if (v.action.kind === "edit") {
      expect(v.action.href).toBe("/sensors#manual-reading");
      expect(v.action.label).toBe("Edit manual readings");
    }
  });

  it("legacy adapter: manual stale snapshot still exposes edit (not refresh)", () => {
    const v = buildQuickLogSnapshotStrip({
      snapshot: snap({ ts: new Date(NOW.getTime() - 48 * 3600_000).toISOString() }),
      hasTent: true,
      now: NOW,
    });
    expect(v.status).toBe("stale");
    expect(v.action.kind).toBe("edit");
  });

  it("legacy adapter: LIVE snapshot never surfaces an edit action", () => {
    const v = buildQuickLogSnapshotStrip({
      snapshot: snap({ source: "live" }),
      hasTent: true,
      now: NOW,
    });
    expect(v.action.kind).not.toBe("edit");
  });

  it("legacy adapter: SIM/demo snapshot never surfaces an edit action", () => {
    const v = buildQuickLogSnapshotStrip({
      snapshot: snap({ source: "sim" }),
      hasTent: true,
      now: NOW,
    });
    expect(v.action.kind).not.toBe("edit");
  });

  it("legacy adapter: capturedAtLabel is a deterministic absolute string when data exists", () => {
    const v = buildQuickLogSnapshotStrip({ snapshot: snap({}), hasTent: true, now: NOW });
    expect(v.capturedAtLabel).toBe("Jul 7, 2026, 7:09 PM UTC");
    expect(v.capturedAt).toBe(minutesAgo(5));
  });

  it("legacy adapter: capturedAtLabel is null with no snapshot", () => {
    const v = buildQuickLogSnapshotStrip({ snapshot: null, hasTent: true, now: NOW });
    expect(v.capturedAtLabel).toBeNull();
  });

  it("legacy adapter: editing does not promote manual source to live in trust badge", () => {
    const v = buildQuickLogSnapshotStrip({ snapshot: snap({}), hasTent: true, now: NOW });
    expect(v.providerLabel).not.toBe("live");
    expect(v.trustBadge.label.toLowerCase()).not.toContain("live");
  });

  it("strict adapter: manual fresh snapshot exposes Edit action + captured label", () => {
    const v = buildQuickLogStripFromTentState({
      status: "ready",
      snapshot: strictManualSnap(),
      hasTent: true,
      now: NOW,
    });
    expect(v.action.kind).toBe("edit");
    expect(v.capturedAtLabel).toBe("Jul 7, 2026, 7:09 PM UTC");
  });

  it("strict adapter: live snapshot never surfaces edit", () => {
    const v = buildQuickLogStripFromTentState({
      status: "ready",
      snapshot: strictManualSnap({ source: "live", status: "fresh_live" }),
      hasTent: true,
      now: NOW,
    });
    expect(v.action.kind).not.toBe("edit");
  });

  it("formatCapturedAtAbsolute returns null for null / invalid ISO", () => {
    expect(formatCapturedAtAbsolute(null)).toBeNull();
    expect(formatCapturedAtAbsolute("not-a-date")).toBeNull();
  });
});
