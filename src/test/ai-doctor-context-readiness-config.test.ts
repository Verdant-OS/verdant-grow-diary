import { describe, it, expect } from "vitest";
import {
  AI_DOCTOR_CONTEXT_READINESS_CONFIG,
  AI_DOCTOR_RECENT_EVENT_WINDOW_DAYS,
  AI_DOCTOR_SNAPSHOT_FRESH_HOURS,
  AI_DOCTOR_CONTEXT_TOOLTIPS,
  AI_DOCTOR_CONTEXT_MISSING_TOOLTIPS,
} from "@/constants/aiDoctorContextReadiness";
import {
  AI_DOCTOR_RECENT_WINDOW_MS,
  AI_DOCTOR_SNAPSHOT_FRESH_MS,
  evaluateAiDoctorContext,
} from "@/lib/aiDoctorContextRules";

describe("aiDoctorContextReadiness config", () => {
  it("defaults to a 7-day recent event window", () => {
    expect(AI_DOCTOR_RECENT_EVENT_WINDOW_DAYS).toBe(7);
    expect(AI_DOCTOR_CONTEXT_READINESS_CONFIG.recentEventWindowMs).toBe(
      7 * 24 * 60 * 60 * 1000,
    );
  });

  it("defaults to 48 hours of snapshot freshness", () => {
    expect(AI_DOCTOR_SNAPSHOT_FRESH_HOURS).toBe(48);
    expect(AI_DOCTOR_CONTEXT_READINESS_CONFIG.snapshotFreshMs).toBe(
      48 * 60 * 60 * 1000,
    );
  });

  it("rules library re-exports the shared thresholds", () => {
    expect(AI_DOCTOR_RECENT_WINDOW_MS).toBe(
      AI_DOCTOR_CONTEXT_READINESS_CONFIG.recentEventWindowMs,
    );
    expect(AI_DOCTOR_SNAPSHOT_FRESH_MS).toBe(
      AI_DOCTOR_CONTEXT_READINESS_CONFIG.snapshotFreshMs,
    );
  });

  it("exposes tooltip copy for each readiness item", () => {
    for (const code of [
      "stage",
      "strain",
      "medium",
      "plant-photo",
      "recent-warnings",
    ]) {
      expect(typeof AI_DOCTOR_CONTEXT_TOOLTIPS[code]).toBe("string");
      expect(AI_DOCTOR_CONTEXT_TOOLTIPS[code].length).toBeGreaterThan(0);
    }
    expect(AI_DOCTOR_CONTEXT_MISSING_TOOLTIPS["recent-warnings"]).toMatch(
      /No recent warnings/i,
    );
    expect(AI_DOCTOR_CONTEXT_MISSING_TOOLTIPS["plant-photo"]).toMatch(
      /No recent plant photo/i,
    );
  });
});

describe("evaluateAiDoctorContext respects config overrides", () => {
  const NOW = Date.UTC(2026, 5, 1, 12, 0, 0);
  const iso = (off: number) => new Date(NOW + off).toISOString();
  const HOUR = 3600 * 1000;
  const plant = {
    hasProfile: true,
    strain: "NL",
    stage: "veg",
    medium: "Coco",
    hasPlantPhoto: true,
  };

  it("treats an older snapshot as fresh when freshness window is widened", () => {
    // 5 days old snapshot: stale under the default 48h window…
    const stale = {
      plant,
      recentEvents: [
        { at: iso(-HOUR), category: "watering" as const },
        { at: iso(-2 * HOUR), category: "notes" as const },
      ],
      recentManualSnapshots: [{ at: iso(-5 * 24 * HOUR), severity: "ok" as const }],
      now: NOW,
    };
    const defaultResult = evaluateAiDoctorContext(stale);
    expect(defaultResult.evidence).not.toContain("fresh-manual-sensor-snapshot");

    // …becomes fresh under a 10-day override.
    const widened = evaluateAiDoctorContext({
      ...stale,
      config: { snapshotFreshMs: 10 * 24 * HOUR },
    });
    expect(widened.evidence).toContain("fresh-manual-sensor-snapshot");
  });

  it("drops events that fall outside a narrowed recent window", () => {
    const input = {
      plant,
      recentEvents: [
        { at: iso(-3 * 24 * HOUR), category: "watering" as const },
        { at: iso(-3 * 24 * HOUR), category: "notes" as const },
      ],
      recentManualSnapshots: [{ at: iso(-HOUR), severity: "ok" as const }],
      now: NOW,
    };
    const narrowed = evaluateAiDoctorContext({
      ...input,
      config: { recentEventWindowMs: 24 * HOUR },
    });
    expect(narrowed.counts.recentEvents).toBe(0);
    expect(narrowed.readiness).not.toBe("strong");
  });

  it("is deterministic for identical inputs and overrides", () => {
    const input = {
      plant,
      recentEvents: [{ at: iso(-HOUR), category: "watering" as const }],
      recentManualSnapshots: [{ at: iso(-HOUR), severity: "ok" as const }],
      now: NOW,
      config: { recentEventWindowMs: 2 * 24 * HOUR, snapshotFreshMs: 24 * HOUR },
    };
    expect(evaluateAiDoctorContext(input)).toEqual(
      evaluateAiDoctorContext(input),
    );
  });
});
