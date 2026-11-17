/**
 * Boundary tests: 48h manual-snapshot freshness cutoff.
 *
 * Locks `evaluateAiDoctorContext` readiness on both sides of the
 * freshness boundary. (Readiness-gate view-model checks were removed with
 * that module on 2026-11-13: no route mounted it.)
 *
 * Cutoff semantics (source: aiDoctorContextRules):
 *   now - latestSnapAt <= snapshotFreshMs  → fresh (inclusive)
 *   now - latestSnapAt >  snapshotFreshMs  → stale (within 7d = still counts
 *                                            as "recent" evidence, but not fresh)
 *
 * Pure: no React, no I/O.
 */
import { describe, it, expect } from "vitest";
import {
  evaluateAiDoctorContext,
  AI_DOCTOR_SNAPSHOT_FRESH_MS,
  type AiDoctorContextInput,
} from "@/lib/aiDoctorContextRules";

const NOW = Date.parse("2026-07-15T12:00:00Z");
const ONE_MS = 1;

/** Baseline input that reaches "strong" iff the snapshot is fresh. */
function baseInput(snapAgeMs: number): AiDoctorContextInput {
  return {
    now: NOW,
    plant: {
      hasProfile: true,
      strain: "Demo Cultivar",
      stage: "veg",
      medium: "coco",
      hasPlantPhoto: true,
      // Known plant type → clears the plant-type gate.
      plantType: "photoperiod",
    },
    // Two recent notes → clears recent-timeline-activity (>=2).
    recentEvents: [
      { at: NOW - 60 * 60 * 1000, category: "notes" },
      { at: NOW - 90 * 60 * 1000, category: "watering" },
    ],
    recentManualSnapshots: [{ at: NOW - snapAgeMs, severity: "ok" }],
    // Root-zone history present → clears the root-zone-history gate,
    // leaving snapshot freshness as the only discriminator.
    recentRootZoneObservations: 1,
  };
}

describe("AI Doctor 48h snapshot freshness — boundary transitions", () => {
  it("exactly at the 48h cutoff → fresh (inclusive) → strong readiness", () => {
    const r = evaluateAiDoctorContext(baseInput(AI_DOCTOR_SNAPSHOT_FRESH_MS));
    expect(r.readiness).toBe("strong");
    expect(r.evidence).toContain("recent-manual-sensor-snapshot");
    expect(r.evidence).toContain("fresh-manual-sensor-snapshot");
  });

  it("one ms past the 48h cutoff → stale → partial readiness", () => {
    const r = evaluateAiDoctorContext(baseInput(AI_DOCTOR_SNAPSHOT_FRESH_MS + ONE_MS));
    expect(r.readiness).toBe("partial");
    expect(r.evidence).toContain("recent-manual-sensor-snapshot");
    expect(r.evidence).not.toContain("fresh-manual-sensor-snapshot");
  });

  it("one ms before the 48h cutoff → fresh → strong readiness", () => {
    const r = evaluateAiDoctorContext(baseInput(AI_DOCTOR_SNAPSHOT_FRESH_MS - ONE_MS));
    expect(r.readiness).toBe("strong");
    expect(r.evidence).toContain("fresh-manual-sensor-snapshot");
  });

  it("boundary is deterministic across repeated evaluations at the same instant", () => {
    const a1 = evaluateAiDoctorContext(baseInput(AI_DOCTOR_SNAPSHOT_FRESH_MS));
    const a2 = evaluateAiDoctorContext(baseInput(AI_DOCTOR_SNAPSHOT_FRESH_MS));
    const b1 = evaluateAiDoctorContext(baseInput(AI_DOCTOR_SNAPSHOT_FRESH_MS + ONE_MS));
    const b2 = evaluateAiDoctorContext(baseInput(AI_DOCTOR_SNAPSHOT_FRESH_MS + ONE_MS));
    expect(a1.readiness).toBe(a2.readiness);
    expect(a1.evidence).toEqual(a2.evidence);
    expect(b1.readiness).toBe(b2.readiness);
    expect(b1.evidence).toEqual(b2.evidence);
  });

  it("custom snapshotFreshMs config honors its own boundary (inclusive)", () => {
    const custom = 60 * 60 * 1000; // 1 hour
    const atCutoff: AiDoctorContextInput = {
      ...baseInput(custom),
      config: { snapshotFreshMs: custom },
    };
    const pastCutoff: AiDoctorContextInput = {
      ...baseInput(custom + ONE_MS),
      config: { snapshotFreshMs: custom },
    };
    expect(evaluateAiDoctorContext(atCutoff).readiness).toBe("strong");
    expect(evaluateAiDoctorContext(pastCutoff).readiness).toBe("partial");
  });
});
