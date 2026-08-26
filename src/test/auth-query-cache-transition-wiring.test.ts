import { QueryClient } from "@tanstack/react-query";
import { act } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { __growDataFallbacks } from "@/hooks/useGrowData";
import { clearPrivateClientStateBeforeAuthIdentityChange } from "@/lib/authIdentityTransitionFence";
import {
  GLOBAL_SEARCH_SESSION_STORAGE_KEY,
  subscribeGlobalSearchPrivateStateClear,
} from "@/lib/globalSearchSession";
import { RECENT_SEARCHES_STORAGE_KEY } from "@/lib/recentGlobalSearches";
import {
  clearLocalStorageForTest,
  getLocalStorageItemForTest,
  setLocalStorageItemForTest,
} from "@/test/helpers/localStorageTestHelper";

beforeEach(() => {
  window.sessionStorage.clear();
  clearLocalStorageForTest();
  __growDataFallbacks.count = 0;
  __growDataFallbacks.lastReason = "";
});

describe("auth identity query-cache transition fence", () => {
  it("executes the resolved root fence before clearing QueryClient", () => {
    const client = new QueryClient();
    client.setQueryData(["owner-private", "owner-a"], [{ id: "private-row" }]);
    window.sessionStorage.setItem(GLOBAL_SEARCH_SESSION_STORAGE_KEY, "Owner A Private Tent");
    setLocalStorageItemForTest(RECENT_SEARCHES_STORAGE_KEY, '["Owner A Private Tent"]');
    __growDataFallbacks.count = 2;
    __growDataFallbacks.lastReason = "owner-a-private-reason";

    const observations: Array<{ cacheRows: number; searchState: string | null }> = [];
    const unsubscribe = subscribeGlobalSearchPrivateStateClear(() => {
      observations.push({
        cacheRows: client.getQueryCache().getAll().length,
        searchState: window.sessionStorage.getItem(GLOBAL_SEARCH_SESSION_STORAGE_KEY),
      });
    });

    act(() => clearPrivateClientStateBeforeAuthIdentityChange(client));
    unsubscribe();

    // The mounted-search notification runs after exact storage removal but
    // before QueryClient.clear(), proving the ordering rather than matching
    // implementation text that could be commented out or unreachable.
    expect(observations).toEqual([{ cacheRows: 1, searchState: null }]);
    expect(client.getQueryCache().getAll()).toHaveLength(0);
    expect(getLocalStorageItemForTest(RECENT_SEARCHES_STORAGE_KEY)).toBeNull();
    expect(__growDataFallbacks).toEqual({ count: 0, lastReason: "" });
  });
});
