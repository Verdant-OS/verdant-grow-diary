import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import {
  feedingDefaultsSaveCutoffQueryKey,
  readFeedingDefaultsSaveCutoff,
  recordFeedingDefaultsSaveCutoff,
} from "@/lib/feedingDefaultsSaveCutoff";

describe("feedingDefaultsSaveCutoffQueryKey", () => {
  it("scopes the cutoff to one plant id", () => {
    expect(feedingDefaultsSaveCutoffQueryKey("plant-1")).toEqual([
      "quicklog_v2_feed_defaults_saved_at",
      "plant-1",
    ]);
  });
});

describe("recordFeedingDefaultsSaveCutoff", () => {
  it("stores the save time on the query client", () => {
    const client = new QueryClient();
    recordFeedingDefaultsSaveCutoff(client, "plant-1", 5_000);
    expect(readFeedingDefaultsSaveCutoff(client, "plant-1")).toBe(5_000);
  });

  it("only moves the cutoff forward, never backward", () => {
    const client = new QueryClient();
    recordFeedingDefaultsSaveCutoff(client, "plant-1", 5_000);
    recordFeedingDefaultsSaveCutoff(client, "plant-1", 3_000);
    expect(readFeedingDefaultsSaveCutoff(client, "plant-1")).toBe(5_000);
    recordFeedingDefaultsSaveCutoff(client, "plant-1", 7_000);
    expect(readFeedingDefaultsSaveCutoff(client, "plant-1")).toBe(7_000);
  });

  it("reads zero for a missing or blank plant id", () => {
    const client = new QueryClient();
    recordFeedingDefaultsSaveCutoff(client, "plant-1", 1_000);
    expect(readFeedingDefaultsSaveCutoff(client, null)).toBe(0);
    expect(readFeedingDefaultsSaveCutoff(client, undefined)).toBe(0);
    expect(readFeedingDefaultsSaveCutoff(client, "  ")).toBe(0);
  });
});
