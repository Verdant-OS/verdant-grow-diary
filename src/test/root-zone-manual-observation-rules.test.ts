import { describe, expect, it } from "vitest";
import {
  ROOT_ZONE_DRAINAGE_OBSERVATIONS,
  ROOT_ZONE_MANUAL_OBSERVATION_DETAILS_KEY,
  ROOT_ZONE_MANUAL_OBSERVATION_MAX_EVENT_SKEW_MS,
  ROOT_ZONE_MEDIUM_SURFACES,
  ROOT_ZONE_POT_WEIGHT_FEELS,
  buildRootZoneManualObservationEnvelopeV1,
  normalizeRootZoneManualObservationEnvelopeV1,
  projectRootZoneManualObservationFromDetails,
  type RootZoneManualObservationEnvelopeV1,
} from "@/lib/rootZoneManualObservationRules";

const OBSERVED_AT = "2026-07-20T10:30:00.000Z";

function envelope(
  patch: Partial<RootZoneManualObservationEnvelopeV1> = {},
): RootZoneManualObservationEnvelopeV1 {
  return {
    schema_version: 1,
    source: "manual",
    evidence_type: "root_zone_manual_observation",
    advisory_only: true,
    observed_at: OBSERVED_AT,
    pot_weight_feel: "light",
    ...patch,
  };
}

describe("root-zone manual observation envelope", () => {
  it("exports one frozen categorical vocabulary for writers and readers", () => {
    expect(ROOT_ZONE_POT_WEIGHT_FEELS).toEqual(["light", "moderate", "heavy"]);
    expect(ROOT_ZONE_MEDIUM_SURFACES).toEqual(["dry", "moist", "wet"]);
    expect(ROOT_ZONE_DRAINAGE_OBSERVATIONS).toEqual(["normal", "slow", "none"]);
    expect(Object.isFrozen(ROOT_ZONE_POT_WEIGHT_FEELS)).toBe(true);
    expect(Object.isFrozen(ROOT_ZONE_MEDIUM_SURFACES)).toBe(true);
    expect(Object.isFrozen(ROOT_ZONE_DRAINAGE_OBSERVATIONS)).toBe(true);
  });

  it("builds the exact snake_case storage envelope and normalizes a bounded camelCase view", () => {
    const input = {
      observedAt: OBSERVED_AT,
      potWeightFeel: "moderate" as const,
      mediumSurface: "moist" as const,
      drainage: "slow" as const,
    };
    const before = structuredClone(input);
    const first = buildRootZoneManualObservationEnvelopeV1(input);
    const second = buildRootZoneManualObservationEnvelopeV1(input);

    expect(first).toEqual({
      schema_version: 1,
      source: "manual",
      evidence_type: "root_zone_manual_observation",
      advisory_only: true,
      observed_at: OBSERVED_AT,
      pot_weight_feel: "moderate",
      medium_surface: "moist",
      drainage: "slow",
    });
    expect(second).toEqual(first);
    expect(input).toEqual(before);
    expect(Object.isFrozen(first)).toBe(true);
    expect(normalizeRootZoneManualObservationEnvelopeV1(first)).toEqual({
      observedAt: OBSERVED_AT,
      source: "manual",
      advisoryOnly: true,
      potWeightFeel: "moderate",
      mediumSurface: "moist",
      drainage: "slow",
    });
  });

  it("accepts any non-empty subset without inventing omitted labels", () => {
    const built = buildRootZoneManualObservationEnvelopeV1({
      observedAt: OBSERVED_AT,
      drainage: "none",
    });

    expect(built).toEqual({
      schema_version: 1,
      source: "manual",
      evidence_type: "root_zone_manual_observation",
      advisory_only: true,
      observed_at: OBSERVED_AT,
      drainage: "none",
    });
    expect(normalizeRootZoneManualObservationEnvelopeV1(built)).toEqual({
      observedAt: OBSERVED_AT,
      source: "manual",
      advisoryOnly: true,
      drainage: "none",
    });
  });

  it("rejects empty, malformed, secret-like, non-manual, and non-advisory envelopes", () => {
    const cases: unknown[] = [
      null,
      [],
      envelope({ pot_weight_feel: undefined }),
      envelope({ schema_version: 2 as 1 }),
      envelope({ source: "live" as "manual" }),
      envelope({ evidence_type: "sensor_reading" as "root_zone_manual_observation" }),
      envelope({ advisory_only: false as true }),
      envelope({ observed_at: "2026-07-20T10:30:00Z" }),
      envelope({ observed_at: "not-a-date" }),
      envelope({ pot_weight_feel: "api_key=leak-marker" as "light" }),
      { ...envelope(), unexpected: true },
    ];

    for (const value of cases) {
      expect(() => normalizeRootZoneManualObservationEnvelopeV1(value)).not.toThrow();
      expect(normalizeRootZoneManualObservationEnvelopeV1(value)).toBeNull();
    }
    expect(buildRootZoneManualObservationEnvelopeV1({ observedAt: OBSERVED_AT })).toBeNull();
  });
});

describe("root-zone manual observation details projection", () => {
  it("preserves legacy or unrelated details as absent", () => {
    expect(projectRootZoneManualObservationFromDetails(null, OBSERVED_AT)).toEqual({
      status: "absent",
    });
    expect(
      projectRootZoneManualObservationFromDetails(
        { linked_grow_event_id: "event-1", retained: true },
        OBSERVED_AT,
      ),
    ).toEqual({ status: "absent" });
  });

  it("projects valid exact-time evidence without leaking the storage envelope", () => {
    const details = {
      linked_grow_event_id: "event-1",
      [ROOT_ZONE_MANUAL_OBSERVATION_DETAILS_KEY]: envelope({
        medium_surface: "dry",
        drainage: "normal",
      }),
      sensor_snapshot: { bridge_token: "must-not-project" },
    };

    expect(projectRootZoneManualObservationFromDetails(details, OBSERVED_AT)).toEqual({
      status: "valid",
      manualObservation: {
        observedAt: OBSERVED_AT,
        source: "manual",
        advisoryOnly: true,
        potWeightFeel: "light",
        mediumSurface: "dry",
        drainage: "normal",
      },
    });
    expect(
      JSON.stringify(projectRootZoneManualObservationFromDetails(details, OBSERVED_AT)),
    ).not.toMatch(/linked_grow_event_id|sensor_snapshot|bridge_token|schema_version/i);
  });

  it("uses one deterministic exact-instant alignment boundary", () => {
    const details = {
      [ROOT_ZONE_MANUAL_OBSERVATION_DETAILS_KEY]: envelope(),
    };
    expect(ROOT_ZONE_MANUAL_OBSERVATION_MAX_EVENT_SKEW_MS).toBe(0);
    expect(projectRootZoneManualObservationFromDetails(details, OBSERVED_AT).status).toBe("valid");
    expect(
      projectRootZoneManualObservationFromDetails(details, "2026-07-20T10:30:00.001Z"),
    ).toEqual({ status: "invalid" });
  });

  it("fails closed without throwing on hostile details access", () => {
    const hostile: Record<string, unknown> = {};
    Object.defineProperty(hostile, ROOT_ZONE_MANUAL_OBSERVATION_DETAILS_KEY, {
      enumerable: true,
      get() {
        throw new Error("untrusted getter");
      },
    });
    expect(() => projectRootZoneManualObservationFromDetails(hostile, OBSERVED_AT)).not.toThrow();
    expect(projectRootZoneManualObservationFromDetails(hostile, OBSERVED_AT)).toEqual({
      status: "invalid",
    });
  });
});
