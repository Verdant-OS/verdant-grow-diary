import { describe, expect, it } from "vitest";

import type { GrowWalkContext } from "@/lib/growWalkContracts";
import { buildGrowWalkBrief } from "@/lib/growWalkContextViewModel";

function baseContext(): GrowWalkContext {
  return {
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
      photos: [],
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
}

function withContext(
  mutate: (draft: GrowWalkContext) => GrowWalkContext,
): ReturnType<typeof buildGrowWalkBrief> {
  return buildGrowWalkBrief(mutate(baseContext()));
}

const FORBIDDEN = [
  /auto-approve/i,
  /execute device/i,
  /change the controller/i,
  /must flush/i,
  /definitely deficient/i,
  /guaranteed mold/i,
  /turn on the (fan|pump|humidifier|dehumidifier)/i,
  /apply\s+\d+(?:\.\d+)?\s*(?:ml|oz|g)\b/i,
];

function assertSafe(value: unknown): void {
  const serialized = JSON.stringify(value);
  for (const pattern of FORBIDDEN) expect(serialized).not.toMatch(pattern);
}

describe("Grow Walk safety golden cases", () => {
  it("1. recently watered droop stays an observation problem, not an underwatering verdict", () => {
    const brief = withContext((draft) => ({
      ...draft,
      evidence: {
        ...draft.evidence,
        recentEvents: [
          {
            id: "water-1",
            eventType: "watering",
            occurredAt: "2026-08-07T09:00:00.000Z",
            source: "manual",
            noteExcerpt: "Watered, then leaves looked less upright.",
            isMajorChange: true,
            response: null,
          },
        ],
      },
      derived: {
        ...draft.derived,
        attentionBand: "watch_today",
        reasonCodes: ["missing_post_intervention_observation"],
        recentMajorChangeCount48h: 1,
        latestMajorChangeAt: "2026-08-07T09:00:00.000Z",
        missingEvidenceCodes: [
          "no_current_visual_evidence",
          "no_post_intervention_observation",
        ],
      },
    }));
    expect(JSON.stringify(brief)).not.toMatch(/underwatered|water again|increase watering/i);
    expect(brief.safestNextObservation).toMatch(/response|better|same|worse|observe/i);
  });

  it("2. leaf-tip burn alone does not trigger a flush or nutrient overhaul", () => {
    const brief = withContext((draft) => ({
      ...draft,
      evidence: {
        ...draft.evidence,
        recentEvents: [
          {
            id: "obs-1",
            eventType: "observation",
            occurredAt: "2026-08-07T10:00:00.000Z",
            source: "manual",
            noteExcerpt: "One older leaf has a burned tip.",
            isMajorChange: false,
            response: null,
          },
        ],
      },
    }));
    expect(JSON.stringify(brief)).not.toMatch(/flush|nutrient overhaul|deficien/i);
  });

  it("3. a stressed autoflower never receives transplant or heavy-defoliation guidance", () => {
    const brief = withContext((draft) => ({
      ...draft,
      profile: { ...draft.profile, plantStatus: "stressed", growType: "autoflower" },
      derived: {
        ...draft.derived,
        attentionBand: "watch_today",
        reasonCodes: ["stressed_or_recovering_with_adverse_change"],
        evidenceConfidence: "medium",
      },
    }));
    expect(brief.whatNotToDo.join(" ")).toMatch(/avoid.*defoliation|transplant/i);
    expect(brief.physicalChecks.join(" ")).not.toMatch(/transplant|defoliate/i);
  });

  it("4. high humidity in flower prompts inspection, not a setpoint change", () => {
    const brief = withContext((draft) => ({
      ...draft,
      evidence: {
        ...draft.evidence,
        alerts: [
          {
            id: "alert-1",
            title: "High humidity",
            reasonExcerpt: "Humidity crossed the configured threshold.",
            severity: "high",
            status: "open",
            metric: "humidity_pct",
            source: "live",
            lastSeenAt: "2026-08-07T11:30:00.000Z",
          },
        ],
      },
      derived: {
        ...draft.derived,
        attentionBand: "watch_today",
        reasonCodes: [
          "active_high_alert_needs_confirmation",
          "flower_humidity_alert_needs_inspection",
        ],
      },
    }));
    expect(brief.physicalChecks.join(" ")).toMatch(/flower|moisture|sensor placement|airflow/i);
    expect(JSON.stringify(brief)).not.toMatch(/setpoint|turn on|increase fan|dehumidifier to/i);
  });

  it("5. three recent interventions produce pause-and-observe restraint", () => {
    const brief = withContext((draft) => ({
      ...draft,
      derived: {
        ...draft.derived,
        attentionBand: "watch_today",
        reasonCodes: ["stacked_major_changes_48h"],
        recentMajorChangeCount48h: 3,
      },
    }));
    expect([...brief.physicalChecks, ...brief.whatNotToDo].join(" ")).toMatch(
      /pause|avoid stacking|observe|response/i,
    );
  });

  it("6. old damaged leaves do not prove current decline", () => {
    const brief = withContext((draft) => ({
      ...draft,
      evidence: {
        ...draft.evidence,
        recentEvents: [
          {
            id: "old-damage",
            eventType: "observation",
            occurredAt: "2026-08-07T10:00:00.000Z",
            source: "manual",
            noteExcerpt: "Old lower leaf remains damaged; new growth not checked.",
            isMajorChange: false,
            response: null,
          },
        ],
      },
    }));
    expect(JSON.stringify(brief)).not.toMatch(/current decline confirmed|getting worse because/i);
    expect(brief.physicalChecks.join(" ")).toMatch(/new growth|normal observation/i);
  });

  it("7. photo metadata without an inspected image produces no image finding", () => {
    const brief = withContext((draft) => ({
      ...draft,
      evidence: {
        ...draft.evidence,
        photos: [
          {
            id: "photo-1",
            capturedAt: "2026-08-07T11:00:00.000Z",
            source: "manual",
            inspectedInThisRun: false,
          },
        ],
      },
    }));
    expect(brief.evidenceTrustSummary.join(" ")).toMatch(/photo recorded|not inspected/i);
    expect(JSON.stringify(brief)).not.toMatch(/image shows|i see|visible in the photo/i);
  });

  it("8. manual-only sensor evidence never becomes live", () => {
    const brief = withContext((draft) => ({
      ...draft,
      evidence: {
        ...draft.evidence,
        sensors: {
          available: true,
          contradictionMetrics: [],
          readings: {
            humidity_pct: {
              id: "manual-1",
              tent_id: "tent-1",
              metric: "humidity_pct",
              value: 60,
              quality: "ok",
              source: "manual",
              ts: "2026-08-07T11:30:00.000Z",
              captured_at: "2026-08-07T11:30:00.000Z",
              freshness: "fresh",
              current_live: false,
            },
          },
        },
      },
      derived: {
        ...draft.derived,
        attentionBand: "watch_today",
        missingEvidenceCodes: [
          "no_current_visual_evidence",
          "sensor_lane_not_current_live",
        ],
        evidenceConfidence: "medium",
      },
    }));
    expect(brief.evidenceTrustSummary.join(" ")).toMatch(/manual|not live/i);
    expect(brief.evidenceTrustSummary.join(" ")).not.toMatch(/current live.*manual/i);
  });

  it("9. contradictory sources lower confidence and stop reliable escalation", () => {
    const brief = withContext((draft) => ({
      ...draft,
      evidence: {
        ...draft.evidence,
        sensors: { ...draft.evidence.sensors, contradictionMetrics: ["humidity_pct"] },
      },
      derived: {
        ...draft.derived,
        attentionBand: "watch_today",
        reasonCodes: ["contradictory_evidence"],
        contradictionCodes: ["sensor_sources_disagree"],
        evidenceConfidence: "low",
      },
    }));
    expect(brief.confidence).toBe("low");
    expect(brief.aiDoctorPosture).toBe("cannot_assess_reliably");
  });

  it("10. missing context returns a missing-evidence posture, not certainty", () => {
    const brief = withContext((draft) => ({
      ...draft,
      derived: {
        ...draft.derived,
        attentionBand: "insufficient_evidence",
        missingEvidenceCodes: [
          "no_recent_grower_log",
          "no_current_visual_evidence",
          "sensor_lane_unavailable",
        ],
        evidenceConfidence: "low",
      },
      receipt: { ...draft.receipt, partialLanes: ["sensors"] },
    }));
    expect(["wait_for_missing_evidence", "cannot_assess_reliably"]).toContain(
      brief.aiDoctorPosture,
    );
    expect(JSON.stringify(brief)).not.toMatch(/certain|confirmed diagnosis/i);
  });

  it("11. an existing Action Queue suggestion is reviewed, not recreated", () => {
    const brief = withContext((draft) => ({
      ...draft,
      evidence: {
        ...draft.evidence,
        actionQueue: {
          openCount: 1,
          items: [
            {
              id: "aq-1",
              status: "suggested",
              riskLevel: "low",
              reasonExcerpt: "Review existing suggestion.",
              createdAt: "2026-08-07T09:00:00.000Z",
            },
          ],
        },
      },
    }));
    expect(brief.actionQueuePosture).toBe("existing_item_review");
    expect(JSON.stringify(brief)).not.toMatch(/create.*action queue|new action queue item/i);
  });

  it("12. recursively contains no prohibited certainty, automation, or treatment language", () => {
    const scenarios = [
      buildGrowWalkBrief(baseContext()),
      withContext((draft) => ({
        ...draft,
        derived: {
          ...draft.derived,
          attentionBand: "watch_today",
          reasonCodes: [
            "stacked_major_changes_48h",
            "flower_humidity_alert_needs_inspection",
          ],
          recentMajorChangeCount48h: 3,
        },
      })),
    ];
    for (const scenario of scenarios) assertSafe(scenario);
  });
});
