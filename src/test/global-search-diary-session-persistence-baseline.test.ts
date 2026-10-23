/**
 * Global search diary spec — session persistence baseline (requirement 8).
 *
 * Spec: docs/specs/global-search-diary-entries.md
 * Before diary is a first-class entity type, last-selected restoration and
 * history dedupe only know grow / tent / plant / cultivar. The implementing
 * slice must extend sameFilters, VALID_TYPES, normalizeFilters, and DEFAULT_FILTERS
 * together or diary toggles and previews silently break.
 */
import { beforeEach, describe, expect, it } from "vitest";

import {
  DEFAULT_FILTERS,
  GLOBAL_SEARCH_LAST_SELECTED_STORAGE_KEY,
  pushGlobalSearchHistory,
  readGlobalSearchHistory,
  readGlobalSearchLastSelected,
  readGlobalSearchSession,
  writeGlobalSearchSession,
} from "@/lib/globalSearchSession";

beforeEach(() => {
  window.sessionStorage.clear();
});

describe("global search diary session persistence baseline", () => {
  it("DEFAULT_FILTERS lists exactly the four pre-diary entity toggles", () => {
    expect(Object.keys(DEFAULT_FILTERS).sort()).toEqual(["cultivar", "grow", "plant", "tent"]);
  });

  it("drops a persisted diary last-selection until VALID_TYPES includes diary", () => {
    window.sessionStorage.setItem(
      GLOBAL_SEARCH_LAST_SELECTED_STORAGE_KEY,
      JSON.stringify({ entity_type: "diary", id: "spine-1", ts: 1 }),
    );
    expect(readGlobalSearchLastSelected()).toBeNull();
  });

  it("ignores unknown filter keys when normalizing session state", () => {
    writeGlobalSearchSession({
      query: "yellow",
      filters: {
        grow: true,
        tent: true,
        plant: false,
        cultivar: true,
        // Future diary toggle — must be wired explicitly; silently ignored today.
        diary: false,
      } as typeof DEFAULT_FILTERS & { diary: boolean },
    });
    expect(readGlobalSearchSession().filters).toEqual({
      grow: true,
      tent: true,
      plant: false,
      cultivar: true,
    });
  });

  it("dedupes history by the four filter fields only (diary toggle not distinguished yet)", () => {
    const filters = { grow: true, tent: true, plant: true, cultivar: true };
    pushGlobalSearchHistory({ query: "topped", filters, ts: 1 });
    const afterSecond = pushGlobalSearchHistory({ query: "topped", filters, ts: 2 });
    expect(afterSecond).toHaveLength(1);
    expect(afterSecond[0]?.ts).toBe(2);
  });

  it("truncates persisted queries at 120 characters (diary RPC cap alignment)", () => {
    const long = "x".repeat(130);
    writeGlobalSearchSession({ query: long, filters: { ...DEFAULT_FILTERS } });
    expect(readGlobalSearchSession().query).toHaveLength(120);
    expect(readGlobalSearchSession().query).toBe("x".repeat(120));
  });
});
