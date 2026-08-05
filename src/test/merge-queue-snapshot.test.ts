import { describe, expect, it } from "vitest";
import {
  classifyPr,
  summarizeOpenPrs,
  summarizeQueue,
  evaluateAlerts,
  DEFAULT_THRESHOLDS,
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
    expect(s.nextEntryEstimatedTimeToMerge).toBe(120);
    expect(s.maxAgeSec).toBe(600);
    expect(s.medianAgeSec).toBe(450);
    expect(s.entries[0].prNumber).toBe(722);
    expect(s.entries[0].ageSec).toBe(600);
  });

  it("loads thresholds from JSON file", () => {
    const loaded = loadThresholds(join(process.cwd(), "scripts/ci/merge-queue-thresholds.json"));
    expect(loaded.source).toBe("file");
    expect(loaded.thresholds.queue_depth.warn).toBe(3);
    expect(loaded.thresholds.queue_depth.critical).toBe(5);
    expect(loaded.thresholds.max_age_sec.critical).toBe(5400);
    expect(loaded.thresholds.dirty_open_prs.warn).toBe(5);
  });

  it("evaluateAlerts is quiet under thresholds", () => {
    const ev = evaluateAlerts(
      {
        queue: { depth: 0, maxAgeSec: null, medianAgeSec: null },
        openPrs: {
          counts: { DIRTY: 2, BEHIND: 1, BLOCKED: 1 },
          autoMergeCount: 0,
        },
      },
      DEFAULT_THRESHOLDS,
    );
    expect(ev.ok).toBe(true);
    expect(ev.warnOnly).toBe(false);
    expect(ev.alerts).toEqual([]);
  });

  it("evaluateAlerts emits warn then critical for queue depth", () => {
    const warn = evaluateAlerts(
      {
        queue: { depth: 3, maxAgeSec: null, medianAgeSec: null },
        openPrs: { counts: { DIRTY: 0, BEHIND: 0, BLOCKED: 0 }, autoMergeCount: 0 },
      },
      DEFAULT_THRESHOLDS,
    );
    expect(warn.warnOnly).toBe(true);
    expect(warn.alerts[0].severity).toBe("warn");
    expect(warn.alerts[0].metric).toBe("queue_depth");

    const crit = evaluateAlerts(
      {
        queue: { depth: 5, maxAgeSec: 6000, medianAgeSec: 3000 },
        openPrs: { counts: { DIRTY: 12, BEHIND: 0, BLOCKED: 0 }, autoMergeCount: 0 },
      },
      DEFAULT_THRESHOLDS,
    );
    expect(crit.ok).toBe(false);
    expect(crit.criticalCount).toBeGreaterThanOrEqual(2);
    const metrics = crit.alerts.map((a) => a.metric);
    expect(metrics).toContain("queue_depth");
    expect(metrics).toContain("max_age_sec");
    expect(metrics).toContain("dirty_open_prs");
  });

  it("null ages do not alert", () => {
    const ev = evaluateAlerts(
      {
        queue: { depth: 0, maxAgeSec: null, medianAgeSec: null },
        openPrs: { counts: {}, autoMergeCount: 0 },
      },
      DEFAULT_THRESHOLDS,
    );
    expect(ev.alerts.filter((a) => a.metric.includes("age"))).toEqual([]);
  });
});
