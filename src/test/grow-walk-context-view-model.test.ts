import { describe, expect, it } from "vitest";

import type { GrowWalkContext } from "@/lib/growWalkContracts";
import {
  GROW_WALK_QUICK_LOG_TEMPLATE,
  buildGrowWalkBrief,
} from "@/lib/growWalkContextViewModel";

function context(overrides: Partial<GrowWalkContext> = {}): GrowWalkContext {
  const base: GrowWalkContext = {
    scope: {
      growId: "grow-1",
      growName: "Home Grow",
      tentId: "tent-1",
      tentName: "Flower Tent",
      plantId: "plant-1",
      plantName: "Sour Diesel Auto",
    },
    profile: {
      stage: "flower",
      strain: "Sour Diesel",
      medium: "coco",
      potSize: "5 gal",
      growType: "autoflower",
      plantStatus: "healthy",
    },
    evidence: {
      recentEvents: [],
      sensors: {
        available: true,
        contradictionMetrics: [],
        readings: {
          humidity_pct: {
            id: "reading-1",
            tent_id: "tent-1",
            metric: "humidity_pct",
            value: 58,
            quality: "ok",
            source: "live",
            ts: "2026-08-07T11:55:00.000Z",
            captured_at: "2026-08-07T11:55:00.000Z",
            freshness: "fresh",
            current_live: true,
          },
        },
      },
      photos: [
        {
          id: "photo-1",
          capturedAt: "2026-08-07T10:00:00.000Z",
          source: "manual",
          inspectedInThisRun: false,
        },
      ],
      alerts: [],
      aiDoctor: null,
      actionQueue: { openCount: 0, items: [] },
    },
    derived: {
      reasonCodes: [],
      missingEvidenceCodes: ["no_current_visual_evidence"],
      contradictionCodes: [],
      recentMajorChangeCount48h: 0,
      latestMajorChangeAt: null,
      latestObservationAt: "2026-08-07T10:00:00.000Z",
      latestAdverseEvidenceAt: null,
      evidenceConfidence: "high",
      attentionBand: "routine_observation",
    },
    receipt: {
      generatedAt: "2026-08-07T12:00:00.000Z",
      lookbackHours: 72,
      contextVersion: "grow-walk-v0.1",
      partialLanes: [],
      truncatedLanes: [],
    },
  };

  return {
    ...base,
    ...overrides,
    scope: { ...base.scope, ...overrides.scope },
    profile: { ...base.profile, ...overrides.profile },
    evidence: {
      ...base.evidence,
      ...overrides.evidence,
      sensors: {
        ...base.evidence.sensors,
        ...overrides.evidence?.sensors,
      },
      actionQueue: {
        ...base.evidence.actionQueue,
        ...overrides.evidence?.actionQueue,
      },
    },
    derived: { ...base.derived, ...overrides.derived },
    receipt: { ...base.receipt, ...overrides.receipt },
  };
}

