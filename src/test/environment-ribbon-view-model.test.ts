import { describe, it, expect } from "vitest";
import {
  buildEnvironmentRibbonViewModel,
  classifyRibbonReadingSource,
  formatBucketClock,
  DEFAULT_RIBBON_BUCKET_MINUTES,
  type EnvironmentRibbonReadingLike,
} from "@/lib/environmentRibbonViewModel";

const NOW = Date.parse("2026-09-02T15:00:00.000Z");
const MIN = 60_000;

function reading(
  minutesAgo: number,
  over: Partial<EnvironmentRibbonReadingLike> = {},
): EnvironmentRibbonReadingLike {
  return {
    capturedAt: new Date(NOW - minutesAgo * MIN).toISOString(),
    temp: 24,
    rh: 55,
    source: "live",
    status: "usable",
    ...over,
  };
}

describe("environmentRibbonViewModel — happy path", () => {
  it("buckets a full day of live readings into 288 five-minute buckets with VPD", () => {
    const readings: EnvironmentRibbonReadingLike[] = [];
    for (let m = 0; m < 24 * 60; m += 5) readings.push(reading(m));
    const vm = buildEnvironmentRibbonViewModel({
      readings,
      now: NOW,
      targetVpd: { minKpa: 1.2, maxKpa: 1.5 },
    });
    expect(vm.buckets).toHaveLength(288);
    expect(vm.bucketMinutes).toBe(DEFAULT_RIBBON_BUCKET_MINUTES);
    expect(vm.counts.live).toBe(288);
    expect(vm.counts.none).toBe(0);
    expect(vm.runs).toEqual([{ source: "live", startIndex: 0, endIndex: 287 }]);
    expect(vm.hasAnyReading).toBe(true);
    expect(vm.hasAnyVpd).toBe(true);
    // 24 °C @ 55 % → 2.98 * 0.45 ≈ 1.34 kPa
    expect(vm.latest?.vpdKpa).toBeCloseTo(1.34, 1);
    expect(vm.latest?.vpdBandStatus).toBe("in_band");
    expect(vm.latest?.source).toBe("live");
    expect(vm.latest?.bucketIndex).toBe(287);
  });

  it("groups mixed sources into contiguous provenance runs in time order", () => {
    const vm = buildEnvironmentRibbonViewModel({
      readings: [
        reading(20, { source: "live" }),
        reading(15, { source: "live" }),
        reading(10, { source: "manual" }),
        reading(5, { source: "csv" }),
        reading(0, { source: "csv" }),
      ],
      now: NOW,
      windowHours: 0.5, // 6 buckets
    });
    expect(vm.buckets.map((b) => b.source)).toEqual([
      "none",
      "live",
      "live",
      "manual",
      "csv",
      "csv",
    ]);
    expect(vm.runs).toEqual([
      { source: "none", startIndex: 0, endIndex: 0 },
      { source: "live", startIndex: 1, endIndex: 2 },
      { source: "manual", startIndex: 3, endIndex: 3 },
      { source: "csv", startIndex: 4, endIndex: 5 },
    ]);
  });

  it("reports the band status from the injected target", () => {
    const low = buildEnvironmentRibbonViewModel({
      readings: [reading(0, { temp: 22, rh: 70 })],
      now: NOW,
      targetVpd: { minKpa: 1.2, maxKpa: 1.5 },
    });
    const high = buildEnvironmentRibbonViewModel({
      readings: [reading(0, { temp: 27, rh: 45 })],
      now: NOW,
      targetVpd: { minKpa: 1.2, maxKpa: 1.5 },
    });
    expect(low.latest?.vpdBandStatus).toBe("low");
    expect(high.latest?.vpdBandStatus).toBe("high");
  });
});

