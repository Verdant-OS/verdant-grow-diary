/**
 * Diary Calendar — persisted filter (localStorage) helper tests.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  DIARY_CALENDAR_FILTER_STORAGE_KEY,
  isDiaryCalendarFilter,
  readPersistedDiaryCalendarFilter,
  writePersistedDiaryCalendarFilter,
  clearPersistedDiaryCalendarFilter,
} from "@/lib/diaryCalendarFilterPersistence";

beforeEach(() => {
  window.localStorage.clear();
});

describe("diaryCalendarFilterPersistence", () => {
  it("validates known filters", () => {
    for (const v of ["all", "watering", "feeding", "diagnosis", "environment"]) {
      expect(isDiaryCalendarFilter(v)).toBe(true);
    }
  });

  it("rejects unknown / malformed values", () => {
    for (const v of ["", "ENV", "sensor", null, undefined, 1, {}, []]) {
      expect(isDiaryCalendarFilter(v as unknown)).toBe(false);
    }
  });

  it("read returns null when nothing is stored", () => {
    expect(readPersistedDiaryCalendarFilter()).toBeNull();
  });

  it("write + read round-trips a valid filter", () => {
    writePersistedDiaryCalendarFilter("environment");
    expect(readPersistedDiaryCalendarFilter()).toBe("environment");
  });

  it("read rejects a corrupted persisted value and returns null", () => {
    window.localStorage.setItem(DIARY_CALENDAR_FILTER_STORAGE_KEY, "garbage");
    expect(readPersistedDiaryCalendarFilter()).toBeNull();
  });

  it("clear removes the stored value", () => {
    writePersistedDiaryCalendarFilter("watering");
    clearPersistedDiaryCalendarFilter();
    expect(readPersistedDiaryCalendarFilter()).toBeNull();
  });

  it("write ignores invalid values", () => {
    writePersistedDiaryCalendarFilter("nope" as never);
    expect(window.localStorage.getItem(DIARY_CALENDAR_FILTER_STORAGE_KEY)).toBeNull();
  });
});
