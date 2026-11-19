import { describe, expect, it } from "vitest";
import { reflectionFromEvidence } from "@/lib/fieldNotebookReflection";

describe("countIncludesEntry", () => {
  it("uses the numeric count instead of treating any id hit as counted", () => {
    const id = "event-1";
    const hidden = reflectionFromEvidence({
      timelineCaches: [{ count: 0, items: [{ id }] }],
      recentItems: null,
      growEventId: id,
    });
    expect(hidden.timelineHasEntry).toBe(true);
    expect(hidden.countIncludesEntry).toBe(false);

    const shown = reflectionFromEvidence({
      timelineCaches: [{ count: 1, items: [{ id }] }],
      recentItems: null,
      growEventId: id,
    });
    expect(shown.countIncludesEntry).toBe(true);
  });
});
