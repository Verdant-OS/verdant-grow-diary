import { describe, expect, it } from "vitest";
import {
  classifyPr,
  summarizeOpenPrs,
  summarizeQueue,
} from "../../scripts/ci/merge-queue-snapshot.mjs";

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
});
