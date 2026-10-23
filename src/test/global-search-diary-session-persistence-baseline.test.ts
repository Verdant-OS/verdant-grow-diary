/**
 * Global search diary spec — session/history persistence baseline (requirement 8).
 *
 * Pre-implementation locks: last-selected rejects unknown entity types; history
 * dedupe compares only the four entity toggles today. The implementing slice
 * must extend sameFilters and VALID_TYPES for `diary`.
 */
import { beforeEach, describe, expect, it } from "vitest";

import {
  GLOBAL_SEARCH_HISTORY_STORAGE_KEY,
  GLOBAL_SEARCH_LAST_SELECTED_STORAGE_KEY,
  pushGlobalSearchHistory,
  readGlobalSearchHistory,
  readGlobalSearchLastSelected,
  writeGlobalSearchLastSelected,
} from "@/lib/globalSearchSession";
import {
  clearLocalStorageForTest,
  setLocalStorageItemForTest,
} from "@/test/helpers/localStorageTestHelper";

beforeEach(() => {
  window.sessionStorage.clear();
  clearLocalStorageForTest();
});

describe("global search diary session persistence baseline", () => {
  it("drops persisted last-selected rows whose entity_type is not in VALID_TYPES yet", () => {
    setLocalStorageItemForTest(
      GLOBAL_SEARCH_LAST_SELECTED_STORAGE_KEY,
      JSON.stringify({ entity_type: "diary", id: "entry-1", ts: 1 }),
    );
    expect(readGlobalSearchLastSelected()).toBeNull();
  });

  it("keeps distinct history entries that differ only in an extra filter field not in sameFilters", () => {
    const baseFilters = { grow: true, tent: true, plant: true, cultivar: true };
    pushGlobalSearchHistory({ query: "cal-mag", filters: baseFilters });
    pushGlobalSearchHistory({
      query: "cal-mag",
      filters: { ...baseFilters, diary: false } as typeof baseFilters & { diary: boolean },
    });

    const history = readGlobalSearchHistory();
    expect(history).toHaveLength(1);
    expect(window.sessionStorage.getItem(GLOBAL_SEARCH_HISTORY_STORAGE_KEY)).toContain("cal-mag");
  });

  it("persists grow, tent, plant, and cultivar last-selected rows only", () => {
    writeGlobalSearchLastSelected({ entity_type: "plant", id: "p1" });
    expect(readGlobalSearchLastSelected()).toMatchObject({ entity_type: "plant", id: "p1" });
  });
});
