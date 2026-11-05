/**
 * AI-DOCTOR-EDGE-AUDIT gap G1 (2026-11-05): ai-doctor-review trusted the
 * browser's `stale`, `trust` and `missingLiveSensorReadings` labels. The
 * server now re-derives freshness from the capture time and its own clock,
 * downgrade-only.
 */
import { describe, expect, it } from "vitest";
import {
  AI_DOCTOR_SERVER_FUTURE_SNAPSHOT_NOTE,
  AI_DOCTOR_SERVER_STALE_SNAPSHOT_NOTE,
  AI_DOCTOR_SERVER_UNVERIFIED_SNAPSHOT_NOTE,
  applyServerFreshnessToPacket,
  classifyServerSnapshotFreshness,
} from "@/lib/aiDoctorPacketServerFreshnessRules";
import { validateAiDoctorReviewGrounding } from "@/lib/aiDoctorReviewGroundingRules";
import { buildAiDoctorPromptMessages } from "@/lib/aiDoctorPromptAssembly";
import type { AiDoctorReviewRequestPacket } from "@/lib/aiDoctorReviewRequestPacket";

const NOW = new Date("2026-11-05T18:00:00.000Z");
const MIN = 60 * 1000;
const HOUR = 60 * MIN;

function iso(msBeforeNow: number): string {
  return new Date(NOW.getTime() - msBeforeNow).toISOString();
}

function packet(
  source: "live" | "manual" | "csv" | "demo" | "stale" | "invalid" | "unknown",
  capturedAt: string,
  overrides: Partial<AiDoctorReviewRequestPacket> = {},
): AiDoctorReviewRequestPacket {
  return {
    schemaVersion: 1,
    plant: { strain: null, stage: "flowering", medium: null, potSize: null },
    readiness: { state: "strong", evidence: ["Recent sensor snapshot"], missing: [] },
    recentEvents: [],
    recentSensorSnapshot: {
      capturedAt,
      severity: "ok",
      readings: [
        { field: "temperature_c", value: 24, unit: "C" },
        { field: "humidity_pct", value: 50, unit: "%" },
      ],
    },
    recentSensorSnapshotAnnotation: {
      line: `LATEST_SENSOR_SNAPSHOT [source=${source}, stale=false, trust=high]: temp=24°C, humidity=50%`,
      source,
      stale: false,
      trust: "high",
      includesValues: true,
      safetyNotes: [],
      missingInformationHints: [],
    },
    missingLiveSensorReadings: false,
    ...overrides,
  };
}

const HEALTHY_RESULT = {
  summary: "The environment is stable.",
  likely_issue: "No clear issue.",
  confidence: "medium" as const,
  evidence: ["Humidity 50% is within the flowering target range."],
  missing_information: [],
  possible_causes: ["Normal growth."],
  immediate_action: "Keep logging.",
  what_not_to_do: "Do not change feeding from one reading.",
  twenty_four_hour_follow_up: "Log another reading.",
  three_day_recovery_plan: "Keep observing.",
  risk_level: "low" as const,
};

describe("classifyServerSnapshotFreshness", () => {
  it("uses the live 15-minute window, strict >", () => {
    expect(classifyServerSnapshotFreshness("live", iso(15 * MIN), NOW)).toBe("fresh");
    expect(classifyServerSnapshotFreshness("live", iso(15 * MIN + 1), NOW)).toBe("stale");
  });

  it("uses the manual 24-hour window", () => {
    expect(classifyServerSnapshotFreshness("manual", iso(23 * HOUR), NOW)).toBe("fresh");
    expect(classifyServerSnapshotFreshness("manual", iso(24 * HOUR + 1), NOW)).toBe("stale");
  });

  it("allows 5 minutes of clock skew, then calls a capture time in the future", () => {
    expect(classifyServerSnapshotFreshness("live", iso(-5 * MIN), NOW)).toBe("fresh");
    expect(classifyServerSnapshotFreshness("live", iso(-5 * MIN - 1), NOW)).toBe("future");
  });

  it("cannot verify an unparseable capture time", () => {
    expect(classifyServerSnapshotFreshness("live", "not-a-time", NOW)).toBe("unverifiable");
  });
});

