import { describe, expect, it } from "vitest";
import { reflectionFromEvidence } from "@/lib/fieldNotebookReflection";

const id = "event-1";

describe("countShowsEntry", () => {
  it("does not count an array just because a nested row has the id and a zero count", () => {
    const reflection = reflectionFromEvidence({
      timelineCaches: [[{ count: 0, items: [{ id }] }]],
      recentItems: null,
      growEventId: id,
    });
    expect(reflection.countIncludesEntry).toBe(false);
  });

  it("counts a grouped row whose own count is above zero", () => {
    const reflection = reflectionFromEvidence({
      timelineCaches: [{ count: 1, items: [{ id }] }],
      recentItems: null,
      growEventId: id,
    });
    expect(reflection.countIncludesEntry).toBe(true);
  });
});
