import { describe, expect, it } from "vitest";

import type {
  GrowWalkEvidenceDerivation,
  GrowWalkTarget,
} from "@/lib/growWalkContracts";
import {
  deriveGrowWalkAttentionBand,
  sortGrowWalkTargets,
} from "@/lib/growWalkAttentionRules";

function derivation(
  overrides: Partial<GrowWalkEvidenceDerivation> = {},
): GrowWalkEvidenceDerivation {
  return {
    reasonCodes: [],
    missingEvidenceCodes: ["no_current_visual_evidence"],
    contradictionCodes: [],
    recentMajorChangeCount48h: 0,
    latestMajorChangeAt: null,
    latestObservationAt: "2026-08-07T10:00:00.000Z",
    latestAdverseEvidenceAt: null,
    evidenceConfidence: "high",
    ...overrides,
  };
}

function target(
  targetId: string,
  attentionBand: GrowWalkTarget["attentionBand"],
  overrides: Partial<GrowWalkTarget> = {},
): GrowWalkTarget {
  return {
    targetType: "plant",
    targetId,
    growId: "grow-1",
    tentId: "tent-1",
    displayName: targetId,
    strain: null,
    stage: "flower",
    status: null,
    plantCount: null,
    lastLogAt: null,
    lastPhotoEventAt: null,
    latestSensorCapturedAt: null,
    activeAlertCount: 0,
    highestAlertSeverity: null,
    recentMajorChangeCount48h: 0,
    attentionBand,
    reasonCodes: [],
    missingEvidenceCodes: [],
    latestAdverseEvidenceAt: null,
    ...overrides,
  };
}

describe("deriveGrowWalkAttentionBand", () => {
  it("keeps clean, sufficiently supported evidence routine", () => {
    expect(deriveGrowWalkAttentionBand(derivation())).toBe("routine_observation");
  });

  it("uses insufficient evidence when confidence is low and no adverse signal is corroborated", () => {
    expect(
      deriveGrowWalkAttentionBand(
        derivation({
          evidenceConfidence: "low",
          missingEvidenceCodes: [
            "no_recent_grower_log",
            "no_current_visual_evidence",
            "sensor_lane_unavailable",
          ],
        }),
      ),
    ).toBe("insufficient_evidence");
  });

  it("does not make one high alert an immediate verdict", () => {
    expect(
      deriveGrowWalkAttentionBand(
        derivation({ reasonCodes: ["active_high_alert_needs_confirmation"] }),
      ),
    ).toBe("watch_today");
  });

  it("raises corroborated high-alert evidence to immediate physical verification", () => {
    expect(
      deriveGrowWalkAttentionBand(
        derivation({
          reasonCodes: [
            "active_high_alert_needs_confirmation",
            "multiple_adverse_evidence_lanes",
          ],
          latestAdverseEvidenceAt: "2026-08-07T11:30:00.000Z",
        }),
      ),
    ).toBe("immediate_physical_verification");
  });

  it("raises multiple adverse lanes plus a worsening observation without requiring an alert", () => {
    expect(
      deriveGrowWalkAttentionBand(
        derivation({
          reasonCodes: ["multiple_adverse_evidence_lanes", "worsening_observation"],
        }),
      ),
    ).toBe("immediate_physical_verification");
  });

  it("uses watch for stacked changes, missing response evidence, or contradictions", () => {
    for (const reasonCodes of [
      ["stacked_major_changes_48h"],
      ["missing_post_intervention_observation"],
      ["contradictory_evidence"],
    ] as const) {
      expect(deriveGrowWalkAttentionBand(derivation({ reasonCodes }))).toBe("watch_today");
    }
  });

  it("fails closed on a scope relationship contradiction", () => {
    expect(
      deriveGrowWalkAttentionBand(
        derivation({
          evidenceConfidence: "low",
          contradictionCodes: ["scope_relationship_invalid"],
        }),
      ),
    ).toBe("insufficient_evidence");
  });
});

describe("sortGrowWalkTargets", () => {
  it("sorts by attention, alert severity, adverse recency, name, then id", () => {
    const input = [
      target("routine", "routine_observation"),
      target("watch-medium", "watch_today", {
        highestAlertSeverity: "medium",
        latestAdverseEvidenceAt: "2026-08-07T09:00:00.000Z",
      }),
      target("watch-high-old", "watch_today", {
        highestAlertSeverity: "high",
        latestAdverseEvidenceAt: "2026-08-07T08:00:00.000Z",
      }),
      target("watch-high-new", "watch_today", {
        highestAlertSeverity: "high",
        latestAdverseEvidenceAt: "2026-08-07T10:00:00.000Z",
      }),
      target("immediate", "immediate_physical_verification"),
      target("insufficient", "insufficient_evidence"),
    ];

    expect(sortGrowWalkTargets(input).map((row) => row.targetId)).toEqual([
      "immediate",
      "watch-high-new",
      "watch-high-old",
      "watch-medium",
      "routine",
      "insufficient",
    ]);
    expect(input.map((row) => row.targetId)).toEqual([
      "routine",
      "watch-medium",
      "watch-high-old",
      "watch-high-new",
      "immediate",
      "insufficient",
    ]);
  });

  it("puts null adverse timestamps after real timestamps within the same band", () => {
    const sorted = sortGrowWalkTargets([
      target("null-time", "watch_today", { displayName: "Alpha" }),
      target("real-time", "watch_today", {
        displayName: "Zulu",
        latestAdverseEvidenceAt: "2026-08-07T10:00:00.000Z",
      }),
    ]);
    expect(sorted.map((row) => row.targetId)).toEqual(["real-time", "null-time"]);
  });

  it("uses display name and target id as deterministic final tie-breakers", () => {
    const sorted = sortGrowWalkTargets([
      target("b-id", "routine_observation", { displayName: "Same" }),
      target("a-id", "routine_observation", { displayName: "Same" }),
      target("z-id", "routine_observation", { displayName: "Alpha" }),
    ]);
    expect(sorted.map((row) => row.targetId)).toEqual(["z-id", "a-id", "b-id"]);
  });
});
