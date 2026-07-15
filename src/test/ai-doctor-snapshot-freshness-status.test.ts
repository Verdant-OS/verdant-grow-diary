/**
 * Unit tests for `buildAiDoctorSnapshotFreshnessStatus` — verify the
 * fresh/stale/missing state transitions and the deterministic
 * age-label string at and around the 48h freshness cutoff.
 *
 * Pure/copy-only. No app/schema/RLS/Edge/AI/writes touched.
 */
import { describe, it, expect } from "vitest";
import {
  buildAiDoctorSnapshotFreshnessStatus,
} from "@/lib/aiDoctorSnapshotFreshnessStatusViewModel";
import { AI_DOCTOR_SNAPSHOT_FRESH_MS } from "@/lib/aiDoctorContextRules";

const NOW = Date.parse("2026-06-01T12:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();

describe("buildAiDoctorSnapshotFreshnessStatus — missing", () => {
  it("returns 'missing' when snapshot ISO is null", () => {
    const r = buildAiDoctorSnapshotFreshnessStatus({
      latestSnapshotAtIso: null,
      now: NOW,
    });
    expect(r.state).toBe("missing");
    expect(r.snapshotAtIso).toBeNull();
    expect(r.ageMinutes).toBeNull();
    expect(r.label).toBe("No snapshot");
    expect(r.description).toContain("48h freshness window");
  });

  it("returns 'missing' for an unparseable ISO string", () => {
    const r = buildAiDoctorSnapshotFreshnessStatus({
      latestSnapshotAtIso: "not-a-date",
      now: NOW,
    });
    expect(r.state).toBe("missing");
    expect(r.ageMinutes).toBeNull();
    expect(r.label).toBe("No snapshot");
  });
});

describe("buildAiDoctorSnapshotFreshnessStatus — 48h boundary", () => {
  it("stays 'fresh' at exactly the 48h cutoff (inclusive)", () => {
    const r = buildAiDoctorSnapshotFreshnessStatus({
      latestSnapshotAtIso: iso(NOW - AI_DOCTOR_SNAPSHOT_FRESH_MS),
      now: NOW,
    });
    expect(r.state).toBe("fresh");
    expect(r.label).toBe("Fresh · 48h ago");
    expect(r.ageMinutes).toBe(48 * 60);
    expect(r.description).toBe(
      "Latest manual sensor snapshot is 48h ago — inside the 48h freshness window.",
    );
  });

  it("flips to 'stale' 1ms past the cutoff", () => {
    const r = buildAiDoctorSnapshotFreshnessStatus({
      latestSnapshotAtIso: iso(NOW - AI_DOCTOR_SNAPSHOT_FRESH_MS - 1),
      now: NOW,
    });
    expect(r.state).toBe("stale");
    // 48h + 1ms rounds down to 48h in the label formatter.
    expect(r.label).toBe("Stale · 48h ago");
    expect(r.description).toBe(
      "Latest manual sensor snapshot is 48h ago — older than the 48h freshness cutoff.",
    );
  });

  it("stays 'fresh' 1ms before the cutoff", () => {
    const r = buildAiDoctorSnapshotFreshnessStatus({
      latestSnapshotAtIso: iso(NOW - AI_DOCTOR_SNAPSHOT_FRESH_MS + 1),
      now: NOW,
    });
    expect(r.state).toBe("fresh");
    expect(r.label).toBe("Fresh · 47h ago");
  });
});

describe("buildAiDoctorSnapshotFreshnessStatus — age label formatting", () => {
  const cases: Array<{ msAgo: number; label: string; minutes: number }> = [
    { msAgo: 0, label: "Fresh · just now", minutes: 0 },
    { msAgo: 30 * 1000, label: "Fresh · just now", minutes: 0 },
    { msAgo: 60 * 1000, label: "Fresh · 1m ago", minutes: 1 },
    { msAgo: 59 * 60 * 1000, label: "Fresh · 59m ago", minutes: 59 },
    { msAgo: 60 * 60 * 1000, label: "Fresh · 1h ago", minutes: 60 },
    { msAgo: 47 * 60 * 60 * 1000, label: "Fresh · 47h ago", minutes: 47 * 60 },
  ];
  it.each(cases)(
    "renders '$label' for $msAgo ms ago (fresh side)",
    ({ msAgo, label, minutes }) => {
      const r = buildAiDoctorSnapshotFreshnessStatus({
        latestSnapshotAtIso: iso(NOW - msAgo),
        now: NOW,
      });
      expect(r.state).toBe("fresh");
      expect(r.label).toBe(label);
      expect(r.ageMinutes).toBe(minutes);
    },
  );

  it("uses days on the stale side once past 48h", () => {
    const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
    const r = buildAiDoctorSnapshotFreshnessStatus({
      latestSnapshotAtIso: iso(NOW - threeDaysMs),
      now: NOW,
    });
    expect(r.state).toBe("stale");
    expect(r.label).toBe("Stale · 3d ago");
    expect(r.ageMinutes).toBe(3 * 24 * 60);
  });

  it("clamps future-dated snapshots to 'just now' and stays fresh", () => {
    const r = buildAiDoctorSnapshotFreshnessStatus({
      latestSnapshotAtIso: iso(NOW + 60_000),
      now: NOW,
    });
    expect(r.state).toBe("fresh");
    expect(r.label).toBe("Fresh · just now");
    expect(r.ageMinutes).toBe(0);
  });
});

describe("buildAiDoctorSnapshotFreshnessStatus — determinism", () => {
  it("returns byte-identical output for repeated calls with same inputs", () => {
    const args = {
      latestSnapshotAtIso: iso(NOW - AI_DOCTOR_SNAPSHOT_FRESH_MS - 1),
      now: NOW,
    };
    const first = buildAiDoctorSnapshotFreshnessStatus(args);
    for (let i = 0; i < 50; i++) {
      expect(buildAiDoctorSnapshotFreshnessStatus(args)).toEqual(first);
    }
  });

  it("does not mutate its input args", () => {
    const args = Object.freeze({
      latestSnapshotAtIso: iso(NOW - 60_000),
      now: NOW,
    });
    expect(() => buildAiDoctorSnapshotFreshnessStatus(args)).not.toThrow();
  });
});

describe("buildAiDoctorSnapshotFreshnessStatus — custom snapshotFreshMs", () => {
  const ONE_HOUR = 60 * 60 * 1000;

  it("honors an override at its own inclusive boundary", () => {
    const r = buildAiDoctorSnapshotFreshnessStatus({
      latestSnapshotAtIso: iso(NOW - ONE_HOUR),
      now: NOW,
      snapshotFreshMs: ONE_HOUR,
    });
    expect(r.state).toBe("fresh");
    expect(r.label).toBe("Fresh · 1h ago");
    expect(r.description).toContain("inside the 1h freshness window");
  });

  it("flips to stale 1ms past the override boundary", () => {
    const r = buildAiDoctorSnapshotFreshnessStatus({
      latestSnapshotAtIso: iso(NOW - ONE_HOUR - 1),
      now: NOW,
      snapshotFreshMs: ONE_HOUR,
    });
    expect(r.state).toBe("stale");
    expect(r.description).toContain("older than the 1h freshness cutoff");
  });

  it("falls back to the default 48h when override is invalid (0)", () => {
    const r = buildAiDoctorSnapshotFreshnessStatus({
      latestSnapshotAtIso: iso(NOW - ONE_HOUR),
      now: NOW,
      snapshotFreshMs: 0,
    });
    expect(r.state).toBe("fresh");
    expect(r.description).toContain("48h freshness window");
  });
});
