import { describe, expect, it } from "vitest";

import {
  bucketRequestMetrics,
  bucketSnapshots,
  distinctOutcomes,
  distinctValues,
  TREND_RANGES,
  type EdgeMetricEventRow,
  type RequestMetricBucket,
} from "@/lib/edgeMetricTrendRules";

const NOW = Date.parse("2026-07-27T12:00:00.000Z");

function req(
  createdAt: string,
  outcome: string,
  duration_ms: number | null,
  extra: Partial<EdgeMetricEventRow> = {},
): EdgeMetricEventRow {
  return {
    event_type: "request_metric",
    outcome,
    duration_ms,
    requests_in_window: null,
    duration_ms_mean_in_window: null,
    duration_ms_max_in_window: null,
    counters: null,
    supabase_env: "prod",
    fn: "founder-slots-remaining",
    created_at: createdAt,
    ...extra,
  };
}

function snap(
  createdAt: string,
  n: number,
  mean: number,
  max: number,
  counters: Record<string, number>,
): EdgeMetricEventRow {
  return {
    event_type: "metric_snapshot",
    outcome: null,
    duration_ms: null,
    requests_in_window: n,
    duration_ms_mean_in_window: mean,
    duration_ms_max_in_window: max,
    counters,
    supabase_env: "prod",
    fn: "founder-slots-remaining",
    created_at: createdAt,
  };
}

describe("bucketRequestMetrics", () => {
  it("buckets by hour with per-outcome counts and latency stats", () => {
    const rows = [
      req("2026-07-27T11:05:00Z", "success", 10),
      req("2026-07-27T11:45:00Z", "success", 20),
      req("2026-07-27T11:55:00Z", "rpc_error", 200),
      req("2026-07-27T10:00:00Z", "success", 5),
    ];
    const out = bucketRequestMetrics(rows, TREND_RANGES["24h"], NOW);
    expect(out).toHaveLength(2);
    const eleven = out.find((b) => b.bucketStartMs === Date.parse("2026-07-27T11:00:00Z"))!;
    expect(eleven.total).toBe(3);
    expect(eleven.byOutcome).toEqual({ success: 2, rpc_error: 1 });
    expect(eleven.latencyMeanMs).toBeCloseTo((10 + 20 + 200) / 3, 1);
    expect(eleven.latencyMaxMs).toBe(200);
  });

  it("excludes rows outside the window and rows with unparseable timestamps", () => {
    const rows = [
      req("2026-07-20T00:00:00Z", "success", 1), // outside 24h
      req("not-a-date", "success", 2),
      req("2026-07-27T11:00:00Z", "success", 3),
    ];
    const out = bucketRequestMetrics(rows, TREND_RANGES["24h"], NOW);
    expect(out).toHaveLength(1);
    expect(out[0].total).toBe(1);
  });

  it("returns null latency when no duration samples are present", () => {
    const rows = [req("2026-07-27T11:00:00Z", "success", null)];
    const out = bucketRequestMetrics(rows, TREND_RANGES["24h"], NOW);
    expect(out[0].latencyMeanMs).toBeNull();
    expect(out[0].latencyMaxMs).toBeNull();
  });

  it("labels missing outcome as 'unknown'", () => {
    const rows = [req("2026-07-27T11:00:00Z", null as unknown as string, 1)];
    const out = bucketRequestMetrics(rows, TREND_RANGES["24h"], NOW);
    expect(out[0].byOutcome).toEqual({ unknown: 1 });
  });
});

describe("bucketSnapshots", () => {
  it("sums requestsInWindow and merges counters, weighting latency mean", () => {
    const rows = [
      snap("2026-07-27T11:00:00Z", 10, 5, 20, { success: 8, rpc_error: 2 }),
      snap("2026-07-27T11:30:00Z", 30, 8, 40, { success: 28, rpc_error: 2 }),
    ];
    const out = bucketSnapshots(rows, TREND_RANGES["24h"], NOW);
    expect(out).toHaveLength(1);
    expect(out[0].requestsInWindow).toBe(40);
    expect(out[0].counters).toEqual({ success: 36, rpc_error: 4 });
    // weighted mean = (5*10 + 8*30) / 40 = 7.25
    expect(out[0].latencyMeanMs).toBe(7.25);
    expect(out[0].latencyMaxMs).toBe(40);
  });

  it("returns buckets sorted ascending by time", () => {
    const rows = [
      snap("2026-07-27T09:00:00Z", 1, 1, 1, {}),
      snap("2026-07-27T05:00:00Z", 1, 1, 1, {}),
      snap("2026-07-27T11:00:00Z", 1, 1, 1, {}),
    ];
    const out = bucketSnapshots(rows, TREND_RANGES["24h"], NOW);
    expect(out.map((b) => b.bucketStartMs)).toEqual([
      Date.parse("2026-07-27T05:00:00Z"),
      Date.parse("2026-07-27T09:00:00Z"),
      Date.parse("2026-07-27T11:00:00Z"),
    ]);
  });
});

describe("distinct helpers", () => {
  it("distinctValues maps nulls to '(none)' and sorts", () => {
    const rows = [
      req("2026-07-27T11:00:00Z", "success", 1, { fn: "b" }),
      req("2026-07-27T11:00:00Z", "success", 1, { fn: "a" }),
      req("2026-07-27T11:00:00Z", "success", 1, { supabase_env: null }),
    ];
    expect(distinctValues(rows, "fn")).toEqual(["a", "b", "founder-slots-remaining"]);
    expect(distinctValues(rows, "supabase_env")).toEqual(["(none)", "prod"]);
  });

  it("distinctOutcomes collects across buckets", () => {
    const buckets: RequestMetricBucket[] = [
      {
        bucketStartMs: 1,
        total: 1,
        byOutcome: { success: 1 },
        latencyMeanMs: null,
        latencyMaxMs: null,
      },
      {
        bucketStartMs: 2,
        total: 1,
        byOutcome: { rpc_error: 1 },
        latencyMeanMs: null,
        latencyMaxMs: null,
      },
    ];
    expect(distinctOutcomes(buckets)).toEqual(["rpc_error", "success"]);
  });
});
