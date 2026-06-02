import { describe, it, expect } from "vitest";
import {
  evaluateAiDoctorContext,
  AI_DOCTOR_INSUFFICIENT_NOTICE,
  AI_DOCTOR_RECENT_WINDOW_MS,
  AI_DOCTOR_SNAPSHOT_FRESH_MS,
} from "@/lib/aiDoctorContextRules";

const NOW = Date.UTC(2026, 5, 1, 12, 0, 0);
const iso = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const strongPlant = {
  hasProfile: true,
  strain: "Northern Lights",
  stage: "veg",
  medium: "Coco",
  hasPlantPhoto: true,
};

describe("evaluateAiDoctorContext", () => {
  it("returns insufficient with null input", () => {
    const r = evaluateAiDoctorContext(null);
    expect(r.readiness).toBe("insufficient");
    expect(r.missing).toContain("plant-profile");
    expect(r.diagnosisClaimed).toBe(false);
    expect(r.safeNextStep).toMatch(/Add a recent note/);
  });

  it("treats no plant profile as insufficient", () => {
    const r = evaluateAiDoctorContext({ plant: null, now: NOW });
    expect(r.readiness).toBe("insufficient");
  });

  it("is insufficient when no recent activity and no snapshots", () => {
    const r = evaluateAiDoctorContext({
      plant: strongPlant,
      recentEvents: [],
      recentManualSnapshots: [],
      now: NOW,
    });
    expect(r.readiness).toBe("insufficient");
    expect(r.missing).toContain("recent-timeline-activity");
    expect(r.missing).toContain("recent-manual-sensor-snapshot");
  });

  it("is partial when profile + some activity but missing snapshot", () => {
    const r = evaluateAiDoctorContext({
      plant: strongPlant,
      recentEvents: [
        { at: iso(-HOUR), category: "watering" },
        { at: iso(-2 * HOUR), category: "notes" },
      ],
      recentManualSnapshots: [],
      now: NOW,
    });
    expect(r.readiness).toBe("partial");
    expect(r.missing).toContain("recent-manual-sensor-snapshot");
    expect(r.evidence).toContain("recent-watering-or-feeding");
    expect(r.safeNextStep).toMatch(/Review recent logs/);
  });

  it("is partial when snapshot is stale (older than 48h) even with activity", () => {
    const r = evaluateAiDoctorContext({
      plant: strongPlant,
      recentEvents: [
        { at: iso(-HOUR), category: "watering" },
        { at: iso(-2 * HOUR), category: "notes" },
      ],
      recentManualSnapshots: [
        { at: iso(-(AI_DOCTOR_SNAPSHOT_FRESH_MS + HOUR)), severity: "ok" },
      ],
      now: NOW,
    });
    expect(r.readiness).toBe("partial");
    expect(r.evidence).not.toContain("fresh-manual-sensor-snapshot");
  });

  it("is strong with profile, stage, activity, fresh snapshot, and photo", () => {
    const r = evaluateAiDoctorContext({
      plant: strongPlant,
      recentEvents: [
        { at: iso(-HOUR), category: "watering" },
        { at: iso(-2 * HOUR), category: "notes" },
      ],
      recentManualSnapshots: [{ at: iso(-2 * HOUR), severity: "ok" }],
      now: NOW,
    });
    expect(r.readiness).toBe("strong");
    expect(r.evidence).toEqual(
      expect.arrayContaining([
        "plant-profile",
        "stage",
        "strain",
        "recent-timeline-activity",
        "recent-manual-sensor-snapshot",
        "fresh-manual-sensor-snapshot",
      ]),
    );
    expect(r.safeNextStep).toMatch(/cautious AI Doctor review/);
  });

  it("ignores events older than the 7d window", () => {
    const r = evaluateAiDoctorContext({
      plant: strongPlant,
      recentEvents: [
        { at: iso(-(AI_DOCTOR_RECENT_WINDOW_MS + DAY)), category: "watering" },
      ],
      recentManualSnapshots: [],
      now: NOW,
    });
    expect(r.counts.recentEvents).toBe(0);
    expect(r.readiness).toBe("insufficient");
  });

  it("counts warnings from snapshot severity and warning events", () => {
    const r = evaluateAiDoctorContext({
      plant: strongPlant,
      recentEvents: [{ at: iso(-HOUR), category: "warnings" }],
      recentManualSnapshots: [{ at: iso(-HOUR), severity: "warning" }],
      now: NOW,
    });
    expect(r.counts.recentWarnings).toBe(2);
    expect(r.evidence).toContain("recent-warnings");
  });

  it("treats missing strain/stage/medium as missing codes", () => {
    const r = evaluateAiDoctorContext({
      plant: {
        hasProfile: true,
        strain: "",
        stage: null,
        medium: "",
        hasPlantPhoto: false,
      },
      recentEvents: [
        { at: iso(-HOUR), category: "watering" },
        { at: iso(-2 * HOUR), category: "notes" },
      ],
      recentManualSnapshots: [{ at: iso(-HOUR), severity: "ok" }],
      now: NOW,
    });
    expect(r.missing).toEqual(
      expect.arrayContaining(["strain", "stage", "medium", "plant-photo"]),
    );
    expect(r.readiness).toBe("partial");
  });

  it("ignores malformed timestamps", () => {
    const r = evaluateAiDoctorContext({
      plant: strongPlant,
      recentEvents: [
        { at: "not-a-date", category: "watering" },
        { at: null, category: "notes" },
      ],
      recentManualSnapshots: [{ at: undefined, severity: "ok" }],
      now: NOW,
    });
    expect(r.counts.recentEvents).toBe(0);
    expect(r.counts.recentManualSnapshots).toBe(0);
    expect(r.readiness).toBe("insufficient");
  });

  it("never claims a diagnosis", () => {
    const r = evaluateAiDoctorContext({
      plant: strongPlant,
      recentEvents: [{ at: iso(-HOUR), category: "watering" }],
      recentManualSnapshots: [{ at: iso(-HOUR), severity: "ok" }],
      now: NOW,
    });
    expect(r.diagnosisClaimed).toBe(false);
  });

  it("exports the insufficient notice copy", () => {
    expect(AI_DOCTOR_INSUFFICIENT_NOTICE).toMatch(
      /More context needed before AI Doctor/,
    );
  });

  it("is deterministic for the same input", () => {
    const input = {
      plant: strongPlant,
      recentEvents: [
        { at: iso(-HOUR), category: "watering" as const },
        { at: iso(-2 * HOUR), category: "notes" as const },
      ],
      recentManualSnapshots: [{ at: iso(-HOUR), severity: "ok" as const }],
      now: NOW,
    };
    expect(evaluateAiDoctorContext(input)).toEqual(
      evaluateAiDoctorContext(input),
    );
  });
});
