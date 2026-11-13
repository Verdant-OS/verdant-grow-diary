/**
 * A manual snapshot dated in the future is not fresh evidence for AI Doctor.
 *
 * `isManualSnapshotCurrent` (manualSensorSnapshotQualityRules) already
 * rejects a capture time more than MANUAL_SNAPSHOT_FUTURE_SKEW_MS ahead of
 * the clock. The AI Doctor readiness paths used `now - t <= freshMs`, which a
 * negative age always passes, so a snapshot dated a day ahead read as fresh.
 * These tests pin the same skew bound on every AI Doctor freshness path:
 *  - evaluateAiDoctorContext (readiness evidence + strong grade)
 *  - buildAiDoctorSnapshotFreshnessStatus (freshness chip view model)
 */
import { describe, expect, it } from "vitest";
import {
  evaluateAiDoctorContext,
  selectAiDoctorFreshnessSnapshotAt,
} from "@/lib/aiDoctorContextRules";
import { buildAiDoctorReadinessDiaryEntry } from "@/lib/aiDoctorReadinessDiaryEntryRules";
import { buildAiDoctorSnapshotFreshnessStatus } from "@/lib/aiDoctorSnapshotFreshnessStatusViewModel";
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

describe("evaluateAiDoctorContext — manualSnapshotFutureDated flag", () => {
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

describe("presenter input — a future-dated row beside a fresh one", () => {
  it("the presenters read the newest snapshot within the skew, not the future row", () => {
    const r = contextWithSnapshots([NOW + HOUR, NOW - HOUR]);
    expect(r.latest.manualSnapshotAt).toBe(iso(NOW + HOUR));
    expect(selectAiDoctorFreshnessSnapshotAt(r)).toBe(iso(NOW - HOUR));
    const chip = buildAiDoctorSnapshotFreshnessStatus({
      latestSnapshotAtIso: selectAiDoctorFreshnessSnapshotAt(r),
      now: NOW,
    });
    expect(chip.state).toBe("fresh");
  });

  it("the saved readiness note agrees with a strong grade", () => {
    const r = contextWithSnapshots([NOW + HOUR, NOW - HOUR]);
    expect(r.readiness).toBe("strong");
    const entry = buildAiDoctorReadinessDiaryEntry({
      readiness: r.readiness,
      latestSnapshotAtIso: selectAiDoctorFreshnessSnapshotAt(r),
      growId: "g1",
      now: NOW,
    });
    expect(entry.ok).toBe(true);
    if (!entry.ok) return;
    expect(entry.draft.details.snapshot_freshness).toBe("fresh");
    expect(entry.draft.note).not.toMatch(/Stale/);
  });

  it("with only a future-dated row, the presenters still see it and say its age is unknown", () => {
    const r = contextWithSnapshots([NOW + HOUR]);
    expect(selectAiDoctorFreshnessSnapshotAt(r)).toBe(iso(NOW + HOUR));
    const chip = buildAiDoctorSnapshotFreshnessStatus({
      latestSnapshotAtIso: selectAiDoctorFreshnessSnapshotAt(r),
      now: NOW,
    });
    expect(chip.label).toBe("Stale · future time");
  });

  it("falls back to manualSnapshotAt for results without the new field", () => {
    const r = contextWithSnapshots([NOW - HOUR]);
    const legacy = { ...r, latest: { manualSnapshotAt: r.latest.manualSnapshotAt } };
    expect(selectAiDoctorFreshnessSnapshotAt(legacy)).toBe(iso(NOW - HOUR));
  });
});