describe("applyServerFreshnessToPacket", () => {
  it("downgrades a live snapshot the browser called fresh when the server clock says stale", () => {
    const out = applyServerFreshnessToPacket(packet("live", iso(3 * HOUR)), NOW);
    const annotation = out.recentSensorSnapshotAnnotation!;
    expect(annotation.source).toBe("live");
    expect(annotation.stale).toBe(true);
    expect(annotation.trust).toBe("low");
    expect(annotation.line).toBe(
      "LATEST_SENSOR_SNAPSHOT [source=live, stale=true, trust=low]: temp=24°C, humidity=50% (stale: readings may not reflect current tent conditions)",
    );
    expect(annotation.safetyNotes).toEqual([AI_DOCTOR_SERVER_STALE_SNAPSHOT_NOTE]);
    expect(out.missingLiveSensorReadings).toBe(true);
  });

  it("downgrades a stale manual snapshot without relabeling it", () => {
    const out = applyServerFreshnessToPacket(packet("manual", iso(2 * 24 * HOUR)), NOW);
    expect(out.recentSensorSnapshotAnnotation).toMatchObject({
      source: "manual",
      stale: true,
      trust: "low",
    });
  });

  it("downgrades a capture time in the future and an unreadable one", () => {
    const future = applyServerFreshnessToPacket(packet("live", iso(-HOUR)), NOW);
    expect(future.recentSensorSnapshotAnnotation!.stale).toBe(true);
    expect(future.recentSensorSnapshotAnnotation!.safetyNotes).toEqual([
      AI_DOCTOR_SERVER_FUTURE_SNAPSHOT_NOTE,
    ]);
    const broken = applyServerFreshnessToPacket(packet("live", "garbage"), NOW);
    expect(broken.recentSensorSnapshotAnnotation!.safetyNotes).toEqual([
      AI_DOCTOR_SERVER_UNVERIFIED_SNAPSHOT_NOTE,
    ]);
    expect(broken.missingLiveSensorReadings).toBe(true);
  });

  it("keeps a fresh live snapshot unchanged and lets it clear the missing-live flag", () => {
    const input = packet("live", iso(5 * MIN));
    const out = applyServerFreshnessToPacket(input, NOW);
    expect(out.recentSensorSnapshotAnnotation).toBe(input.recentSensorSnapshotAnnotation);
    expect(out.missingLiveSensorReadings).toBe(false);
  });

  it("never clears missing-live when the browser already set it", () => {
    const out = applyServerFreshnessToPacket(
      packet("live", iso(5 * MIN), { missingLiveSensorReadings: true }),
      NOW,
    );
    expect(out.missingLiveSensorReadings).toBe(true);
  });

  it("forces missing-live for a fresh manual snapshot, which is never live", () => {
    const out = applyServerFreshnessToPacket(packet("manual", iso(HOUR)), NOW);
    expect(out.recentSensorSnapshotAnnotation!.stale).toBe(false);
    expect(out.missingLiveSensorReadings).toBe(true);
  });

  it("treats a snapshot sent without a source label as not live", () => {
    const input = packet("live", iso(MIN));
    delete input.recentSensorSnapshotAnnotation;
    delete input.missingLiveSensorReadings;
    const out = applyServerFreshnessToPacket(input, NOW);
    expect(out.missingLiveSensorReadings).toBe(true);
    expect("recentSensorSnapshotAnnotation" in out).toBe(false);
    expect(buildAiDoctorPromptMessages(out).missingLiveReadingsBlock).not.toBeNull();
  });

  it("treats a fresh live annotation with no snapshot as not live", () => {
    const out = applyServerFreshnessToPacket(
      packet("live", iso(MIN), { recentSensorSnapshot: null }),
      NOW,
    );
    expect(out.missingLiveSensorReadings).toBe(true);
  });

  it("leaves csv, demo, invalid, unknown and already-stale labels alone", () => {
    for (const source of ["csv", "demo", "invalid", "unknown", "stale"] as const) {
      const input = packet(source, iso(30 * 24 * HOUR));
      const out = applyServerFreshnessToPacket(input, NOW);
      expect(out.recentSensorSnapshotAnnotation).toBe(input.recentSensorSnapshotAnnotation);
      expect(out.missingLiveSensorReadings).toBe(true);
    }
  });

  it("keeps the downgrade note inside the 12-note cap", () => {
    const notes = Array.from({ length: 12 }, (_, i) => `note ${i}`);
    const input = packet("live", iso(HOUR));
    input.recentSensorSnapshotAnnotation!.safetyNotes = notes;
    const out = applyServerFreshnessToPacket(input, NOW);
    const outNotes = out.recentSensorSnapshotAnnotation!.safetyNotes;
    expect(outNotes).toHaveLength(12);
    expect(outNotes[11]).toBe(AI_DOCTOR_SERVER_STALE_SNAPSHOT_NOTE);
    expect(input.recentSensorSnapshotAnnotation!.safetyNotes).toEqual(notes);
  });

  it("is idempotent", () => {
    const once = applyServerFreshnessToPacket(packet("live", iso(HOUR)), NOW);
    expect(applyServerFreshnessToPacket(once, NOW)).toEqual(once);
  });

  it("closes the forged-label gap end to end: grounding rejects a 'stable' claim", () => {
    const forged = packet("live", iso(6 * HOUR));
    // Before: the forged labels let a healthy claim through grounding.
    expect(validateAiDoctorReviewGrounding(HEALTHY_RESULT, forged).ok).toBe(true);
    const checked = applyServerFreshnessToPacket(forged, NOW);
    expect(validateAiDoctorReviewGrounding(HEALTHY_RESULT, checked)).toEqual({
      ok: false,
      reason: "healthy_environment_without_trustworthy_snapshot",
    });
  });
});
