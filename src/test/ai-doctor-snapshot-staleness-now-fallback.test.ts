/**
 * Verifies the pluggable `nowFallback` clock on
 * `buildAiDoctorSnapshotStalenessExplanation` makes the out-of-range
 * `now` default path fully deterministic — no reliance on wall clock.
 */
import { describe, expect, it, vi } from "vitest";
import { buildAiDoctorSnapshotStalenessExplanation } from "@/lib/aiDoctorSnapshotStalenessExplanationViewModel";
import { AI_DOCTOR_SNAPSHOT_FRESH_MS } from "@/lib/aiDoctorContextRules";

const FIXED_NOW = Date.UTC(2026, 0, 15, 12, 0, 0);
const clock = () => FIXED_NOW;

describe("buildAiDoctorSnapshotStalenessExplanation — pluggable nowFallback", () => {
  it("uses nowFallback when args.now is non-finite (deterministic cutoff)", () => {
    const result = buildAiDoctorSnapshotStalenessExplanation({
      latestSnapshotAtIso: null,
      now: Number.NaN,
      nowFallback: clock,
    });
    expect(result.cutoffAtIso).toBe(
      new Date(FIXED_NOW - AI_DOCTOR_SNAPSHOT_FRESH_MS).toISOString(),
    );
  });

  it("uses nowFallback when args.now is out of safe Date range", () => {
    for (const bad of [Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER, 1e18, -1e18, Infinity, -Infinity]) {
      const result = buildAiDoctorSnapshotStalenessExplanation({
        latestSnapshotAtIso: "2026-01-13T12:00:00.000Z",
        now: bad,
        nowFallback: clock,
      });
      expect(result.cutoffAtIso).toBe(
        new Date(FIXED_NOW - AI_DOCTOR_SNAPSHOT_FRESH_MS).toISOString(),
      );
      // 2026-01-13 is 48h before FIXED_NOW → exactly at boundary → fresh (not stale)
      expect(result.isStale).toBe(false);
    }
  });

  it("prefers args.now when in range and never invokes nowFallback", () => {
    const spy = vi.fn(() => FIXED_NOW);
    const result = buildAiDoctorSnapshotStalenessExplanation({
      latestSnapshotAtIso: "2026-01-10T00:00:00.000Z",
      now: FIXED_NOW,
      nowFallback: spy,
    });
    expect(spy).not.toHaveBeenCalled();
    expect(result.isStale).toBe(true);
  });

  it("guards a misbehaving nowFallback (returns out-of-range) without throwing", () => {
    const bad = () => 1e18;
    expect(() =>
      buildAiDoctorSnapshotStalenessExplanation({
        latestSnapshotAtIso: null,
        now: Number.NaN,
        nowFallback: bad,
      }),
    ).not.toThrow();
  });

  it("is fully deterministic across replays with a fixed clock", () => {
    const first = buildAiDoctorSnapshotStalenessExplanation({
      latestSnapshotAtIso: "2026-01-10T00:00:00.000Z",
      now: Infinity,
      nowFallback: clock,
    });
    for (let i = 0; i < 25; i++) {
      const next = buildAiDoctorSnapshotStalenessExplanation({
        latestSnapshotAtIso: "2026-01-10T00:00:00.000Z",
        now: Infinity,
        nowFallback: clock,
      });
      expect(next).toEqual(first);
    }
  });
});
