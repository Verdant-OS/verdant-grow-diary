import { describe, expect, it } from "vitest";
import {
  classifyPr,
  summarizeOpenPrs,
  summarizeQueue,
  evaluateAlerts,
  scaleThresholds,
  clamp,
  DEFAULT_THRESHOLDS,
  DEFAULT_SCALING,
  loadThresholds,
} from "../../scripts/ci/merge-queue-snapshot.mjs";
import { join } from "node:path";

describe("merge-queue-snapshot helpers", () => {
  it("classifies DIRTY / BEHIND / BLOCKED / UNSTABLE", () => {
    expect(classifyPr({ mergeable: "CONFLICTING", mergeStateStatus: "DIRTY" })).toBe("DIRTY");
    expect(classifyPr({ mergeable: "MERGEABLE", mergeStateStatus: "BEHIND" })).toBe("BEHIND");
    expect(classifyPr({ mergeable: "MERGEABLE", mergeStateStatus: "BLOCKED" })).toBe("BLOCKED");
    expect(classifyPr({ mergeable: "MERGEABLE", mergeStateStatus: "UNSTABLE" })).toBe("UNSTABLE");
    expect(classifyPr({ mergeable: "MERGEABLE", mergeStateStatus: "CLEAN" })).toBe("CLEAN");
  });

  it("summarizes open PR buckets and auto-merge", () => {
    const buckets = summarizeOpenPrs([
      { number: 1, title: "a", mergeable: "CONFLICTING", mergeStateStatus: "DIRTY" },
      { number: 2, title: "b", mergeable: "MERGEABLE", mergeStateStatus: "BEHIND" },
      {
        number: 3,
        title: "c",
        mergeable: "MERGEABLE",
        mergeStateStatus: "BLOCKED",
        autoMergeRequest: { enabledAt: "x" },
      },
    ]);
    expect(buckets.DIRTY.map((p) => p.number)).toEqual([1]);
    expect(buckets.BEHIND.map((p) => p.number)).toEqual([2]);
    expect(buckets.BLOCKED.map((p) => p.number)).toEqual([3]);
    expect(buckets.AUTO_MERGE.map((p) => p.number)).toEqual([3]);
  });

  it("summarizes queue depth and ages", () => {
    const now = new Date("2026-08-05T01:00:00.000Z");
    const s = summarizeQueue(
      {
        nextEntryEstimatedTimeToMerge: 120,
        entries: {
          totalCount: 2,
          nodes: [
            {
              position: 1,
              state: "QUEUED",
              enqueuedAt: "2026-08-05T00:50:00.000Z",
              estimatedTimeToMerge: 60,
              pullRequest: { number: 722, title: "docs", url: "https://example" },
            },
            {
              position: 2,
              state: "AWAITING_CHECKS",
              enqueuedAt: "2026-08-05T00:55:00.000Z",
              pullRequest: { number: 719, title: "alt", url: "https://example" },
            },
          ],
        },
      },
      now,
    );
    expect(s.depth).toBe(2);
    expect(s.maxAgeSec).toBe(600);
    expect(s.medianAgeSec).toBe(450);
  });

  it("loads thresholds and scaling from JSON file", () => {
    const loaded = loadThresholds(join(process.cwd(), "scripts/ci/merge-queue-thresholds.json"));
    expect(loaded.source).toBe("file");
    expect(loaded.thresholds.queue_depth.warn).toBe(3);
    expect(loaded.scaling.enabled).toBe(true);
    expect(loaded.scaling.baseline_open_prs).toBe(10);
    expect(loaded.scaling.ratio_alerts.dirty_ratio.critical).toBe(0.7);
  });

  it("clamp bounds factor inputs", () => {
    expect(clamp(0.5, 1, 2.5)).toBe(1);
    expect(clamp(3, 1, 2.5)).toBe(2.5);
    expect(clamp(1.5, 1, 2.5)).toBe(1.5);
  });

  it("scaleThresholds raises count floors with open-PR load", () => {
    // 20 open / baseline 10 => factor 2
    const s = scaleThresholds(DEFAULT_THRESHOLDS, { openPrTotal: 20 }, DEFAULT_SCALING);
    expect(s.factor).toBe(2);
    expect(s.effective.dirty_open_prs.warn).toBe(10); // 5 * 2
    expect(s.effective.dirty_open_prs.critical).toBe(20); // 10 * 2
    // ages fixed
    expect(s.effective.max_age_sec).toEqual(DEFAULT_THRESHOLDS.max_age_sec);
    // never below base when open is small
    const low = scaleThresholds(DEFAULT_THRESHOLDS, { openPrTotal: 3 }, DEFAULT_SCALING);
    expect(low.factor).toBe(1);
    expect(low.effective.dirty_open_prs.warn).toBe(5);
  });

  it("scaleThresholds respects --no-scale / disabled", () => {
    const s = scaleThresholds(DEFAULT_THRESHOLDS, { openPrTotal: 50 }, DEFAULT_SCALING, {
      disabled: true,
    });
    expect(s.enabled).toBe(false);
    expect(s.factor).toBe(1);
    expect(s.effective.dirty_open_prs).toEqual(DEFAULT_THRESHOLDS.dirty_open_prs);
  });

  it("scaleThresholds caps queue_depth at depth_max_cap", () => {
    const s = scaleThresholds(DEFAULT_THRESHOLDS, { openPrTotal: 100 }, DEFAULT_SCALING);
    expect(s.factor).toBe(2.5);
    expect(s.effective.queue_depth.critical).toBeLessThanOrEqual(5);
  });

  it("evaluateAlerts quiet under scaled thresholds", () => {
    const scaled = scaleThresholds(DEFAULT_THRESHOLDS, { openPrTotal: 20 }, DEFAULT_SCALING);
    // dirty=6 would warn at base (5) but not at scaled warn 10
    const ev = evaluateAlerts(
      {
        queue: { depth: 0, maxAgeSec: null, medianAgeSec: null },
        openPrs: {
          total: 20,
          counts: { DIRTY: 6, BEHIND: 2, BLOCKED: 1 },
          autoMergeCount: 0,
        },
      },
      scaled.effective,
      scaled.scaling,
    );
    expect(ev.alerts.filter((a) => a.metric === "dirty_open_prs")).toEqual([]);
  });

  it("evaluateAlerts ratio bands fire on high dirty fraction", () => {
    const scaled = scaleThresholds(DEFAULT_THRESHOLDS, { openPrTotal: 10 }, DEFAULT_SCALING);
    // 6/10 = 0.6 dirty ratio → warn (0.45) but not critical (0.7)
    // absolute dirty 6 also >= base warn 5
    const ev = evaluateAlerts(
      {
        queue: { depth: 0, maxAgeSec: null, medianAgeSec: null },
        openPrs: {
          total: 10,
          counts: { DIRTY: 6, BEHIND: 0, BLOCKED: 0 },
          autoMergeCount: 0,
        },
      },
      scaled.effective,
      scaled.scaling,
    );
    const ratios = ev.alerts.filter((a) => a.metric === "dirty_ratio");
    expect(ratios.length).toBe(1);
    expect(ratios[0].severity).toBe("warn");
    expect(ratios[0].kind).toBe("ratio");
  });

  it("null ages do not alert", () => {
    const ev = evaluateAlerts(
      {
        queue: { depth: 0, maxAgeSec: null, medianAgeSec: null },
        openPrs: { total: 0, counts: {}, autoMergeCount: 0 },
      },
      DEFAULT_THRESHOLDS,
      DEFAULT_SCALING,
    );
    expect(ev.alerts.filter((a) => a.metric.includes("age"))).toEqual([]);
  });
});
