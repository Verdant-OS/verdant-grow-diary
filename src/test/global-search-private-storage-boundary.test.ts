import { beforeEach, describe, expect, it } from "vitest";

import {
  clearGlobalSearchPrivateState,
  GLOBAL_SEARCH_HISTORY_STORAGE_KEY,
  GLOBAL_SEARCH_LAST_SELECTED_STORAGE_KEY,
  GLOBAL_SEARCH_PRIVATE_STORAGE_KEYS,
  GLOBAL_SEARCH_SESSION_STORAGE_KEY,
  readGlobalSearchHistory,
  readGlobalSearchLastSelected,
  readGlobalSearchSession,
  subscribeGlobalSearchPrivateStateClear,
} from "@/lib/globalSearchSession";
import {
  clearRecentSearches,
  pushRecentSearch,
  readRecentSearches,
  RECENT_SEARCHES_STORAGE_KEY,
} from "@/lib/recentGlobalSearches";

const PRIVATE_QUERY = "Cheek Tent 4";

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
});

describe("Global Search private storage boundary", () => {
  it("stores private-looking recent queries in the current session, never localStorage", () => {
    expect(pushRecentSearch(PRIVATE_QUERY)).toEqual([PRIVATE_QUERY]);

    expect(
      JSON.parse(window.sessionStorage.getItem(RECENT_SEARCHES_STORAGE_KEY) ?? "null"),
    ).toEqual([PRIVATE_QUERY]);
    expect(window.localStorage.getItem(RECENT_SEARCHES_STORAGE_KEY)).toBeNull();
    expect(readRecentSearches()).toEqual([PRIVATE_QUERY]);
  });

  it("deletes the legacy persistent slot without replaying its private query", () => {
    window.localStorage.setItem(
      RECENT_SEARCHES_STORAGE_KEY,
      JSON.stringify(["legacy private plant"]),
    );

    expect(readRecentSearches()).toEqual([]);
    expect(window.localStorage.getItem(RECENT_SEARCHES_STORAGE_KEY)).toBeNull();
  });

  it("clears every exact search key while preserving unrelated browser preferences", () => {
    for (const key of GLOBAL_SEARCH_PRIVATE_STORAGE_KEYS) {
      window.sessionStorage.setItem(key, `private:${key}`);
    }
    window.localStorage.setItem(RECENT_SEARCHES_STORAGE_KEY, "legacy private query");
    window.sessionStorage.setItem("verdant:startScreen:owner-a", "quickLog");
    window.localStorage.setItem("verdant:unrelated", "preserve-me");

    clearGlobalSearchPrivateState();

    for (const key of GLOBAL_SEARCH_PRIVATE_STORAGE_KEYS) {
      expect(window.sessionStorage.getItem(key)).toBeNull();
    }
    expect(window.localStorage.getItem(RECENT_SEARCHES_STORAGE_KEY)).toBeNull();
    expect(window.sessionStorage.getItem("verdant:startScreen:owner-a")).toBe("quickLog");
    expect(window.localStorage.getItem("verdant:unrelated")).toBe("preserve-me");

    // These are the same readers used when the public /cultivars palette opens.
    expect(readGlobalSearchSession().query).toBe("");
    expect(readGlobalSearchHistory()).toEqual([]);
    expect(readGlobalSearchLastSelected()).toBeNull();
    expect(readRecentSearches()).toEqual([]);
  });

  it("fails closed on malformed persisted values", () => {
    window.sessionStorage.setItem(GLOBAL_SEARCH_SESSION_STORAGE_KEY, "{");
    window.sessionStorage.setItem(GLOBAL_SEARCH_HISTORY_STORAGE_KEY, "{");
    window.sessionStorage.setItem(GLOBAL_SEARCH_LAST_SELECTED_STORAGE_KEY, "{");
    window.sessionStorage.setItem(RECENT_SEARCHES_STORAGE_KEY, "{");

    expect(readGlobalSearchSession()).toEqual({
      query: "",
      filters: { grow: true, tent: true, plant: true, cultivar: true },
    });
    expect(readGlobalSearchHistory()).toEqual([]);
    expect(readGlobalSearchLastSelected()).toBeNull();
    expect(readRecentSearches()).toEqual([]);
  });

  it("never throws when browser storage rejects access", () => {
    const unavailable = {
      get length(): number {
        throw new Error("unavailable");
      },
      clear: () => {
        throw new Error("unavailable");
      },
      key: () => {
        throw new Error("unavailable");
      },
      getItem: () => {
        throw new Error("unavailable");
      },
      setItem: () => {
        throw new Error("unavailable");
      },
      removeItem: () => {
        throw new Error("unavailable");
      },
    } as Storage;

    const unsubscribe = subscribeGlobalSearchPrivateStateClear(() => {
      throw new Error("broken mounted palette");
    });
    expect(() =>
      clearGlobalSearchPrivateState({
        sessionStorage: unavailable,
        localStorage: unavailable,
      }),
    ).not.toThrow();
    unsubscribe();
    expect(() =>
      clearRecentSearches({ sessionStorage: unavailable, localStorage: unavailable }),
    ).not.toThrow();
  });
});