describe("environmentRibbonViewModel — boundaries", () => {
  it("places a reading exactly at now into the last bucket", () => {
    const vm = buildEnvironmentRibbonViewModel({ readings: [reading(0)], now: NOW });
    expect(vm.buckets[287].readingCount).toBe(1);
    expect(vm.latest?.bucketIndex).toBe(287);
  });

  it("drops readings before the window start and after now", () => {
    const vm = buildEnvironmentRibbonViewModel({
      readings: [reading(24 * 60 + 1), reading(-1)],
      now: NOW,
    });
    expect(vm.hasAnyReading).toBe(false);
    expect(vm.counts.none).toBe(288);
  });

  it("keeps a reading exactly at the window start in bucket 0", () => {
    const vm = buildEnvironmentRibbonViewModel({ readings: [reading(24 * 60)], now: NOW });
    expect(vm.buckets[0].readingCount).toBe(1);
  });

  it("honours custom window and bucket sizes and rounds bucket count up", () => {
    const vm = buildEnvironmentRibbonViewModel({
      readings: [],
      now: NOW,
      windowHours: 1,
      bucketMinutes: 7,
    });
    expect(vm.buckets).toHaveLength(9); // ceil(60 / 7)
    expect(vm.windowEndMs - vm.windowStartMs).toBe(9 * 7 * MIN);
  });

  it("uses the newest reading in a bucket for values and counts them all", () => {
    const vm = buildEnvironmentRibbonViewModel({
      readings: [reading(4, { temp: 20 }), reading(1, { temp: 26 })],
      now: NOW,
    });
    const b = vm.buckets[287];
    expect(b.readingCount).toBe(2);
    expect(b.tempC).toBe(26);
  });

  it("accepts ISO strings and Date objects for now", () => {
    const a = buildEnvironmentRibbonViewModel({ readings: [reading(0)], now: NOW });
    const b = buildEnvironmentRibbonViewModel({
      readings: [reading(0)],
      now: new Date(NOW).toISOString(),
    });
    const c = buildEnvironmentRibbonViewModel({ readings: [reading(0)], now: new Date(NOW) });
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });

  it("prefers capturedAt over ts and falls back to ts", () => {
    const withBoth = buildEnvironmentRibbonViewModel({
      readings: [
        {
          capturedAt: new Date(NOW).toISOString(),
          ts: new Date(NOW - 60 * MIN).toISOString(),
          temp: 24,
          rh: 55,
          source: "live",
          status: "usable",
        },
      ],
      now: NOW,
    });
    expect(withBoth.latest?.bucketIndex).toBe(287);
    const tsOnly = buildEnvironmentRibbonViewModel({
      readings: [
        {
          ts: new Date(NOW - 60 * MIN).toISOString(),
          temp: 24,
          rh: 55,
          source: "live",
          status: "usable",
        },
      ],
      now: NOW,
    });
    expect(tsOnly.latest?.bucketIndex).toBe(287 - 12);
  });
});

describe("environmentRibbonViewModel — null and invalid inputs never throw", () => {
  it.each([null, undefined, [], "nope", 42, {}])("tolerates readings=%p", (readings) => {
    const vm = buildEnvironmentRibbonViewModel({
      readings: readings as unknown as EnvironmentRibbonReadingLike[],
      now: NOW,
    });
    expect(vm.hasAnyReading).toBe(false);
    expect(vm.latest).toBeNull();
    expect(vm.buckets).toHaveLength(288);
  });

  it("drops malformed entries and unparseable timestamps", () => {
    const vm = buildEnvironmentRibbonViewModel({
      readings: [
        null as unknown as EnvironmentRibbonReadingLike,
        "x" as unknown as EnvironmentRibbonReadingLike,
        { capturedAt: "not a date", temp: 24, rh: 55, source: "live", status: "usable" },
        { temp: 24, rh: 55, source: "live", status: "usable" },
        reading(0),
      ],
      now: NOW,
    });
    expect(vm.counts.live).toBe(1);
    expect(vm.counts.none).toBe(287);
  });

  it("anchors an empty window at epoch 0 when now is malformed", () => {
    const vm = buildEnvironmentRibbonViewModel({ readings: [reading(0)], now: "garbage" });
    expect(vm.windowEndMs).toBe(0);
    expect(vm.hasAnyReading).toBe(false);
  });

  it("ignores non-finite temp / rh and NaN window params", () => {
    const vm = buildEnvironmentRibbonViewModel({
      readings: [reading(0, { temp: Number.NaN, rh: Number.POSITIVE_INFINITY })],
      now: NOW,
      windowHours: Number.NaN,
      bucketMinutes: -5,
    });
    expect(vm.buckets).toHaveLength(288);
    const b = vm.buckets[287];
    expect(b.tempC).toBeNull();
    expect(b.rhPct).toBeNull();
    expect(b.vpdKpa).toBeNull();
    expect(b.source).toBe("live"); // provenance survives; value does not
  });

  it("treats a missing observedMetrics entry as a missing metric, not a zero", () => {
    const vm = buildEnvironmentRibbonViewModel({
      readings: [reading(0, { rh: 0, observedMetrics: ["temp"] })],
      now: NOW,
    });
    const b = vm.buckets[287];
    expect(b.rhPct).toBeNull();
    expect(b.vpdKpa).toBeNull();
    expect(b.source).toBe("live");
  });
});

describe("environmentRibbonViewModel — determinism", () => {
  it("returns deep-equal output for identical input on repeat calls", () => {
    const readings = [reading(30), reading(20, { source: "manual" }), reading(0)];
    const a = buildEnvironmentRibbonViewModel({ readings, now: NOW });
    const b = buildEnvironmentRibbonViewModel({ readings, now: NOW });
    expect(b).toEqual(a);
  });

  it("is independent of input order for distinct timestamps", () => {
    const readings = [reading(30), reading(20, { source: "manual" }), reading(0)];
    const a = buildEnvironmentRibbonViewModel({ readings, now: NOW });
    const b = buildEnvironmentRibbonViewModel({ readings: [...readings].reverse(), now: NOW });
    expect(b).toEqual(a);
  });

  it("breaks same-timestamp ties by input order (later entry wins)", () => {
    const ts = new Date(NOW).toISOString();
    const vm = buildEnvironmentRibbonViewModel({
      readings: [
        { capturedAt: ts, temp: 20, rh: 55, source: "live", status: "usable" },
        { capturedAt: ts, temp: 26, rh: 55, source: "live", status: "usable" },
      ],
      now: NOW,
    });
    expect(vm.buckets[287].tempC).toBe(26);
  });
});

