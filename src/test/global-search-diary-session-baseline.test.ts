/**
 * Global search diary spec — session persistence baseline (PR #2451 requirement 8).
 *
 * Filter normalization, history dedupe and last-selected restore list entity
 * types by hand. Until the implementing slice adds `diary`, a saved diary toggle
 * or selection is dropped silently — these tests lock that pre-change hazard.
 */
import { beforeEach, describe, expect, it } from "vitest";

import {
  readGlobalSearchHistory,
  readGlobalSearchLastSelected,
  readGlobalSearchSession,
  pushGlobalSearchHistory,
  writeGlobalSearchLastSelected,
  writeGlobalSearchSession,
} from "@/lib/globalSearchSession";

beforeEach(() => {
  window.sessionStorage.clear();
});

describe("global search diary session baseline — query cap", () => {
  it("truncates persisted session queries at 120 characters (diary RPC will share this cap)", () => {
    const long = "x".repeat(121);
    writeGlobalSearchSession({
      query: long,
      filters: { grow: true, tent: true, plant: true, cultivar: true },
    });
    expect(readGlobalSearchSession().query).toHaveLength(120);
    expect(readGlobalSearchSession().query).toBe("x".repeat(120));
  });
});

describe("global search diary session baseline — filter keys", () => {
  it("ignores a pre-diary `diary` toggle in stored filters until normalizeFilters lists it", () => {
    const storedFilters = { grow: true, tent: true, plant: true, cultivar: true, diary: false };
    writeGlobalSearchSession({ query: "yellow", filters: storedFilters });
    const { filters } = readGlobalSearchSession();
    expect(filters).toEqual({
      grow: true,
      tent: true,
      plant: true,
      cultivar: true,
    });
    expect("diary" in filters).toBe(false);
  });

  it("treats two history entries as identical when only an ignored diary toggle differs", () => {
    const base = {
      grow: true,
      tent: true,
      plant: true,
      cultivar: true,
    };
    pushGlobalSearchHistory({ query: "cal-mag", filters: base });
    const withDiary = { ...base, diary: false };
    pushGlobalSearchHistory({ query: "cal-mag", filters: withDiary });
    expect(readGlobalSearchHistory()).toHaveLength(1);
  });
});

describe("global search diary session baseline — last selected type", () => {
  it("does not restore a persisted diary selection until VALID_TYPES includes diary", () => {
    window.sessionStorage.setItem(
      "verdant.globalSearch.lastSelected.v1",
      JSON.stringify({
        entity_type: "diary",
        id: "spine-abc",
        ts: 1,
      }),
    );
    expect(readGlobalSearchLastSelected()).toBeNull();
  });

  it("still persists the four pre-diary entity types", () => {
    writeGlobalSearchLastSelected({ entity_type: "plant", id: "p1" });
    expect(readGlobalSearchLastSelected()).toMatchObject({
      entity_type: "plant",
      id: "p1",
    });
  });
});
