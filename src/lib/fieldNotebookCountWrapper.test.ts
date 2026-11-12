import { describe, expect, it } from "vitest";
import { reflectionFromEvidence } from "@/lib/fieldNotebookReflection";

const id = "event-1";

describe("countShowsEntry wrappers", () => {
  it("does not count a timeline_memory object that has items and no count", () => {
    const reflection = reflectionFromEvidence({
      timelineCaches: [{ items: [{ id }], displayItems: [{ id }] }],
      recentItems: null,
      growEventId: id,
    });
    expect(reflection.countIncludesEntry).toBe(false);
  });

  it("does not count an array whose only row has a zero count", () => {
    const reflection = reflectionFromEvidence({
      timelineCaches: [[{ count: 0, items: [{ id }] }]],
      recentItems: null,
      growEventId: id,
    });
    expect(reflection.countIncludesEntry).toBe(false);
  });
});
