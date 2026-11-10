import { describe, expect, it } from "vitest";
import { reflectionFromEvidence } from "@/lib/fieldNotebookReflection";

describe("countIncludesEntry array caches", () => {
  it("counts a production grouped-timeline array that contains the event id", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const flags = reflectionFromEvidence({
      timelineCaches: [
        [
          {
            kind: "action",
            occurredAt: "2025-01-08T15:24:00.000Z",
            actionSourceLabel: "Manual",
            action: {
              id,
              kind: "note",
              source: "manual",
              plantId: null,
              tentId: "flower",
              occurredAt: "2025-01-08T15:24:00.000Z",
            },
          },
        ],
      ],
      recentItems: null,
      growEventId: id,
    });
    expect(flags.timelineHasEntry).toBe(true);
    expect(flags.countIncludesEntry).toBe(true);
  });

  it("does not count an array that does not contain the event id", () => {
    const flags = reflectionFromEvidence({
      timelineCaches: [[{ action: { id: "other" } }]],
      recentItems: null,
      growEventId: "11111111-1111-4111-8111-111111111111",
    });
    expect(flags.countIncludesEntry).toBe(false);
  });
});
