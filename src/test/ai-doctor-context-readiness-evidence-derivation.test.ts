/**
 * Evidence-derivation tests for the AI Doctor readiness view-model.
 *
 * Verifies that watering, feeding, photo, open-alert, and unknown
 * stage/medium/pot-size evidence flags are derived purely from the
 * existing AI Doctor context payload (plus the open-alerts count
 * already threaded into the view-model). No caller-supplied extras,
 * no schema changes, no AI calls.
 */
import { describe, it, expect } from "vitest";
import {
  buildAiDoctorReadinessView,
  deriveAiDoctorContextEvidenceFlags,
  AI_DOCTOR_CONFIDENCE_CLASS_COPY,
} from "@/lib/aiDoctorReadinessViewModel";
import { compileAiDoctorContextFromRows } from "@/lib/aiDoctorEngine";

const NOW = new Date("2026-06-10T12:00:00Z");
const HOUR = 3600 * 1000;
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

function ctx(opts: {
  stage?: string | null;
  growEvents?: ReadonlyArray<Record<string, unknown>>;
  sensorReadings?: ReadonlyArray<Record<string, unknown>>;
}) {
  return compileAiDoctorContextFromRows({
    plant: {
      id: "p1",
      name: "Plant A",
      strain: "Northern Lights",
      stage: opts.stage === undefined ? "veg" : opts.stage,
      grow_id: "g1",
      tent_id: "t1",
    },
    growEvents: opts.growEvents ?? [],
    sensorReadings: opts.sensorReadings ?? [],
    now: NOW,
  });
}

describe("deriveAiDoctorContextEvidenceFlags", () => {
  it("derives watering from event_type containing 'water'", () => {
    const flags = deriveAiDoctorContextEvidenceFlags(
      ctx({
        growEvents: [
          { occurred_at: ago(2 * HOUR), event_type: "watering", source: "manual" },
        ],
      }),
      0,
    );
    expect(flags.hasRecentWatering).toBe(true);
    expect(flags.hasRecentFeeding).toBe(false);
    expect(flags.hasRecentPhoto).toBe(false);
  });

  it("derives feeding from event_type containing 'feed' or 'nutrient'", () => {
    const flags = deriveAiDoctorContextEvidenceFlags(
      ctx({
        growEvents: [
          { occurred_at: ago(3 * HOUR), event_type: "feeding", source: "manual" },
          { occurred_at: ago(5 * HOUR), event_type: "nutrient_top_up", source: "manual" },
        ],
      }),
      0,
    );
    expect(flags.hasRecentFeeding).toBe(true);
  });

  it("derives recent photo from event_type containing 'photo'", () => {
    const flags = deriveAiDoctorContextEvidenceFlags(
      ctx({
        growEvents: [
          { occurred_at: ago(HOUR), event_type: "photo", source: "manual" },
        ],
      }),
      0,
    );
    expect(flags.hasRecentPhoto).toBe(true);
  });

  it("derives alert evidence from the open-alerts count, not caller extras", () => {
    const c = ctx({});
    expect(deriveAiDoctorContextEvidenceFlags(c, 0).hasOpenAlerts).toBe(false);
    expect(deriveAiDoctorContextEvidenceFlags(c, 2).hasOpenAlerts).toBe(true);
  });

  it("flags unknown stage / medium / pot size from context", () => {
    const flags = deriveAiDoctorContextEvidenceFlags(ctx({ stage: null }), 0);
    expect(flags.hasUnknownStage).toBe(true);
    // Medium + pot size are not on the Phase 1 payload — surfaced as unknown
    // so the panel can prompt the grower, never inferred.
    expect(flags.hasUnknownMedium).toBe(true);
    expect(flags.hasUnknownPotSize).toBe(true);
  });
});

describe("buildAiDoctorReadinessView confidence class", () => {
  it("classifies trustworthy live + recent events as 'ready'", () => {
    const v = buildAiDoctorReadinessView({
      context: ctx({
        growEvents: [
          { occurred_at: ago(HOUR), event_type: "watering", source: "manual" },
        ],
        sensorReadings: [
          { metric: "temperature_c", value: 24, captured_at: ago(HOUR), source: "live" },
          { metric: "humidity_pct", value: 55, captured_at: ago(HOUR), source: "live" },
        ],
      }),
      openAlertsCount: 0,
    });
    expect(v.confidenceClass).toBe("ready");
    expect(v.confidenceClassCopy).toBe(AI_DOCTOR_CONFIDENCE_CLASS_COPY.ready);
  });

  it("classifies stale-only telemetry as 'not_trustworthy' and never as healthy live", () => {
    const v = buildAiDoctorReadinessView({
      context: ctx({
        sensorReadings: [
          { metric: "temperature_c", value: 24, captured_at: ago(HOUR), source: "stale" },
        ],
      }),
      openAlertsCount: 0,
    });
    expect(v.confidenceClass).toBe("not_trustworthy");
    expect(v.confidenceClassCopy).toBe(
      AI_DOCTOR_CONFIDENCE_CLASS_COPY.not_trustworthy,
    );
    // Stale source must surface as stale (not promoted to live).
    expect(v.sourceBadges.find((b) => b.source === "stale")?.isTrustworthy).toBe(
      false,
    );
    expect(v.sourceBadges.find((b) => b.source === "live")).toBeUndefined();
  });

  it("classifies demo-only telemetry as 'not_trustworthy'", () => {
    const v = buildAiDoctorReadinessView({
      context: ctx({
        sensorReadings: [
          { metric: "temperature_c", value: 24, captured_at: ago(HOUR), source: "demo" },
        ],
      }),
      openAlertsCount: 0,
    });
    expect(v.confidenceClass).toBe("not_trustworthy");
  });

  it("classifies missing-sensor / sparse context as 'limited' (not blocking)", () => {
    const v = buildAiDoctorReadinessView({
      context: ctx({}),
      openAlertsCount: 0,
    });
    expect(["limited"]).toContain(v.confidenceClass);
    expect(v.confidenceClassCopy).toBe(AI_DOCTOR_CONFIDENCE_CLASS_COPY.limited);
  });

  it("exposes evidenceFlags on the view", () => {
    const v = buildAiDoctorReadinessView({
      context: ctx({
        growEvents: [
          { occurred_at: ago(HOUR), event_type: "watering", source: "manual" },
        ],
      }),
      openAlertsCount: 1,
    });
    expect(v.evidenceFlags.hasRecentWatering).toBe(true);
    expect(v.evidenceFlags.hasRecentFeeding).toBe(false);
    expect(v.evidenceFlags.hasRecentPhoto).toBe(false);
    expect(v.evidenceFlags.hasOpenAlerts).toBe(true);
  });
});
