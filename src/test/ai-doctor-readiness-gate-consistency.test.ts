/**
 * Targeted: readiness consistency for partial-evidence and stale-snapshot
 * inputs to `evaluateAiDoctorContext`. (The readiness-gate view model these
 * cases were once chained through was removed on 2026-11-13: no route
 * mounted it.)
 *
 * Stale snapshots (older than AI_DOCTOR_SNAPSHOT_FRESH_MS) must never
 * upgrade readiness to "strong".
 *
 * Pure: no React, no I/O.
 */
import { describe, it, expect } from "vitest";
import { evaluateAiDoctorContext, AI_DOCTOR_SNAPSHOT_FRESH_MS } from "@/lib/aiDoctorContextRules";

const NOW = Date.UTC(2026, 6, 20, 12, 0, 0);
const HOUR = 60 * 60 * 1000;
const iso = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

const plant = {
  hasProfile: true,
  strain: "Blueberry",
  stage: "veg",
  medium: "Coco",
  hasPlantPhoto: true,
  plantType: "photoperiod",
} as const;

// ---------------------------------------------------------------------------
// Partial-evidence variants
// ---------------------------------------------------------------------------

/** Each variant intentionally hits "partial" via a different missing piece. */
const PARTIAL_VARIANTS: ReadonlyArray<{
  label: string;
  input: Parameters<typeof evaluateAiDoctorContext>[0];
}> = [
  {
    label: "activity present, no snapshot",
    input: {
      plant,
      recentEvents: [
        { at: iso(-HOUR), category: "watering" },
        { at: iso(-2 * HOUR), category: "notes" },
      ],
      recentManualSnapshots: [],
      recentRootZoneObservations: 1,
      now: NOW,
    },
  },
  {
    label: "snapshot present, no timeline activity",
    input: {
      plant,
      recentEvents: [],
      recentManualSnapshots: [{ at: iso(-HOUR), severity: "ok" }],
      recentRootZoneObservations: 1,
      now: NOW,
    },
  },
  {
    label: "activity + stale snapshot (older than 48h)",
    input: {
      plant,
      recentEvents: [
        { at: iso(-HOUR), category: "watering" },
        { at: iso(-2 * HOUR), category: "notes" },
      ],
      recentManualSnapshots: [{ at: iso(-(AI_DOCTOR_SNAPSHOT_FRESH_MS + HOUR)), severity: "ok" }],
      recentRootZoneObservations: 1,
      now: NOW,
    },
  },
  {
    label: "activity + fresh snapshot but no photo and no watering/feeding",
    input: {
      plant: { ...plant, hasPlantPhoto: false },
      recentEvents: [
        { at: iso(-HOUR), category: "notes" },
        { at: iso(-2 * HOUR), category: "notes" },
      ],
      recentManualSnapshots: [{ at: iso(-HOUR), severity: "ok" }],
      recentRootZoneObservations: 1,
      now: NOW,
    },
  },
  {
    label: "activity + fresh snapshot but stage missing",
    input: {
      plant: { ...plant, stage: null },
      recentEvents: [
        { at: iso(-HOUR), category: "watering" },
        { at: iso(-2 * HOUR), category: "notes" },
      ],
      recentManualSnapshots: [{ at: iso(-HOUR), severity: "ok" }],
      recentRootZoneObservations: 1,
      now: NOW,
    },
  },
];

describe("readiness consistency: partial evidence", () => {
  for (const v of PARTIAL_VARIANTS) {
    it(`partial (${v.label}) stays partial`, () => {
      expect(evaluateAiDoctorContext(v.input).readiness).toBe("partial");
    });
  }
});

// ---------------------------------------------------------------------------
// Stale-snapshot invariants
// ---------------------------------------------------------------------------

describe("readiness consistency: stale snapshots never mask readiness", () => {
  const stalePlusActivity = {
    plant,
    recentEvents: [
      { at: iso(-HOUR), category: "watering" as const },
      { at: iso(-2 * HOUR), category: "notes" as const },
    ],
    recentManualSnapshots: [
      { at: iso(-(AI_DOCTOR_SNAPSHOT_FRESH_MS + HOUR)), severity: "ok" as const },
    ],
    recentRootZoneObservations: 1,
    now: NOW,
  };

  it("stale-only snapshot with activity stays partial (never strong)", () => {
    const result = evaluateAiDoctorContext(stalePlusActivity);
    expect(result.readiness).toBe("partial");
    expect(result.evidence).not.toContain("fresh-manual-sensor-snapshot");
  });

  it("swapping a stale snapshot for a fresh one flips readiness partial → strong", () => {
    const fresh = {
      ...stalePlusActivity,
      recentManualSnapshots: [{ at: iso(-HOUR), severity: "ok" as const }],
    };
    expect(evaluateAiDoctorContext(stalePlusActivity).readiness).toBe("partial");
    expect(evaluateAiDoctorContext(fresh).readiness).toBe("strong");
  });
});