describe("environmentRibbonViewModel — safety fences", () => {
  it("never labels an unknown or missing source as healthy", () => {
    expect(classifyRibbonReadingSource({ source: "totally_new_vendor", status: "usable" })).toBe(
      "invalid",
    );
    expect(classifyRibbonReadingSource({ source: null, status: "usable" })).toBe("invalid");
    expect(classifyRibbonReadingSource({ source: "", status: "usable" })).toBe("invalid");
  });

  it("maps non-usable status fail-closed", () => {
    expect(classifyRibbonReadingSource({ source: "live", status: "stale" })).toBe("stale");
    expect(classifyRibbonReadingSource({ source: "live", status: "needs_review" })).toBe("invalid");
    expect(classifyRibbonReadingSource({ source: "live", status: "no_data" })).toBe("invalid");
    expect(classifyRibbonReadingSource({ source: "live", status: undefined })).toBe("invalid");
    expect(classifyRibbonReadingSource({ source: "live", status: "USABLE" })).toBe("live");
  });

  it("keeps demo labelled demo even when stale, never promotes it", () => {
    expect(classifyRibbonReadingSource({ source: "demo", status: "stale" })).toBe("demo");
    expect(classifyRibbonReadingSource({ source: "mock", status: "usable" })).toBe("demo");
  });

  it("marks pinned RH (0 % or 100 %) invalid and excludes it from VPD", () => {
    for (const rh of [0, 100, -3, 104]) {
      const vm = buildEnvironmentRibbonViewModel({ readings: [reading(0, { rh })], now: NOW });
      const b = vm.buckets[287];
      expect(b.source).toBe("invalid");
      expect(b.vpdKpa).toBeNull();
      expect(b.rhPct).toBeNull();
      expect(b.tempC).toBeNull();
    }
  });

  it("marks out-of-range temperature invalid rather than plotting it", () => {
    const vm = buildEnvironmentRibbonViewModel({
      readings: [reading(0, { temp: 140 /* °F mistaken for °C */ })],
      now: NOW,
    });
    expect(vm.buckets[287].source).toBe("invalid");
    expect(vm.buckets[287].vpdKpa).toBeNull();
  });

  it("computes VPD for stale buckets but keeps them labelled stale", () => {
    const vm = buildEnvironmentRibbonViewModel({
      readings: [reading(0, { status: "stale" })],
      now: NOW,
      targetVpd: { minKpa: 1.2, maxKpa: 1.5 },
    });
    expect(vm.latest?.source).toBe("stale");
    expect(vm.latest?.vpdKpa).not.toBeNull();
  });

  it("renders gaps as none and never interpolates across them", () => {
    const vm = buildEnvironmentRibbonViewModel({
      readings: [reading(20), reading(0)],
      now: NOW,
      windowHours: 0.5,
    });
    expect(vm.buckets.map((b) => b.source)).toEqual([
      "none",
      "live",
      "none",
      "none",
      "none",
      "live",
    ]);
    for (const b of vm.buckets.filter((x) => x.source === "none")) {
      expect(b.tempC).toBeNull();
      expect(b.vpdKpa).toBeNull();
      expect(b.readingCount).toBe(0);
    }
  });

  it("only ever emits the six canonical sources plus none", () => {
    const vm = buildEnvironmentRibbonViewModel({
      readings: [
        reading(5, { source: "pi_bridge" }),
        reading(4, { source: "home_assistant" }),
        reading(3, { source: "webhook" }),
        reading(2, { source: "unknown" }),
        reading(1, { source: "import" }),
      ],
      now: NOW,
      windowHours: 0.5,
    });
    const allowed = new Set(["live", "manual", "csv", "demo", "stale", "invalid", "none"]);
    for (const b of vm.buckets) expect(allowed.has(b.source)).toBe(true);
    for (const r of vm.runs) expect(allowed.has(r.source)).toBe(true);
  });

  it("reports an invalid band status as unknown, never in_band", () => {
    const vm = buildEnvironmentRibbonViewModel({
      readings: [reading(0, { rh: 100 })],
      now: NOW,
      targetVpd: { minKpa: 1.2, maxKpa: 1.5 },
    });
    expect(vm.latest?.vpdBandStatus).toBe("unknown");
  });

  it("returns unknown for a malformed target band", () => {
    const vm = buildEnvironmentRibbonViewModel({
      readings: [reading(0)],
      now: NOW,
      targetVpd: { minKpa: 1.5, maxKpa: 1.2 },
    });
    expect(vm.latest?.vpdBandStatus).toBe("unknown");
  });
});

describe("formatBucketClock", () => {
  it("formats UTC and offset clocks", () => {
    expect(formatBucketClock(Date.parse("2026-09-02T15:05:00.000Z"))).toBe("15:05");
    expect(formatBucketClock(Date.parse("2026-09-02T15:05:00.000Z"), -300)).toBe("10:05");
  });
});
