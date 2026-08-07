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
  options: Partial<GrowWalkEventEvidence> = {},
): GrowWalkEventEvidence {
  return {
    id,
    eventType,
    occurredAt,
    source: "manual",
    noteExcerpt: null,
    isMajorChange: false,
    response: null,
    ...options,
  };
}

function photo(id: string, capturedAt: string): GrowWalkPhotoMetadata {
  return {
    id,
    capturedAt,
    source: "manual",
    inspectedInThisRun: false,
  };
}

function alert(options: Partial<GrowWalkAlertEvidence> = {}): GrowWalkAlertEvidence {
  return {
    id: "alert-1",
    title: "Humidity needs confirmation",
    reasonExcerpt: "Recent humidity evidence crossed the configured alert threshold.",
    severity: "high",
    status: "open",
    metric: "humidity_pct",
    source: "live",
    lastSeenAt: "2026-08-07T11:45:00.000Z",
    ...options,
  };
}

function sensors(
  overrides: Partial<GrowWalkSensorEvidence> = {},
): GrowWalkSensorEvidence {
  return {
    available: true,
    readings: {
      humidity_pct: {
        id: "reading-1",
        tent_id: "tent-1",
        metric: "humidity_pct",
        value: 58,
        quality: "ok",
        source: "live",
        ts: "2026-08-07T11:50:00.000Z",
        captured_at: "2026-08-07T11:50:00.000Z",
        freshness: "fresh",
        current_live: true,
      },
    },
    contradictionMetrics: [],
    ...overrides,
  };
}

function derive(
  overrides: Partial<Parameters<typeof deriveGrowWalkEvidence>[0]> = {},
) {
  return deriveGrowWalkEvidence({
    now: NOW,
    stage: "flower",
    plantStatus: "healthy",
    plantType: "photoperiod",
    medium: "coco",
    potSize: "5 gal",
    recentEvents: [event("obs-1", "observation", "2026-08-07T10:00:00.000Z")],
    sensors: sensors(),
    photos: [photo("photo-1", "2026-08-07T10:30:00.000Z")],
    alerts: [],
    aiDoctor: null,
    ...overrides,
  });
}

