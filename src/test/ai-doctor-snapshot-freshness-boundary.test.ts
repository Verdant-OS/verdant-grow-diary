/**
 * Boundary tests: 48h manual-snapshot freshness cutoff.
 *
 * Chains `evaluateAiDoctorContext` → `buildAiDoctorReadinessGate` to lock
 * in that transitions across the 48h freshness boundary stay consistent
 * for both `showQuickActions` and `primary.kind` in every safe-flow
 * combination.
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
import {
  buildAiDoctorReadinessGate,
  AI_DOCTOR_READINESS_GATE_ADD_CONTEXT_LABEL,
  AI_DOCTOR_READINESS_GATE_REVIEW_LABEL,
} from "@/lib/aiDoctorReadinessGateViewModel";

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
    },
    // Two recent notes → clears recent-timeline-activity (>=2).
    recentEvents: [
      { at: NOW - 60 * 60 * 1000, category: "notes" },
      { at: NOW - 90 * 60 * 1000, category: "watering" },
    ],
    recentManualSnapshots: [{ at: NOW - snapAgeMs, severity: "ok" }],
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
    const r = evaluateAiDoctorContext(
      baseInput(AI_DOCTOR_SNAPSHOT_FRESH_MS + ONE_MS),
    );
    expect(r.readiness).toBe("partial");
    expect(r.evidence).toContain("recent-manual-sensor-snapshot");
    expect(r.evidence).not.toContain("fresh-manual-sensor-snapshot");
  });

  it("one ms before the 48h cutoff → fresh → strong readiness", () => {
    const r = evaluateAiDoctorContext(
      baseInput(AI_DOCTOR_SNAPSHOT_FRESH_MS - ONE_MS),
    );
    expect(r.readiness).toBe("strong");
    expect(r.evidence).toContain("fresh-manual-sensor-snapshot");
  });

  it("gate: at-cutoff (strong) + safe flow → hides quick actions, primary=open_ai_doctor", () => {
    const r = evaluateAiDoctorContext(baseInput(AI_DOCTOR_SNAPSHOT_FRESH_MS));
    const gate = buildAiDoctorReadinessGate({
      readiness: r.readiness,
      hasSafeAiDoctorFlow: true,
    });
    expect(gate.showQuickActions).toBe(false);
    expect(gate.primary.kind).toBe("open_ai_doctor");
    expect(gate.primary.label).toBe(AI_DOCTOR_READINESS_GATE_REVIEW_LABEL);
  });

  it("gate: 1ms-past-cutoff (partial) + safe flow → keeps quick actions, primary=open_ai_doctor", () => {
    const r = evaluateAiDoctorContext(
      baseInput(AI_DOCTOR_SNAPSHOT_FRESH_MS + ONE_MS),
    );
    const gate = buildAiDoctorReadinessGate({
      readiness: r.readiness,
      hasSafeAiDoctorFlow: true,
    });
    expect(gate.showQuickActions).toBe(true);
    expect(gate.primary.kind).toBe("open_ai_doctor");
    expect(gate.primary.label).toBe(AI_DOCTOR_READINESS_GATE_REVIEW_LABEL);
  });

  it("gate: 1ms-past-cutoff (partial) + no safe flow → quick actions, primary=focus_anchor (add-context)", () => {
    const r = evaluateAiDoctorContext(
      baseInput(AI_DOCTOR_SNAPSHOT_FRESH_MS + ONE_MS),
    );
    const gate = buildAiDoctorReadinessGate({
      readiness: r.readiness,
      hasSafeAiDoctorFlow: false,
    });
    expect(gate.showQuickActions).toBe(true);
    expect(gate.primary.kind).toBe("focus_anchor");
    expect(gate.primary.label).toBe(AI_DOCTOR_READINESS_GATE_ADD_CONTEXT_LABEL);
  });

  it("gate: at-cutoff (strong) + no safe flow → hides quick actions, primary=focus_anchor", () => {
    const r = evaluateAiDoctorContext(baseInput(AI_DOCTOR_SNAPSHOT_FRESH_MS));
    const gate = buildAiDoctorReadinessGate({
      readiness: r.readiness,
      hasSafeAiDoctorFlow: false,
    });
    expect(gate.showQuickActions).toBe(false);
    expect(gate.primary.kind).toBe("focus_anchor");
    expect(gate.primary.label).toBe(AI_DOCTOR_READINESS_GATE_ADD_CONTEXT_LABEL);
  });

  it("stale → fresh transition flips readiness partial → strong and hides quick actions (safe flow on)", () => {
    const stale = evaluateAiDoctorContext(
      baseInput(AI_DOCTOR_SNAPSHOT_FRESH_MS + ONE_MS),
    );
    const fresh = evaluateAiDoctorContext(
      baseInput(AI_DOCTOR_SNAPSHOT_FRESH_MS - ONE_MS),
    );
    expect(stale.readiness).toBe("partial");
    expect(fresh.readiness).toBe("strong");

    const gStale = buildAiDoctorReadinessGate({
      readiness: stale.readiness,
      hasSafeAiDoctorFlow: true,
    });
    const gFresh = buildAiDoctorReadinessGate({
      readiness: fresh.readiness,
      hasSafeAiDoctorFlow: true,
    });
    expect(gStale.showQuickActions).toBe(true);
    expect(gFresh.showQuickActions).toBe(false);
    // Primary action kind stays consistent across the transition under safe flow.
    expect(gStale.primary.kind).toBe("open_ai_doctor");
    expect(gFresh.primary.kind).toBe("open_ai_doctor");
  });

  it("fresh → stale transition flips readiness strong → partial and re-shows quick actions (safe flow on)", () => {
    const fresh = evaluateAiDoctorContext(
      baseInput(AI_DOCTOR_SNAPSHOT_FRESH_MS - ONE_MS),
    );
    const stale = evaluateAiDoctorContext(
      baseInput(AI_DOCTOR_SNAPSHOT_FRESH_MS + ONE_MS),
    );
    const gFresh = buildAiDoctorReadinessGate({
      readiness: fresh.readiness,
      hasSafeAiDoctorFlow: true,
    });
    const gStale = buildAiDoctorReadinessGate({
      readiness: stale.readiness,
      hasSafeAiDoctorFlow: true,
    });
    expect(gFresh.showQuickActions).toBe(false);
    expect(gStale.showQuickActions).toBe(true);
    expect(gStale.primary.kind).toBe("open_ai_doctor");
  });

  it("no-safe-flow transition: primary stays focus_anchor on both sides of the cutoff", () => {
    const stale = evaluateAiDoctorContext(
      baseInput(AI_DOCTOR_SNAPSHOT_FRESH_MS + ONE_MS),
    );
    const fresh = evaluateAiDoctorContext(
      baseInput(AI_DOCTOR_SNAPSHOT_FRESH_MS - ONE_MS),
    );
    const gStale = buildAiDoctorReadinessGate({
      readiness: stale.readiness,
      hasSafeAiDoctorFlow: false,
    });
    const gFresh = buildAiDoctorReadinessGate({
      readiness: fresh.readiness,
      hasSafeAiDoctorFlow: false,
    });
    expect(gStale.primary.kind).toBe("focus_anchor");
    expect(gFresh.primary.kind).toBe("focus_anchor");
    // Quick actions still track readiness even without safe flow.
    expect(gStale.showQuickActions).toBe(true);
    expect(gFresh.showQuickActions).toBe(false);
  });

  it("boundary is deterministic across repeated evaluations at the same instant", () => {
    const a1 = evaluateAiDoctorContext(baseInput(AI_DOCTOR_SNAPSHOT_FRESH_MS));
    const a2 = evaluateAiDoctorContext(baseInput(AI_DOCTOR_SNAPSHOT_FRESH_MS));
    const b1 = evaluateAiDoctorContext(
      baseInput(AI_DOCTOR_SNAPSHOT_FRESH_MS + ONE_MS),
    );
    const b2 = evaluateAiDoctorContext(
      baseInput(AI_DOCTOR_SNAPSHOT_FRESH_MS + ONE_MS),
    );
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
