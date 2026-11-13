/**
 * Out-of-range `now` coverage for the AI Doctor freshness helpers.
 *
 * JavaScript `Date` is defined on ±8.64e15 ms from epoch (~ ±285,616 y).
 * Values outside that window make `new Date(x).toISOString()` throw
 * "RangeError: Invalid time value". The freshness-status helper must return SAFE
 * DEFAULTS (fall back to the wall clock; never throw) so a corrupt
 * upstream clock/prop can't crash the AI Doctor gate.
 *
 * Pure tests. No I/O, no schema.
 */
import { describe, it, expect } from "vitest";
import { buildAiDoctorSnapshotFreshnessStatus } from "@/lib/aiDoctorSnapshotFreshnessStatusViewModel";

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
});

describe("AI Doctor freshness — out-of-range `now`: property-based fuzz never throws", () => {
  it("200 random out-of-range now values produce safe freshness-status defaults", () => {
    const rand = mulberry32(0xdeadbeef);
    for (let i = 0; i < 200; i++) {
      // Uniform over (MAX_SAFE_DATE_MS, 1e18], flipped random sign.
      const magnitude = MAX_SAFE_DATE_MS + rand() * (1e18 - MAX_SAFE_DATE_MS);
      const sign = rand() < 0.5 ? -1 : 1;
      const outNow = sign * magnitude;

      expect(() =>
        buildAiDoctorSnapshotFreshnessStatus({
          latestSnapshotAtIso: SNAP,
          now: outNow,
        }),
      ).not.toThrow();

      const f = buildAiDoctorSnapshotFreshnessStatus({
        latestSnapshotAtIso: SNAP,
        now: outNow,
      });
      expect(["fresh", "stale", "missing"]).toContain(f.state);
    }
  });
});
