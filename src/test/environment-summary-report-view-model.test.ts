/**
 * environmentSummaryReportViewModel tests.
 */
import { describe, it, expect } from "vitest";
import { buildEnvironmentCheckDiaryViewModel } from "@/lib/environmentCheckViewModel";
import { buildEnvironmentSummaryReportViewModel } from "@/lib/environmentSummaryReportViewModel";

function vm(args: {
  id: string;
  source: string;
  tempC?: number;
  rhPercent?: number;
  vpdBand?: { minKpa: number; maxKpa: number };
  ppfdDst?: boolean;
}) {
  const snapshot: any = {
    source: args.source,
    tempC: args.tempC ?? 24,
    rhPercent: args.rhPercent ?? 60,
    vpdBand: args.vpdBand,
  };
  if (args.ppfdDst) {
    snapshot.ppfdSamples = [
      { ts: "2026-03-08T09:00:00Z", ppfd: 200, source: "live" },
      { ts: "2026-03-09T00:00:00Z", ppfd: 200, source: "live" },
    ];
    snapshot.tzIana = "America/Los_Angeles";
  }
  return buildEnvironmentCheckDiaryViewModel({
    entryId: args.id,
    occurredAt: "2026-06-11T12:00:00Z",
    kind: "environment",
    snapshot,
  });
}

describe("buildEnvironmentSummaryReportViewModel", () => {
  it("returns empty state when no checks", () => {
    const r = buildEnvironmentSummaryReportViewModel({
      startDate: "2026-06-01",
      endDate: "2026-06-11",
      checks: [],
    });
    expect(r.totalChecks).toBe(0);
    expect(r.emptyState).toMatch(/No environment checks/);
    expect(r.isPremiumReport).toBe(true);
    expect(r.dateRangeLabel).toBe("2026-06-01 — 2026-06-11");
  });

  it("aggregates valid/invalid/DST/review counts", () => {
    const checks = [
      vm({ id: "a", source: "live", vpdBand: { minKpa: 0.8, maxKpa: 1.5 } }), // valid
      vm({ id: "b", source: "live", tempC: 30, rhPercent: 30, vpdBand: { minKpa: 0.8, maxKpa: 1.3 } }), // review
      vm({ id: "c", source: "bogus" }), // invalid
      vm({ id: "d", source: "live", ppfdDst: true }), // dst_ambiguous
    ];
    const r = buildEnvironmentSummaryReportViewModel({
      startDate: "2026-06-01",
      endDate: "2026-06-11",
      checks,
    });
    expect(r.totalChecks).toBe(4);
    expect(r.statusCounts.valid).toBe(1);
    expect(r.statusCounts.review_required).toBe(1);
    expect(r.statusCounts.invalid).toBe(1);
    expect(r.statusCounts.dst_ambiguous).toBe(1);
    expect(r.emptyState).toBeNull();
  });

  it("separates source counts (live/manual/csv/demo/stale/invalid)", () => {
    const checks = [
      vm({ id: "a", source: "live" }),
      vm({ id: "b", source: "manual" }),
      vm({ id: "c", source: "csv" }),
      vm({ id: "d", source: "demo" }),
      vm({ id: "e", source: "stale" }),
      vm({ id: "f", source: "bogus" }), // → invalid
    ];
    const r = buildEnvironmentSummaryReportViewModel({
      startDate: "2026-06-01",
      endDate: "2026-06-11",
      checks,
    });
    expect(r.sourceCounts.live).toBe(1);
    expect(r.sourceCounts.manual).toBe(1);
    expect(r.sourceCounts.csv).toBe(1);
    expect(r.sourceCounts.demo).toBe(1);
    expect(r.sourceCounts.stale).toBe(1);
    expect(r.sourceCounts.invalid).toBe(1);
  });

  it("orders top issues deterministically (severity desc then count desc) and exposes drilldown fields", () => {
    const checks = [
      vm({ id: "a", source: "stale" }),
      vm({ id: "b", source: "stale" }),
      vm({ id: "c", source: "bogus" }), // source.invalid (critical, count=1)
    ];
    const r = buildEnvironmentSummaryReportViewModel({
      startDate: "2026-06-01",
      endDate: "2026-06-11",
      checks,
    });
    // critical severity outranks warning regardless of count.
    expect(r.topIssues[0].ruleId).toBe("source.invalid");
    const sourceReview = r.topIssues.find((i) => i.ruleId === "source.review")!;
    expect(sourceReview.count).toBe(2);
    expect(sourceReview.relatedEntryIds.sort()).toEqual(["a", "b"]);
    expect(sourceReview.drilldownUrl).toContain("issue=source.review");
    expect(sourceReview.drilldownUrl).toContain("start=2026-06-01");
    expect(sourceReview.drilldownLabel).toBe("View 2 related checks");
    // Stable re-run.
    const r2 = buildEnvironmentSummaryReportViewModel({
      startDate: "2026-06-01",
      endDate: "2026-06-11",
      checks,
    });
    expect(r2.topIssues.map((i) => i.ruleId)).toEqual(r.topIssues.map((i) => i.ruleId));
  });

  it("top issues never list unrelated diary entries (only contributing entries)", () => {
    const checks = [
      vm({ id: "stale-1", source: "stale" }),
      vm({ id: "valid-1", source: "live", vpdBand: { minKpa: 0.8, maxKpa: 1.5 } }),
    ];
    const r = buildEnvironmentSummaryReportViewModel({
      startDate: "2026-06-01",
      endDate: "2026-06-11",
      checks,
    });
    const sourceReview = r.topIssues.find((i) => i.ruleId === "source.review")!;
    expect(sourceReview.relatedEntryIds).toEqual(["stale-1"]);
    expect(sourceReview.relatedEntryIds).not.toContain("valid-1");
  });


  it("accumulates metric coverage from snapshot metrics", () => {
    const checks = [
      vm({ id: "a", source: "live", vpdBand: { minKpa: 0.8, maxKpa: 1.5 } }),
      vm({ id: "b", source: "live", vpdBand: { minKpa: 0.8, maxKpa: 1.5 } }),
    ];
    const r = buildEnvironmentSummaryReportViewModel({
      startDate: "2026-06-01",
      endDate: "2026-06-11",
      checks,
    });
    const temp = r.metricCoverage.find((m) => m.metricKey === "temp_c");
    expect(temp?.sampleCount).toBe(2);
    expect(temp?.invalidCount).toBe(0);
  });
});
