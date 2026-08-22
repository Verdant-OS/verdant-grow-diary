import { describe, expect, it } from "vitest";

import type {
  GrowWalkAlertEvidence,
  GrowWalkEventEvidence,
  GrowWalkPhotoMetadata,
  GrowWalkSensorEvidence,
} from "@/lib/growWalkContracts";
import { deriveGrowWalkEvidence } from "@/lib/growWalkEvidenceRules";

const NOW = "2026-08-07T12:00:00.000Z";

function event(
  id: string,
  eventType: string,
  occurredAt: string,
  extra: Partial<GrowWalkEventEvidence> = {},
): GrowWalkEventEvidence {
  return {
    id,
    eventType,
    occurredAt,
    source: "manual",
    noteExcerpt: null,
    isMajorChange: false,
    response: null,
    ...extra,
  };
}

function sensors(extra: Partial<GrowWalkSensorEvidence> = {}): GrowWalkSensorEvidence {
  return {
    available: true,
    readings: {
      humidity_pct: {
        id: "sensor-1",
        tent_id: "tent-1",
        metric: "humidity_pct",
        value: 60,
        quality: "ok",
        source: "live",
        ts: "2026-08-07T11:50:00.000Z",
        captured_at: "2026-08-07T11:50:00.000Z",
        freshness: "fresh",
        current_live: true,
      },
    },
    contradictionMetrics: [],
    ...extra,
  };
}

function derive(overrides: Partial<Parameters<typeof deriveGrowWalkEvidence>[0]> = {}) {
  const photos: readonly GrowWalkPhotoMetadata[] = [
    {
      id: "photo-1",
      capturedAt: "2026-08-07T10:00:00.000Z",
      source: "diary",
      inspectedInThisRun: false,
    },
  ];
  const alerts: readonly GrowWalkAlertEvidence[] = [];
  return deriveGrowWalkEvidence({
    now: NOW,
    stage: "flower",
    plantStatus: "healthy",
    plantType: "photoperiod",
    medium: "coco",
    potSize: "5 gal",
    recentEvents: [event("observation-1", "observation", "2026-08-07T11:00:00.000Z")],
    sensors: sensors(),
    photos,
    alerts,
    aiDoctor: null,
    ...overrides,
  });
}

describe("deriveGrowWalkEvidence", () => {
  it("marks stacked changes and missing post-change observation without prescribing treatment", () => {
    const result = derive({
      recentEvents: [
        event("water", "watering", "2026-08-06T08:00:00.000Z", { isMajorChange: true }),
        event("feed", "feeding", "2026-08-06T18:00:00.000Z", { isMajorChange: true }),
        event("train", "training", "2026-08-07T08:00:00.000Z", { isMajorChange: true }),
      ],
    });
    expect(result.recentMajorChangeCount48h).toBe(3);
    expect(result.reasonCodes).toContain("stacked_major_changes_48h");
    expect(result.missingEvidenceCodes).toContain("no_post_intervention_observation");
    expect(JSON.stringify(result)).not.toMatch(/deficien|overwater|disease|setpoint/i);
  });

  it("uses fixed-window support only for the 36/48-hour log and major-change rules", () => {
    const result = derive({
      recentEvents: [],
      fixedWindowEvents: [
        event("water-30h", "watering", "2026-08-06T06:00:00.000Z", { isMajorChange: true }),
        event("worse-30h", "observation", "2026-08-06T06:05:00.000Z", { response: "worse" }),
      ],
    });

    expect(result.missingEvidenceCodes).not.toContain("no_recent_grower_log");
    expect(result.recentMajorChangeCount48h).toBe(1);
    expect(result.latestMajorChangeAt).toBe("2026-08-06T06:00:00.000Z");
    expect(result.latestObservationAt).toBeNull();
    expect(result.reasonCodes).not.toContain("worsening_observation");
    expect(result.missingEvidenceCodes).not.toContain("no_post_intervention_observation");
  });

  it("requires a post-intervention observation after a fixed-window major change", () => {
    const result = derive({
      recentEvents: [],
      fixedWindowEvents: [
        event("water-30h", "watering", "2026-08-06T06:00:00.000Z", { isMajorChange: true }),
      ],
    });

    expect(result.missingEvidenceCodes).toContain("no_post_intervention_observation");
  });

  it("fails closed for bad timestamps and stale, adverse telemetry", () => {
    const result = derive({
      recentEvents: [event("future", "observation", "2026-08-08T12:00:00.000Z")],
      sensors: sensors({
        readings: {
          humidity_pct: {
            id: "sensor-stale",
            tent_id: "tent-1",
            metric: "humidity_pct",
            value: 91,
            quality: "stale",
            source: "stale",
            ts: "2026-08-06T08:00:00.000Z",
            captured_at: "2026-08-06T08:00:00.000Z",
            freshness: "stale",
            current_live: false,
          },
        },
      }),
      alerts: [
        {
          id: "alert-1",
          title: "High humidity",
          reasonExcerpt: "Needs physical confirmation.",
          severity: "high",
          status: "open",
          metric: "humidity_pct",
          source: "live",
          lastSeenAt: "2026-08-07T11:45:00.000Z",
        },
      ],
    });
    expect(result.contradictionCodes).toContain("future_or_malformed_timestamp");
    expect(result.reasonCodes).toContain("stale_or_invalid_sensor_during_problem");
    expect(result.evidenceConfidence).toBe("low");
  });

  it("is deterministic and keeps photo records metadata-only", () => {
    const input = { sensors: sensors({ contradictionMetrics: ["humidity_pct"] }) };
    const first = derive(input);
    const second = derive(input);
    expect(first).toEqual(second);
    expect(first.missingEvidenceCodes).toContain("no_current_visual_evidence");
    expect(first.contradictionCodes).toContain("sensor_sources_disagree");
  });
});
