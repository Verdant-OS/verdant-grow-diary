import { describe, expect, it } from "vitest";

import type { GrowWalkEvidenceDerivation, GrowWalkTarget } from "@/lib/growWalkContracts";
import { deriveGrowWalkAttentionBand, sortGrowWalkTargets } from "@/lib/growWalkAttentionRules";

function derivation(extra: Partial<GrowWalkEvidenceDerivation> = {}): GrowWalkEvidenceDerivation {
  return {
    reasonCodes: [],
    missingEvidenceCodes: [],
    contradictionCodes: [],
    recentMajorChangeCount48h: 0,
    latestMajorChangeAt: null,
    latestObservationAt: null,
    latestAdverseEvidenceAt: null,
    evidenceConfidence: "high",
    ...extra,
  };
}

function target(
  targetId: string,
  attentionBand: GrowWalkTarget["attentionBand"],
  extra: Partial<GrowWalkTarget> = {},
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
    targetArchived: false,
    summaryComplete: true,
    ...extra,
  };
}

describe("Grow Walk attention", () => {
  it("requires corroboration before immediate physical verification", () => {
    expect(deriveGrowWalkAttentionBand(derivation())).toBe("routine_observation");
    expect(deriveGrowWalkAttentionBand(derivation({ evidenceConfidence: "low" }))).toBe(
      "insufficient_evidence",
    );
    expect(
      deriveGrowWalkAttentionBand(
        derivation({ reasonCodes: ["active_high_alert_needs_confirmation"] }),
      ),
    ).toBe("watch_today");
    expect(
      deriveGrowWalkAttentionBand(
        derivation({ reasonCodes: ["active_medium_alert_needs_review"] }),
      ),
    ).toBe("watch_today");
    expect(
      deriveGrowWalkAttentionBand(derivation({ reasonCodes: ["active_low_alert_needs_review"] })),
    ).toBe("watch_today");
    expect(
      deriveGrowWalkAttentionBand(
        derivation({
          reasonCodes: ["active_high_alert_needs_confirmation", "multiple_adverse_evidence_lanes"],
        }),
      ),
    ).toBe("immediate_physical_verification");
  });

  it("sorts without mutating input and uses deterministic tie-breakers", () => {
    const input = [
      target("routine", "routine_observation"),
      target("watch-old", "watch_today", {
        highestAlertSeverity: "high",
        latestAdverseEvidenceAt: "2026-08-07T08:00:00.000Z",
      }),
      target("watch-new", "watch_today", {
        highestAlertSeverity: "high",
        latestAdverseEvidenceAt: "2026-08-07T10:00:00.000Z",
      }),
      target("immediate", "immediate_physical_verification"),
    ];
    expect(sortGrowWalkTargets(input).map((row) => row.targetId)).toEqual([
      "immediate",
      "watch-new",
      "watch-old",
      "routine",
    ]);
    expect(input.map((row) => row.targetId)).toEqual([
      "routine",
      "watch-old",
      "watch-new",
      "immediate",
    ]);
  });
});
