import { describe, expect, it, vi } from "vitest";

import { feedingDefaultsPrefillSettled } from "@/lib/feedingDefaultsViewModel";
import {
  recentFeedingsDefaultsQueryKey,
  refetchRecentFeedingsForDefaults,
} from "@/hooks/useRecentFeedingsForDefaults";

describe("feedingDefaultsPrefillSettled", () => {
  it("holds the prefill while the defaults query is still fetching", () => {
    expect(
      feedingDefaultsPrefillSettled({
        isFetching: true,
        isPending: false,
        isError: false,
        dataUpdatedAt: 2_000,
        refetchRequiredAfter: 1_000,
      }),
    ).toBe(false);
  });

  it("holds the prefill until a post-save refetch lands newer data", () => {
    expect(
      feedingDefaultsPrefillSettled({
        isFetching: false,
        isPending: false,
        isError: false,
        dataUpdatedAt: 1_000,
        refetchRequiredAfter: 1_500,
      }),
    ).toBe(false);
  });

  it("applies once the refetch has finished with data at least as new as the save", () => {
    expect(
      feedingDefaultsPrefillSettled({
        isFetching: false,
        isPending: false,
        isError: false,
        dataUpdatedAt: 1_500,
        refetchRequiredAfter: 1_500,
      }),
    ).toBe(true);
  });

  it("does not apply a cached recipe after a failed refetch", () => {
    expect(
      feedingDefaultsPrefillSettled({
        isFetching: false,
        isPending: false,
        isError: true,
        dataUpdatedAt: 2_000,
        refetchRequiredAfter: 1_500,
      }),
    ).toBe(false);
  });

  it("allows the first open when no post-save refetch is required", () => {
    expect(
      feedingDefaultsPrefillSettled({
        isFetching: false,
        isPending: false,
        isError: false,
        dataUpdatedAt: 0,
        refetchRequiredAfter: 0,
      }),
    ).toBe(true);
  });
});

describe("refetchRecentFeedingsForDefaults", () => {
  it("invalidates and refetches the plant feed-defaults key after a feeding save", async () => {
    const invalidateQueries = vi.fn(async () => undefined);
    const refetchQueries = vi.fn(async () => undefined);
    const plantId = "plant-1";

    await expect(
      refetchRecentFeedingsForDefaults({ invalidateQueries, refetchQueries }, plantId),
    ).resolves.toBe(true);

    const queryKey = recentFeedingsDefaultsQueryKey(plantId);
    expect(queryKey).toEqual(["quicklog_v2_feed_defaults", plantId]);
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey });
    expect(refetchQueries).toHaveBeenCalledWith({ queryKey, type: "active" });
    expect(invalidateQueries.mock.invocationCallOrder[0]).toBeLessThan(
      refetchQueries.mock.invocationCallOrder[0],
    );
  });

  it("does not touch the cache when the save has no plant id", async () => {
    const invalidateQueries = vi.fn();
    const refetchQueries = vi.fn();
    await expect(
      refetchRecentFeedingsForDefaults({ invalidateQueries, refetchQueries }, null),
    ).resolves.toBe(false);
    expect(invalidateQueries).not.toHaveBeenCalled();
    expect(refetchQueries).not.toHaveBeenCalled();
  });
});
