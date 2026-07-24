/**
 * Out-of-range `now` coverage for the AI Doctor freshness helpers.
 *
 * JavaScript `Date` is defined on ±8.64e15 ms from epoch (~ ±285,616 y).
 * Values outside that window make `new Date(x).toISOString()` throw
 * "RangeError: Invalid time value". Both helpers must return SAFE
 * DEFAULTS (fall back to the wall clock; never throw) so a corrupt
 * upstream clock/prop can't crash the AI Doctor gate.
 *
 * Pure tests. No I/O, no schema.
 */
import { describe, it, expect } from "vitest";
import { buildAiDoctorSnapshotFreshnessStatus } from "@/lib/aiDoctorSnapshotFreshnessStatusViewModel";
import { buildAiDoctorSnapshotStalenessExplanation } from "@/lib/aiDoctorSnapshotStalenessExplanationViewModel";
import { AI_DOCTOR_SNAPSHOT_FRESH_MS } from "@/lib/aiDoctorContextRules";

const MAX_SAFE_DATE_MS = 8_640_000_000_000_000;
const SNAP = "2026-06-01T00:00:00.000Z";

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Values guaranteed to be OUT of the JS Date range (or so close to the
// edge that `new Date(now - 48h).toISOString()` would throw).
const OUT_OF_RANGE_NOWS: Array<{ name: string; value: number }> = [
  { name: "MAX_SAFE_INTEGER", value: Number.MAX_SAFE_INTEGER },
  { name: "MIN_SAFE_INTEGER", value: Number.MIN_SAFE_INTEGER },
  { name: "+MAX_SAFE_DATE_MS (edge)", value: MAX_SAFE_DATE_MS },
  { name: "-MAX_SAFE_DATE_MS (edge)", value: -MAX_SAFE_DATE_MS },
  { name: "+MAX_SAFE_DATE_MS + 1", value: MAX_SAFE_DATE_MS + 1 },
  { name: "-MAX_SAFE_DATE_MS - 1", value: -MAX_SAFE_DATE_MS - 1 },
  { name: "+1e18", value: 1e18 },
  { name: "-1e18", value: -1e18 },
  { name: "Number.MAX_VALUE", value: Number.MAX_VALUE },
  { name: "-Number.MAX_VALUE", value: -Number.MAX_VALUE },
];

describe("AI Doctor freshness — out-of-range `now`: unit cases return safe defaults", () => {
  for (const { name, value } of OUT_OF_RANGE_NOWS) {
    it(`staleness helper does not throw and returns a valid cutoff for now=${name}`, () => {
      expect(() =>
        buildAiDoctorSnapshotStalenessExplanation({
          latestSnapshotAtIso: SNAP,
          now: value,
        }),
      ).not.toThrow();
      const res = buildAiDoctorSnapshotStalenessExplanation({
        latestSnapshotAtIso: SNAP,
        now: value,
      });
      // Safe default: cutoffAtIso is a real, parseable ISO string —
      // NEVER an empty string or a "RangeError" leak.
      expect(typeof res.cutoffAtIso).toBe("string");
      expect(Number.isFinite(Date.parse(res.cutoffAtIso))).toBe(true);
      // sentence must remain a string in every branch.
      expect(typeof res.sentence).toBe("string");
    });

    it(`freshness helper does not throw for now=${name}`, () => {
      expect(() =>
        buildAiDoctorSnapshotFreshnessStatus({
          latestSnapshotAtIso: SNAP,
          now: value,
        }),
      ).not.toThrow();
      const res = buildAiDoctorSnapshotFreshnessStatus({
        latestSnapshotAtIso: SNAP,
        now: value,
      });
      // Safe default: state is one of the three known enum values.
      expect(["fresh", "stale", "missing"]).toContain(res.state);
      expect(typeof res.label).toBe("string");
      expect(res.label.length).toBeGreaterThan(0);
    });
  }

  it("staleness helper on out-of-range now degrades to the wall-clock fallback (not stale is possible; never throws)", () => {
    // With `now` out of range, the helper falls back to Date.now(). The
    // exact isStale value depends on the wall clock at test time, but
    // the return must be well-formed and the sentence must be either
    // "" (not stale) OR a non-empty string ending with a period.
    const res = buildAiDoctorSnapshotStalenessExplanation({
      latestSnapshotAtIso: SNAP,
      now: Number.MAX_SAFE_INTEGER,
    });
    expect(typeof res.isStale).toBe("boolean");
    if (res.isStale) {
      expect(res.sentence.length).toBeGreaterThan(0);
    } else {
      expect(res.sentence).toBe("");
    }
  });
});

describe("AI Doctor freshness — out-of-range `now`: property-based fuzz never throws", () => {
  it("200 random out-of-range now values produce safe defaults for both helpers", () => {
    const rand = mulberry32(0xDEADBEEF);
    for (let i = 0; i < 200; i++) {
      // Uniform over (MAX_SAFE_DATE_MS, 1e18], flipped random sign.
      const magnitude = MAX_SAFE_DATE_MS + rand() * (1e18 - MAX_SAFE_DATE_MS);
      const sign = rand() < 0.5 ? -1 : 1;
      const outNow = sign * magnitude;

      expect(() =>
        buildAiDoctorSnapshotStalenessExplanation({
          latestSnapshotAtIso: SNAP,
          now: outNow,
        }),
      ).not.toThrow();
      expect(() =>
        buildAiDoctorSnapshotFreshnessStatus({
          latestSnapshotAtIso: SNAP,
          now: outNow,
        }),
      ).not.toThrow();

      const s = buildAiDoctorSnapshotStalenessExplanation({
        latestSnapshotAtIso: SNAP,
        now: outNow,
      });
      // cutoffAtIso must always be a parseable ISO after fallback.
      expect(Number.isFinite(Date.parse(s.cutoffAtIso))).toBe(true);

      const f = buildAiDoctorSnapshotFreshnessStatus({
        latestSnapshotAtIso: SNAP,
        now: outNow,
      });
      expect(["fresh", "stale", "missing"]).toContain(f.state);
    }
  });

  it("in-range boundary (±(MAX_SAFE_DATE_MS - 48h)) is treated as in-range and does not throw", () => {
    const safeMax = MAX_SAFE_DATE_MS - AI_DOCTOR_SNAPSHOT_FRESH_MS;
    for (const n of [safeMax, -safeMax]) {
      expect(() =>
        buildAiDoctorSnapshotStalenessExplanation({
          latestSnapshotAtIso: SNAP,
          now: n,
        }),
      ).not.toThrow();
      const res = buildAiDoctorSnapshotStalenessExplanation({
        latestSnapshotAtIso: SNAP,
        now: n,
      });
      // cutoff equals `new Date(n - 48h).toISOString()` — must be a real
      // ISO string, proving we did NOT force the fallback here.
      expect(res.cutoffAtIso).toBe(
        new Date(n - AI_DOCTOR_SNAPSHOT_FRESH_MS).toISOString(),
      );
    }
  });
});
