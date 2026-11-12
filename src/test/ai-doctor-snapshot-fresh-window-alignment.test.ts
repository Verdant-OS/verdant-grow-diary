/**
 * AI Doctor snapshot freshness window alignment (audit 2026-11-11, owner
 * decision in the audit session: one 24-hour window).
 *
 * AI Doctor readiness called a manual sensor snapshot "fresh" for 48 hours
 * while the AI Doctor engine and the manual snapshot quality rules called it
 * stale after 24. A 30-hour-old reading carried both labels.
 */
import { describe, expect, it } from "vitest";
import {
  AI_DOCTOR_CONTEXT_TOOLTIPS,
  AI_DOCTOR_SNAPSHOT_FRESH_HOURS,
} from "@/constants/aiDoctorContextReadiness";
import { MANUAL_SNAPSHOT_CURRENT_STALE_HOURS } from "@/constants/sensorTiming";
import { AI_DOCTOR_SNAPSHOT_FRESH_MS, evaluateAiDoctorContext } from "@/lib/aiDoctorContextRules";
import { AI_DOCTOR_SENSOR_STALENESS_WINDOW_MS } from "@/lib/aiDoctorEnginePhase1Foundation";
import { AI_DOCTOR_READINESS_CHECK_KIND } from "@/lib/aiDoctorReadinessDiaryEntryRules";
import { buildAiDoctorReadinessTimelineBadge } from "@/lib/aiDoctorReadinessTimelineBadge";

const NOW = Date.parse("2026-11-11T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;

function contextWithSnapshotAgedHours(hours: number) {
  return evaluateAiDoctorContext({
    plant: { hasProfile: true, strain: null, stage: null },
    now: NOW,
    recentManualSnapshots: [{ at: new Date(NOW - hours * HOUR).toISOString() }],
  });
}

function readinessCheck(freshness: "fresh" | "stale", ageHours: number) {
  const checkedAt = "2026-10-01T12:00:00.000Z";
  return {
    details: {
      kind: AI_DOCTOR_READINESS_CHECK_KIND,
      snapshot_freshness: freshness,
      snapshot_age_minutes: ageHours * 60,
      snapshot_at: new Date(Date.parse(checkedAt) - ageHours * HOUR).toISOString(),
      checked_at: checkedAt,
    },
  };
}

describe("AI Doctor snapshot freshness window", () => {
  it("is the same window the engine and the manual snapshot rules use", () => {
    expect(AI_DOCTOR_SNAPSHOT_FRESH_HOURS).toBe(MANUAL_SNAPSHOT_CURRENT_STALE_HOURS);
    expect(AI_DOCTOR_SNAPSHOT_FRESH_MS).toBe(AI_DOCTOR_SENSOR_STALENESS_WINDOW_MS);
    expect(AI_DOCTOR_SNAPSHOT_FRESH_MS).toBe(24 * HOUR);
  });

  it("names that window in the readiness tooltip", () => {
    expect(AI_DOCTOR_CONTEXT_TOOLTIPS["fresh-manual-sensor-snapshot"]).toBe(
      "Present when a manual sensor snapshot was logged in the last 24 hours.",
    );
  });

  it("counts a snapshot as fresh up to the boundary and not after it", () => {
    expect(contextWithSnapshotAgedHours(1).evidence).toContain("fresh-manual-sensor-snapshot");
    expect(contextWithSnapshotAgedHours(24).evidence).toContain("fresh-manual-sensor-snapshot");
    expect(contextWithSnapshotAgedHours(30).evidence).not.toContain("fresh-manual-sensor-snapshot");
    // Still recent context, just no longer fresh.
    expect(contextWithSnapshotAgedHours(30).evidence).toContain("recent-manual-sensor-snapshot");
  });
});

describe("saved readiness badges across the window change", () => {
  it("keeps a check saved as fresh under the earlier 48-hour window readable", () => {
    const badge = buildAiDoctorReadinessTimelineBadge(readinessCheck("fresh", 30));
    expect(badge?.freshness).toBe("fresh");
    expect(badge?.label).toBe("Snapshot fresh · 30h old at check");
  });

  it("grades new and old checks alike inside 24 hours and beyond 48", () => {
    expect(buildAiDoctorReadinessTimelineBadge(readinessCheck("fresh", 3))?.freshness).toBe(
      "fresh",
    );
    expect(buildAiDoctorReadinessTimelineBadge(readinessCheck("stale", 30))?.freshness).toBe(
      "stale",
    );
    expect(buildAiDoctorReadinessTimelineBadge(readinessCheck("stale", 72))?.freshness).toBe(
      "stale",
    );
  });

  it("still rejects rows that fit neither window", () => {
    expect(buildAiDoctorReadinessTimelineBadge(readinessCheck("fresh", 72))?.freshness).toBe(
      "missing",
    );
    expect(buildAiDoctorReadinessTimelineBadge(readinessCheck("stale", 3))?.freshness).toBe(
      "missing",
    );
  });
});
