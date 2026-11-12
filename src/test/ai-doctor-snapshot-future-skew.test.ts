/**
 * A manual snapshot dated in the future is not fresh evidence for AI Doctor.
 *
 * `isManualSnapshotCurrent` (manualSensorSnapshotQualityRules) already
 * rejects a capture time more than MANUAL_SNAPSHOT_FUTURE_SKEW_MS ahead of
 * the clock. The AI Doctor readiness paths used `now - t <= freshMs`, which a
 * negative age always passes, so a snapshot dated a day ahead read as fresh.
 * These tests pin the same skew bound on every AI Doctor freshness path:
 *  - evaluateAiDoctorContext (readiness evidence + strong grade)
 *  - buildAiDoctorSnapshotFreshnessStatus (readiness gate chip)
 *  - buildAiDoctorSnapshotStalenessExplanation (launch dialog), which a
 *    fuzz test requires to agree with the chip.
 */
import { describe, expect, it } from "vitest";
import { evaluateAiDoctorContext } from "@/lib/aiDoctorContextRules";
import { buildAiDoctorSafeReviewStart } from "@/lib/aiDoctorSafeReviewStartViewModel";
import { buildAiDoctorSnapshotFreshnessStatus } from "@/lib/aiDoctorSnapshotFreshnessStatusViewModel";
import { buildAiDoctorSnapshotStalenessExplanation } from "@/lib/aiDoctorSnapshotStalenessExplanationViewModel";
import {
  MANUAL_SNAPSHOT_FUTURE_SKEW_MS,
  isManualSnapshotCurrent,
} from "@/lib/manualSensorSnapshotQualityRules";

const NOW = Date.parse("2026-11-12T12:00:00.000Z");
const HOUR = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();

function contextWithSnapshots(snapshotTimes: number[]) {
  return evaluateAiDoctorContext({
    now: NOW,
    plant: {
      hasProfile: true,
      strain: "Test strain",
      stage: "veg",
      hasPlantPhoto: true,
      plantType: "photoperiod",
    },
    recentEvents: [
      { at: iso(NOW - HOUR), category: "watering" },
      { at: iso(NOW - 2 * HOUR), category: "notes" },
    ],
    recentManualSnapshots: snapshotTimes.map((t) => ({ at: iso(t), severity: "ok" })),
    recentRootZoneObservations: 1,
  } as Parameters<typeof evaluateAiDoctorContext>[0]);
}

describe("future-dated manual snapshot — shared skew bound", () => {
  it("uses the same 5-minute bound as isManualSnapshotCurrent", () => {
    expect(MANUAL_SNAPSHOT_FUTURE_SKEW_MS).toBe(5 * 60_000);
    expect(isManualSnapshotCurrent(iso(NOW + MANUAL_SNAPSHOT_FUTURE_SKEW_MS), NOW)).toBe(true);
    expect(isManualSnapshotCurrent(iso(NOW + MANUAL_SNAPSHOT_FUTURE_SKEW_MS + 1), NOW)).toBe(false);
  });
});

describe("evaluateAiDoctorContext — future-dated snapshot", () => {
  it("a snapshot 1 hour in the future is not fresh evidence and blocks a strong grade", () => {
    const r = contextWithSnapshots([NOW + HOUR]);
    expect(r.evidence).not.toContain("fresh-manual-sensor-snapshot");
    expect(r.readiness).not.toBe("strong");
  });

  it("a snapshot within the skew (+4 min) is fresh", () => {
    const r = contextWithSnapshots([NOW + 4 * 60_000]);
    expect(r.evidence).toContain("fresh-manual-sensor-snapshot");
    expect(r.readiness).toBe("strong");
  });

  it("flips exactly past the skew: +skew is fresh, +skew+1ms is not", () => {
    expect(contextWithSnapshots([NOW + MANUAL_SNAPSHOT_FUTURE_SKEW_MS]).evidence).toContain(
      "fresh-manual-sensor-snapshot",
    );
    expect(contextWithSnapshots([NOW + MANUAL_SNAPSHOT_FUTURE_SKEW_MS + 1]).evidence).not.toContain(
      "fresh-manual-sensor-snapshot",
    );
  });

  it("a future-dated snapshot does not hide a genuinely fresh one", () => {
    const r = contextWithSnapshots([NOW + HOUR, NOW - HOUR]);
    expect(r.evidence).toContain("fresh-manual-sensor-snapshot");
    expect(r.readiness).toBe("strong");
  });
});