describe("deriveGrowWalkEvidence", () => {
  it("detects stacked major changes and a missing post-intervention observation", () => {
    const result = derive({
      recentEvents: [
        event("obs-before", "observation", "2026-08-05T10:00:00.000Z"),
        event("water", "watering", "2026-08-06T08:00:00.000Z", { isMajorChange: true }),
        event("feed", "feeding", "2026-08-06T18:00:00.000Z", { isMajorChange: true }),
        event("train", "training", "2026-08-07T08:00:00.000Z", { isMajorChange: true }),
      ],
    });

    expect(result.recentMajorChangeCount48h).toBe(3);
    expect(result.latestMajorChangeAt).toBe("2026-08-07T08:00:00.000Z");
    expect(result.reasonCodes).toContain("stacked_major_changes_48h");
    expect(result.reasonCodes).toContain("missing_post_intervention_observation");
    expect(result.missingEvidenceCodes).toContain("no_post_intervention_observation");
  });

  it("uses a later observation as post-intervention evidence", () => {
    const result = derive({
      recentEvents: [
        event("water", "watering", "2026-08-07T08:00:00.000Z", { isMajorChange: true }),
        event("obs-after", "observation", "2026-08-07T10:00:00.000Z"),
      ],
    });

    expect(result.latestMajorChangeAt).toBe("2026-08-07T08:00:00.000Z");
    expect(result.latestObservationAt).toBe("2026-08-07T10:00:00.000Z");
    expect(result.reasonCodes).not.toContain("missing_post_intervention_observation");
    expect(result.missingEvidenceCodes).not.toContain("no_post_intervention_observation");
  });

  it("records worsening observations as adverse evidence without diagnosing", () => {
    const result = derive({
      recentEvents: [
        event("worse", "response", "2026-08-07T11:00:00.000Z", {
          response: "worse",
          noteExcerpt: "Leaves look less upright than this morning.",
        }),
      ],
    });

    expect(result.reasonCodes).toContain("worsening_observation");
    expect(result.latestAdverseEvidenceAt).toBe("2026-08-07T11:00:00.000Z");
    expect(JSON.stringify(result)).not.toMatch(/deficien|overwater|disease|diagnos/i);
  });

  it("treats photo rows as metadata rather than inspected visual evidence", () => {
    const result = derive({
      photos: [photo("photo-1", "2026-08-07T11:00:00.000Z")],
    });

    expect(result.missingEvidenceCodes).toContain("no_current_visual_evidence");
  });

  it("flags a photo that predates the latest major intervention", () => {
    const result = derive({
      recentEvents: [
        event("water", "watering", "2026-08-07T10:00:00.000Z", { isMajorChange: true }),
        event("obs", "observation", "2026-08-07T11:00:00.000Z"),
      ],
      photos: [photo("photo-before", "2026-08-07T09:00:00.000Z")],
    });

    expect(result.missingEvidenceCodes).toContain("photo_predates_latest_major_change");
  });

  it("keeps unavailable and non-live sensor lanes explicit", () => {
    const unavailable = derive({ sensors: sensors({ available: false, readings: {} }) });
    expect(unavailable.missingEvidenceCodes).toContain("sensor_lane_unavailable");
    expect(unavailable.evidenceConfidence).toBe("low");

    const manualOnly = derive({
      sensors: sensors({
        readings: {
          humidity_pct: {
            id: "manual-1",
            tent_id: "tent-1",
            metric: "humidity_pct",
            value: 58,
            quality: "ok",
            source: "manual",
            ts: "2026-08-07T11:50:00.000Z",
            captured_at: "2026-08-07T11:50:00.000Z",
            freshness: "fresh",
            current_live: false,
          },
        },
      }),
    });
    expect(manualOnly.missingEvidenceCodes).toContain("sensor_lane_not_current_live");
  });

  it("flags stale or invalid telemetry only as a problem-period reason", () => {
    const result = derive({
      alerts: [alert()],
      sensors: sensors({
        readings: {
          humidity_pct: {
            id: "stale-1",
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
    });

    expect(result.reasonCodes).toContain("stale_or_invalid_sensor_during_problem");
    expect(result.missingEvidenceCodes).toContain("sensor_lane_not_current_live");
  });

  it("surfaces sensor contradictions and lowers confidence", () => {
    const result = derive({
      sensors: sensors({ contradictionMetrics: ["humidity_pct"] }),
    });

    expect(result.reasonCodes).toContain("contradictory_evidence");
    expect(result.contradictionCodes).toContain("sensor_sources_disagree");
    expect(result.evidenceConfidence).toBe("low");
  });

  it("treats malformed and future evidence timestamps as contradictions", () => {
    const malformed = derive({
      recentEvents: [event("bad", "observation", "not-a-date")],
    });
    expect(malformed.contradictionCodes).toContain("future_or_malformed_timestamp");

    const future = derive({
      recentEvents: [event("future", "observation", "2026-08-08T12:00:00.000Z")],
    });
    expect(future.contradictionCodes).toContain("future_or_malformed_timestamp");
  });

  it("names stale plant memory and incomplete profile context", () => {
    const result = derive({
      stage: null,
      medium: null,
      potSize: null,
      recentEvents: [event("old", "observation", "2026-08-05T00:00:00.000Z")],
    });

    expect(result.missingEvidenceCodes).toContain("no_recent_grower_log");
    expect(result.missingEvidenceCodes).toContain("plant_profile_incomplete");
  });

  it("recognizes flower humidity alerts as inspection evidence, not equipment instructions", () => {
    const result = derive({ alerts: [alert()] });

    expect(result.reasonCodes).toContain("active_high_alert_needs_confirmation");
    expect(result.reasonCodes).toContain("flower_humidity_alert_needs_inspection");
    expect(JSON.stringify(result)).not.toMatch(/setpoint|turn on|increase fan|dehumidifier/i);
  });

  it("is deterministic and emits closed codes without duplicates", () => {
    const input = {
      recentEvents: [
        event("water", "watering", "2026-08-07T08:00:00.000Z", { isMajorChange: true }),
      ],
      sensors: sensors({ contradictionMetrics: ["humidity_pct"] }),
      alerts: [alert()],
    };
    const first = derive(input);
    const second = derive(input);

    expect(first).toEqual(second);
    expect(new Set(first.reasonCodes).size).toBe(first.reasonCodes.length);
    expect(new Set(first.missingEvidenceCodes).size).toBe(first.missingEvidenceCodes.length);
    expect(new Set(first.contradictionCodes).size).toBe(first.contradictionCodes.length);
  });
});