describe("buildGrowWalkBrief", () => {
  it("returns the fixed section contract and no more than three physical checks", () => {
    const brief = buildGrowWalkBrief(
      context({
        derived: {
          reasonCodes: [
            "active_high_alert_needs_confirmation",
            "multiple_adverse_evidence_lanes",
            "worsening_observation",
          ],
          attentionBand: "immediate_physical_verification",
        } as GrowWalkContext["derived"],
      }),
    );

    expect(Object.keys(brief)).toEqual([
      "scopeLabel",
      "attentionBand",
      "whatChanged",
      "evidenceTrustSummary",
      "physicalChecks",
      "missingInformation",
      "safestNextObservation",
      "whatNotToDo",
      "aiDoctorPosture",
      "quickLogTemplate",
      "actionQueuePosture",
      "confidence",
    ]);
    expect(brief.physicalChecks.length).toBeGreaterThan(0);
    expect(brief.physicalChecks.length).toBeLessThanOrEqual(3);
  });

  it("keeps a routine result calm and observational", () => {
    const brief = buildGrowWalkBrief(context());
    expect(brief.attentionBand).toBe("routine_observation");
    expect(brief.physicalChecks).toHaveLength(1);
    expect(JSON.stringify(brief)).not.toMatch(/alarm|emergency|definitely|must flush/i);
    expect(brief.aiDoctorPosture).toBe("not_needed");
  });

  it("adds restraints to every non-routine brief", () => {
    const brief = buildGrowWalkBrief(
      context({
        derived: {
          attentionBand: "watch_today",
          reasonCodes: ["stacked_major_changes_48h"],
          recentMajorChangeCount48h: 3,
        } as GrowWalkContext["derived"],
      }),
    );
    expect(brief.whatNotToDo.length).toBeGreaterThan(0);
    expect(brief.whatNotToDo.join(" ")).toMatch(/avoid|do not|pause/i);
  });

  it("tells the grower to verify non-live sensors physically without changing equipment", () => {
    const brief = buildGrowWalkBrief(
      context({
        evidence: {
          sensors: {
            available: true,
            contradictionMetrics: [],
            readings: {
              humidity_pct: {
                id: "manual-1",
                tent_id: "tent-1",
                metric: "humidity_pct",
                value: 62,
                quality: "ok",
                source: "manual",
                ts: "2026-08-07T11:00:00.000Z",
                captured_at: "2026-08-07T11:00:00.000Z",
                freshness: "fresh",
                current_live: false,
              },
            },
          },
        } as GrowWalkContext["evidence"],
        derived: {
          attentionBand: "watch_today",
          missingEvidenceCodes: [
            "no_current_visual_evidence",
            "sensor_lane_not_current_live",
          ],
          evidenceConfidence: "medium",
        } as GrowWalkContext["derived"],
      }),
    );

    expect([...brief.physicalChecks, ...brief.evidenceTrustSummary].join(" ")).toMatch(
      /verify physically|manual|not live/i,
    );
    expect(JSON.stringify(brief)).not.toMatch(/change (the )?setpoint|turn on|increase fan/i);
  });

  it("never describes photo metadata as inspected image content", () => {
    const brief = buildGrowWalkBrief(context());
    expect(brief.evidenceTrustSummary.join(" ")).toMatch(/photo recorded|not inspected/i);
    expect(JSON.stringify(brief)).not.toMatch(/i see|visible deficiency|the image shows/i);
  });

  it("surfaces an existing Action Queue item for review without drafting another", () => {
    const brief = buildGrowWalkBrief(
      context({
        evidence: {
          actionQueue: {
            openCount: 1,
            items: [
              {
                id: "aq-1",
                status: "suggested",
                riskLevel: "low",
                reasonExcerpt: "Review airflow after physical confirmation.",
                createdAt: "2026-08-07T09:00:00.000Z",
              },
            ],
          },
        } as GrowWalkContext["evidence"],
      }),
    );
    expect(brief.actionQueuePosture).toBe("existing_item_review");
    expect(JSON.stringify(brief)).not.toMatch(/create|insert|duplicate/i);
  });

  it("does not fabricate an Action Queue draft from weak evidence", () => {
    const brief = buildGrowWalkBrief(
      context({
        derived: {
          attentionBand: "insufficient_evidence",
          evidenceConfidence: "low",
          missingEvidenceCodes: [
            "no_recent_grower_log",
            "no_current_visual_evidence",
            "sensor_lane_unavailable",
          ],
        } as GrowWalkContext["derived"],
      }),
    );
    expect(brief.actionQueuePosture).toBe("none");
  });

  it("maps AI Doctor escalation to evidence quality", () => {
    const recommended = buildGrowWalkBrief(
      context({
        derived: {
          attentionBand: "immediate_physical_verification",
          reasonCodes: ["multiple_adverse_evidence_lanes", "worsening_observation"],
          evidenceConfidence: "high",
        } as GrowWalkContext["derived"],
      }),
    );
    expect(recommended.aiDoctorPosture).toBe("recommended");

    const wait = buildGrowWalkBrief(
      context({
        derived: {
          attentionBand: "watch_today",
          reasonCodes: ["missing_post_intervention_observation"],
          missingEvidenceCodes: [
            "no_current_visual_evidence",
            "photo_predates_latest_major_change",
            "no_post_intervention_observation",
          ],
          evidenceConfidence: "medium",
        } as GrowWalkContext["derived"],
      }),
    );
    expect(wait.aiDoctorPosture).toBe("wait_for_missing_evidence");

    const cannot = buildGrowWalkBrief(
      context({
        derived: {
          attentionBand: "insufficient_evidence",
          contradictionCodes: ["sensor_sources_disagree"],
          evidenceConfidence: "low",
        } as GrowWalkContext["derived"],
        receipt: { partialLanes: ["sensors"] } as GrowWalkContext["receipt"],
      }),
    );
    expect(cannot.aiDoctorPosture).toBe("cannot_assess_reliably");
  });

  it("uses a fill-after-inspection Quick Log template and fails closed on invalid scope", () => {
    expect(buildGrowWalkBrief(context()).quickLogTemplate).toBe(GROW_WALK_QUICK_LOG_TEMPLATE);
    expect(GROW_WALK_QUICK_LOG_TEMPLATE).toBe(
      "After the walk, log: response = better / same / worse; root-zone check = light / moderate / heavy / not checked; new growth = unchanged / changed / not checked; photo = added / not added.",
    );

    const invalidScope = buildGrowWalkBrief(
      context({
        derived: {
          attentionBand: "insufficient_evidence",
          contradictionCodes: ["scope_relationship_invalid"],
          evidenceConfidence: "low",
        } as GrowWalkContext["derived"],
      }),
    );
    expect(invalidScope.quickLogTemplate).toBeNull();
  });
});
