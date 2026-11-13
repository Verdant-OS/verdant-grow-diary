/**
 * Targeted: AI Doctor readiness categorization.
 *
 * Verifies:
 *  - Available evidence lands in `evidence[]`, missing evidence in `missing[]`,
 *    with no overlap and no silent promotion of stale/invalid data to healthy.
 *  - Stale snapshots never earn the `fresh-manual-sensor-snapshot` flag.
 *  - Invalid/warning snapshots are flagged, not treated as healthy evidence.
 *  - Malformed timestamps are ignored entirely (not categorized as available).
 *  - Readiness is `insufficient` only when there is no plant profile, or no
 *    recent activity and no recent snapshot at all.
 *  - Partial-but-meaningful context is `partial`, not `insufficient`.
 *
 * Pure: no React, no I/O.
 */
import { describe, it, expect } from "vitest";
import {
  evaluateAiDoctorContext,
  AI_DOCTOR_RECENT_WINDOW_MS,
  AI_DOCTOR_SNAPSHOT_FRESH_MS,
} from "@/lib/aiDoctorContextRules";

const NOW = Date.UTC(2026, 6, 15, 12, 0, 0);
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const iso = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

const fullPlant = {
  hasProfile: true,
  strain: "Blueberry",
  stage: "veg",
  medium: "Coco",
  hasPlantPhoto: true,
} as const;

describe("readiness categorization: available vs missing", () => {
  it("puts only truly-available items in evidence[] and only unmet items in missing[]", () => {
    const r = evaluateAiDoctorContext({
      plant: {
        hasProfile: true,
        strain: "Blueberry",
        stage: "veg",
        medium: "", // blank -> missing
        hasPlantPhoto: false, // absent -> missing
      },
      recentEvents: [
        { at: iso(-HOUR), category: "watering" },
        { at: iso(-2 * HOUR), category: "notes" },
      ],
      recentManualSnapshots: [{ at: iso(-HOUR), severity: "ok" }],
      now: NOW,
    });

    expect(r.evidence).toEqual(
      expect.arrayContaining([
        "plant-profile",
        "strain",
        "stage",
        "recent-timeline-activity",
        "recent-watering-or-feeding",
        "recent-manual-sensor-snapshot",
        "fresh-manual-sensor-snapshot",
      ]),
    );
    expect(r.missing).toEqual(expect.arrayContaining(["medium", "plant-photo"]));
    // Categorization must be exclusive.
    const overlap = r.evidence.filter((c) => r.missing.includes(c));
    expect(overlap).toEqual([]);
  });

  it("does not promote a stale snapshot to fresh evidence", () => {
    const r = evaluateAiDoctorContext({
      plant: fullPlant,
      recentEvents: [
        { at: iso(-HOUR), category: "watering" },
        { at: iso(-2 * HOUR), category: "notes" },
      ],
      recentManualSnapshots: [{ at: iso(-(AI_DOCTOR_SNAPSHOT_FRESH_MS + HOUR)), severity: "ok" }],
      now: NOW,
    });
    expect(r.evidence).toContain("recent-manual-sensor-snapshot");
    expect(r.evidence).not.toContain("fresh-manual-sensor-snapshot");
    expect(r.readiness).toBe("partial");
  });

  it("flags invalid/warning snapshots as warnings (never silent-healthy categorization)", () => {
    const r = evaluateAiDoctorContext({
      plant: fullPlant,
      recentEvents: [{ at: iso(-HOUR), category: "notes" }],
      recentManualSnapshots: [
        { at: iso(-HOUR), severity: "invalid" },
        { at: iso(-2 * HOUR), severity: "warning" },
      ],
      now: NOW,
    });
    // Both flagged snapshots must show up in the warnings count and evidence tag.
    expect(r.counts.recentWarnings).toBe(2);
    expect(r.evidence).toContain("recent-warnings");
  });

  it("ignores malformed timestamps in categorization", () => {
    const r = evaluateAiDoctorContext({
      plant: fullPlant,
      recentEvents: [
        { at: "garbage", category: "watering" },
        { at: null, category: "notes" },
      ],
      recentManualSnapshots: [{ at: undefined, severity: "ok" }],
      now: NOW,
    });
    expect(r.counts.recentEvents).toBe(0);
    expect(r.counts.recentManualSnapshots).toBe(0);
    expect(r.evidence).not.toContain("recent-timeline-activity");
    expect(r.evidence).not.toContain("recent-manual-sensor-snapshot");
    expect(r.missing).toEqual(
      expect.arrayContaining(["recent-timeline-activity", "recent-manual-sensor-snapshot"]),
    );
  });

  it("ignores events outside the 7d window in categorization", () => {
    const r = evaluateAiDoctorContext({
      plant: fullPlant,
      recentEvents: [{ at: iso(-(AI_DOCTOR_RECENT_WINDOW_MS + DAY)), category: "watering" }],
      recentManualSnapshots: [],
      now: NOW,
    });
    expect(r.evidence).not.toContain("recent-timeline-activity");
    expect(r.missing).toContain("recent-timeline-activity");
  });
});

describe("readiness is insufficient only when context is effectively unusable", () => {
  it("blocks when there is no plant profile (insufficient)", () => {
    const r = evaluateAiDoctorContext({ plant: null, now: NOW });
    expect(r.readiness).toBe("insufficient");
  });

  it("blocks when there is no recent activity AND no recent snapshot", () => {
    const r = evaluateAiDoctorContext({
      plant: fullPlant,
      recentEvents: [],
      recentManualSnapshots: [],
      now: NOW,
    });
    expect(r.readiness).toBe("insufficient");
  });

  it("does NOT block when partial but meaningful (activity present, snapshot missing)", () => {
    const r = evaluateAiDoctorContext({
      plant: fullPlant,
      recentEvents: [
        { at: iso(-HOUR), category: "watering" },
        { at: iso(-2 * HOUR), category: "notes" },
      ],
      recentManualSnapshots: [],
      now: NOW,
    });
    expect(r.readiness).toBe("partial");
  });

  it("does NOT block when only a recent snapshot exists (no timeline activity)", () => {
    const r = evaluateAiDoctorContext({
      plant: fullPlant,
      recentEvents: [],
      recentManualSnapshots: [{ at: iso(-HOUR), severity: "ok" }],
      now: NOW,
    });
    // A single snapshot with no activity is not "effectively unusable".
    expect(r.readiness).toBe("partial");
  });

  it("stale-only snapshot with activity is partial (not blocked, not strong)", () => {
    const r = evaluateAiDoctorContext({
      plant: fullPlant,
      recentEvents: [
        { at: iso(-HOUR), category: "watering" },
        { at: iso(-2 * HOUR), category: "notes" },
      ],
      recentManualSnapshots: [{ at: iso(-(AI_DOCTOR_SNAPSHOT_FRESH_MS + HOUR)), severity: "ok" }],
      now: NOW,
    });
    expect(r.readiness).toBe("partial");
  });

  it("readiness result never claims a diagnosis", () => {
    const r = evaluateAiDoctorContext({
      plant: fullPlant,
      recentEvents: [{ at: iso(-HOUR), category: "watering" }],
      recentManualSnapshots: [{ at: iso(-HOUR), severity: "invalid" }],
      now: NOW,
    });
    expect(r.diagnosisClaimed).toBe(false);
  });
});