describe("buildAiDoctorSnapshotFreshnessStatus — future-dated snapshot", () => {
  it("+1 hour is not fresh, and the copy does not claim an age", () => {
    const r = buildAiDoctorSnapshotFreshnessStatus({
      latestSnapshotAtIso: iso(NOW + HOUR),
      now: NOW,
    });
    expect(r.state).toBe("stale");
    expect(r.label).toBe("Stale · future time");
    expect(r.ageMinutes).toBeNull();
    expect(r.description).toMatch(/dated in the future/);
  });

  it("within the skew (+4 min) reads fresh, just now", () => {
    const r = buildAiDoctorSnapshotFreshnessStatus({
      latestSnapshotAtIso: iso(NOW + 4 * 60_000),
      now: NOW,
    });
    expect(r.state).toBe("fresh");
    expect(r.label).toBe("Fresh · just now");
  });

  it("flips exactly past the skew", () => {
    const at = (d: number) =>
      buildAiDoctorSnapshotFreshnessStatus({
        latestSnapshotAtIso: iso(NOW + MANUAL_SNAPSHOT_FUTURE_SKEW_MS + d),
        now: NOW,
      }).state;
    expect(at(0)).toBe("fresh");
    expect(at(1)).toBe("stale");
  });
});

describe("buildAiDoctorSnapshotStalenessExplanation — future-dated snapshot", () => {
  it("+1 hour is stale, with a sentence that says it is dated in the future", () => {
    const r = buildAiDoctorSnapshotStalenessExplanation({
      latestSnapshotAtIso: iso(NOW + HOUR),
      now: NOW,
    });
    expect(r.isStale).toBe(true);
    expect(r.sentence).toMatch(/dated in the future/);
    expect(r.sentence).not.toMatch(/older than/);
  });

  it("within the skew (+4 min) is not stale", () => {
    const r = buildAiDoctorSnapshotStalenessExplanation({
      latestSnapshotAtIso: iso(NOW + 4 * 60_000),
      now: NOW,
    });
    expect(r.isStale).toBe(false);
    expect(r.sentence).toBe("");
  });

  it("agrees with the freshness chip across the skew boundary", () => {
    for (const d of [-1, 0, 1, HOUR]) {
      const snap = iso(NOW + MANUAL_SNAPSHOT_FUTURE_SKEW_MS + d);
      const chip = buildAiDoctorSnapshotFreshnessStatus({ latestSnapshotAtIso: snap, now: NOW });
      const expl = buildAiDoctorSnapshotStalenessExplanation({
        latestSnapshotAtIso: snap,
        now: NOW,
      });
      expect(chip.state === "stale").toBe(expl.isStale);
    }
  });
});

describe("buildAiDoctorSafeReviewStart — future-dated snapshot summary", () => {
  it("does not claim a future-dated snapshot is older than the window", () => {
    const view = buildAiDoctorSafeReviewStart(contextWithSnapshots([NOW + HOUR]));
    const summary = view.preparation?.snapshotSummary ?? "";
    expect(summary).toMatch(/dated in the future, so its age is unknown/);
    expect(summary).not.toMatch(/older than/);
  });

  it("still says older than the window for a genuinely stale snapshot", () => {
    const view = buildAiDoctorSafeReviewStart(contextWithSnapshots([NOW - 30 * HOUR]));
    expect(view.preparation?.snapshotSummary ?? "").toMatch(/older than 24 hours/);
  });

  it("flags the newest snapshot as future-dated only beyond the skew", () => {
    expect(
      contextWithSnapshots([NOW + MANUAL_SNAPSHOT_FUTURE_SKEW_MS]).latest.manualSnapshotFutureDated,
    ).toBe(false);
    expect(
      contextWithSnapshots([NOW + MANUAL_SNAPSHOT_FUTURE_SKEW_MS + 1]).latest
        .manualSnapshotFutureDated,
    ).toBe(true);
  });
});
