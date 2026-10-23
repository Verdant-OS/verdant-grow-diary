/**
 * Global search diary spec — session / history baseline (requirement 5 & 8).
 *
 * Before diary ships, last-selected and history ignore `diary`, queries cap at
 * 120 characters, and history dedupe compares only the four entity toggles.
 * The implementing slice must extend sameFilters and VALID_TYPES without
 * breaking these contracts.
 */
import { beforeEach, describe, expect, it } from "vitest";

import {
  GLOBAL_SEARCH_LAST_SELECTED_STORAGE_KEY,
  GLOBAL_SEARCH_SESSION_STORAGE_KEY,
  pushGlobalSearchHistory,
  readGlobalSearchLastSelected,
  readGlobalSearchSession,
  writeGlobalSearchSession,
} from "@/lib/globalSearchSession";

beforeEach(() => {
  window.sessionStorage.clear();
});

describe("global search diary session baseline", () => {
  it("drops a persisted last-selected row whose entity_type is diary", () => {
    window.sessionStorage.setItem(
      GLOBAL_SEARCH_LAST_SELECTED_STORAGE_KEY,
      JSON.stringify({
        entity_type: "diary",
        id: "spine-abc",
        ts: 1,
      }),
    );
    expect(readGlobalSearchLastSelected()).toBeNull();
  });

  it("truncates stored queries to 120 characters on read and write", () => {
    const long = "x".repeat(121);
    writeGlobalSearchSession({
      query: long,
      filters: { grow: true, tent: true, plant: true, cultivar: true },
    });
    expect(readGlobalSearchSession().query).toHaveLength(120);
    expect(readGlobalSearchSession().query).toBe("x".repeat(120));

    window.sessionStorage.setItem(
      GLOBAL_SEARCH_SESSION_STORAGE_KEY,
      JSON.stringify({
        query: long,
        filters: { grow: true, tent: true, plant: true, cultivar: true },
      }),
    );
    expect(readGlobalSearchSession().query).toHaveLength(120);
  });

  it("keeps two history entries when only the grow toggle differs (diary not in sameFilters yet)", () => {
    const base = {
      grow: true,
      tent: true,
      plant: true,
      cultivar: true,
    };
    const growOff = { ...base, grow: false };
    pushGlobalSearchHistory({ query: "yellow", filters: base });
    const after = pushGlobalSearchHistory({ query: "yellow", filters: growOff });
    expect(after).toHaveLength(2);
    expect(after.map((e) => e.filters.grow)).toEqual([false, true]);
  });
});
