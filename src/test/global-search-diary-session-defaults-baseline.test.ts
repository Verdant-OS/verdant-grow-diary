/**
 * Global search diary spec — session default filter baseline (requirement 8).
 *
 * Pre-diary session state knows four entity toggles. The all-off guard must
 * grow to include `diary` when the implementing slice adds it.
 */
import { beforeEach, describe, expect, it } from "vitest";

import {
  DEFAULT_FILTERS,
  readGlobalSearchSession,
  writeGlobalSearchSession,
  type GlobalSearchEntityType,
} from "@/lib/globalSearchSession";

beforeEach(() => {
  window.sessionStorage.clear();
});

describe("global search diary session defaults baseline", () => {
  it("lists exactly the four pre-diary entity toggles (diary not in session union yet)", () => {
    const keys = Object.keys(DEFAULT_FILTERS).sort();
    expect(keys).toEqual(["cultivar", "grow", "plant", "tent"]);
    const diaryKey: GlobalSearchEntityType | "diary" = "diary";
    expect(Object.prototype.hasOwnProperty.call(DEFAULT_FILTERS, diaryKey)).toBe(false);
  });

  it("re-enables all pre-diary toggles when stored filters are all off", () => {
    writeGlobalSearchSession({
      query: "topped",
      filters: { grow: false, tent: false, plant: false, cultivar: false },
    });
    expect(readGlobalSearchSession().filters).toEqual(DEFAULT_FILTERS);
  });
});
