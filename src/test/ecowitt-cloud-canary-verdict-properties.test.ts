/**
 * Property-based hardening for runEcowittCloudCanary verdict counts.
 *
 * Pure tests. No slice-1 logic changes. No new runtime dependency.
 *
 * Determinism: seeded Fisher–Yates shuffle (mulberry32, seed 0xC0FFEE,
 * 200 iterations). fast-check is not a project dependency and is not added.
 *
 * Invariants asserted across every permutation of the fixture list:
 *   P1 Order-independence  — totals and per-fixture summaries are identical
 *                            for any input permutation (matched by fixture_id).
 *   P2 Mapping partition   — totals.mapped + totals.unmapped equals the
 *                            baseline total of mapped+unmapped channels.
 *                            Each output row sits in exactly one bucket
 *                            (rows[] disjoint from unmapped[]).
 *   P3 Source partition    — per fixture: live+stale+invalid == mapped_count.
 *                            Each mapped row has exactly one source tag in
 *                            {live, stale, invalid}.
 *   P4 No silent drop      — summaries.length == fixtures.length.
 *   P5 Determinism         — repeated normalize on identical input yields
 *                            identical counts.
 */

import { describe, it, expect } from "vitest";
import { runEcowittCloudCanary } from "@/lib/ecowittCloudCanaryVerdict";
import {
  normalizeEcowittCloudReadings,
  type EcowittCloudMappingConfig,
} from "@/lib/ecowittPayloadRules";
import fixtures from "../../fixtures/ecowitt-cloud-canary-payloads.json";

const SEED = 0xc0ffee;
const ITERATIONS = 200;

const ORDER = [
  "happy_multi_channel",
  "stale_only",
  "invalid_humidity",
  "stuck_soil_extreme",
  "unmapped_channel",
  "missing_metrics",
  "pressure_present",
  "celsius_looking_fahrenheit",
] as const;

const baseFixtures = ORDER.map((id) => ({
  id,
  payload: (fixtures.payloads as Record<string, unknown>)[id],
}));

const mapping = fixtures.mapping as unknown as EcowittCloudMappingConfig;
const options = { now: new Date(fixtures.now) };

// ---------- seeded RNG + Fisher–Yates ----------
function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: readonly T[], rng: () => number): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ---------- baseline (canonical order) ----------
const baseline = runEcowittCloudCanary(baseFixtures, mapping, options);
const baselineById = new Map(
  baseline.summaries.map((s) => [s.fixture_id, s] as const),
);

describe("ecowitt cloud canary — property-based verdict-count invariants", () => {
  it("baseline sanity: every fixture id is represented and counts are non-negative", () => {
    expect(baseline.summaries.length).toBe(baseFixtures.length);
    for (const s of baseline.summaries) {
      expect(s.mapped_count).toBeGreaterThanOrEqual(0);
      expect(s.unmapped_count).toBeGreaterThanOrEqual(0);
      expect(s.live_count).toBeGreaterThanOrEqual(0);
      expect(s.stale_count).toBeGreaterThanOrEqual(0);
      expect(s.invalid_count).toBeGreaterThanOrEqual(0);
    }
  });

  it(`P1+P4: order-independence over ${ITERATIONS} seeded permutations`, () => {
    const rng = mulberry32(SEED);
    for (let i = 0; i < ITERATIONS; i++) {
      const perm = shuffle(baseFixtures, rng);
      const v = runEcowittCloudCanary(perm, mapping, options);

      // P4: no silent drop
      expect(v.summaries.length).toBe(baseFixtures.length);
      expect(new Set(v.summaries.map((s) => s.fixture_id)).size).toBe(
        baseFixtures.length,
      );

      // P1: totals identical
      expect(v.totals).toEqual(baseline.totals);

      // P1: per-fixture summary identical (matched by id, order-agnostic)
      for (const s of v.summaries) {
        const base = baselineById.get(s.fixture_id);
        expect(base).toBeDefined();
        expect(s).toEqual(base);
      }
    }
  });

  it("P2: mapping partition — totals.mapped + totals.unmapped is stable, rows[] and unmapped[] are disjoint per fixture", () => {
    // Stability across permutations is covered by P1; here we additionally
    // assert the per-fixture disjointness directly from the slice-1 fn.
    const rng = mulberry32(SEED ^ 0x9e3779b1);
    const expectedSum = baseline.totals.mapped + baseline.totals.unmapped;

    for (let i = 0; i < ITERATIONS; i++) {
      const perm = shuffle(baseFixtures, rng);
      const v = runEcowittCloudCanary(perm, mapping, options);
      expect(v.totals.mapped + v.totals.unmapped).toBe(expectedSum);

      // Per-fixture: a mapped row and an unmapped record must not collide on
      // the same (channel, raw_key) — that would mean it landed in both
      // buckets simultaneously.
      for (const f of perm) {
        const res = normalizeEcowittCloudReadings(f.payload, mapping, options);
        const mappedKeys = new Set(
          res.rows.map(
            (r) =>
              `${r.channel}|${(r.reading.raw_payload as { raw_key?: string })?.raw_key ?? ""}`,
          ),
        );
        for (const u of res.unmapped) {
          const k = `${u.channel ?? ""}|${u.raw_key}`;
          expect(mappedKeys.has(k)).toBe(false);
        }
      }
    }
  });

  it("P3: source partition — live + stale + invalid == mapped_count, every mapped row has exactly one valid source", () => {
    const rng = mulberry32(SEED ^ 0x243f6a88);
    for (let i = 0; i < ITERATIONS; i++) {
      const perm = shuffle(baseFixtures, rng);
      const v = runEcowittCloudCanary(perm, mapping, options);
      for (const s of v.summaries) {
        expect(s.live_count + s.stale_count + s.invalid_count).toBe(
          s.mapped_count,
        );
      }
      // Walk normalized output directly to confirm exactly-one source per row.
      for (const f of perm) {
        const res = normalizeEcowittCloudReadings(f.payload, mapping, options);
        for (const row of res.rows) {
          expect(["live", "stale", "invalid"]).toContain(row.reading.source);
        }
      }
    }

    // And at aggregate level
    expect(
      baseline.totals.live + baseline.totals.stale + baseline.totals.invalid,
    ).toBe(baseline.totals.mapped);
  });

  it("P5: determinism — repeated normalize on identical input yields identical counts", () => {
    for (const f of baseFixtures) {
      const a = normalizeEcowittCloudReadings(f.payload, mapping, options);
      const b = normalizeEcowittCloudReadings(f.payload, mapping, options);
      expect(b.rows.length).toBe(a.rows.length);
      expect(b.unmapped.length).toBe(a.unmapped.length);
      expect(b.rows.map((r) => r.reading.source)).toEqual(
        a.rows.map((r) => r.reading.source),
      );
    }
    // And the verdict helper is itself deterministic.
    const again = runEcowittCloudCanary(baseFixtures, mapping, options);
    expect(again).toEqual(baseline);
  });
});
