/**
 * Diary Calendar — versioned persistence hardening tests.
 *
 * Covers:
 *  - Current envelope round-trip (versioned JSON).
 *  - Legacy raw-string migration on next write.
 *  - Corrupt JSON / unknown version / invalid filter -> cleared, null.
 *  - Storage unavailable / throwing -> swallowed, null.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { clearLocalStorageForTest, getLocalStorageItemForTest, setLocalStorageItemForTest } from "./helpers/localStorageTestHelper";
import {
  DIARY_CALENDAR_FILTER_STORAGE_KEY,
  DIARY_CALENDAR_FILTER_PERSIST_VERSION,
  readPersistedDiaryCalendarFilter,
  writePersistedDiaryCalendarFilter,
} from "@/lib/diaryCalendarFilterPersistence";

beforeEach(() => {
  clearLocalStorageForTest();
  vi.restoreAllMocks();
});

describe("diaryCalendarFilterPersistence — versioned envelope", () => {
  it("writes a versioned JSON envelope", () => {
    writePersistedDiaryCalendarFilter("environment");
    const raw = getLocalStorageItemForTest(DIARY_CALENDAR_FILTER_STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw as string);
    expect(parsed).toEqual({
      version: DIARY_CALENDAR_FILTER_PERSIST_VERSION,
      value: "environment",
    });
  });

  it("reads the current envelope format", () => {
    setLocalStorageItemForTest(
      DIARY_CALENDAR_FILTER_STORAGE_KEY,
      JSON.stringify({ version: 1, value: "feeding" }),
    );
    expect(readPersistedDiaryCalendarFilter()).toBe("feeding");
  });

  it("reads legacy raw-string values and migrates them on next write", () => {
    setLocalStorageItemForTest(
      DIARY_CALENDAR_FILTER_STORAGE_KEY,
      "environment",
    );
    expect(readPersistedDiaryCalendarFilter()).toBe("environment");
    writePersistedDiaryCalendarFilter("environment");
    const raw = getLocalStorageItemForTest(DIARY_CALENDAR_FILTER_STORAGE_KEY);
    expect(JSON.parse(raw as string)).toEqual({
      version: 1,
      value: "environment",
    });
  });

  it("rejects invalid raw-string values and clears storage", () => {
    setLocalStorageItemForTest(
      DIARY_CALENDAR_FILTER_STORAGE_KEY,
      "bogus-filter",
    );
    expect(readPersistedDiaryCalendarFilter()).toBeNull();
    expect(
      getLocalStorageItemForTest(DIARY_CALENDAR_FILTER_STORAGE_KEY),
    ).toBeNull();
  });

  it("rejects corrupt JSON and clears storage", () => {
    setLocalStorageItemForTest(
      DIARY_CALENDAR_FILTER_STORAGE_KEY,
      "{not-json",
    );
    expect(readPersistedDiaryCalendarFilter()).toBeNull();
    expect(
      getLocalStorageItemForTest(DIARY_CALENDAR_FILTER_STORAGE_KEY),
    ).toBeNull();
  });

  it("rejects unknown version envelopes and clears storage", () => {
    setLocalStorageItemForTest(
      DIARY_CALENDAR_FILTER_STORAGE_KEY,
      JSON.stringify({ version: 99, value: "environment" }),
    );
    expect(readPersistedDiaryCalendarFilter()).toBeNull();
    expect(
      getLocalStorageItemForTest(DIARY_CALENDAR_FILTER_STORAGE_KEY),
    ).toBeNull();
  });

  it("rejects envelope with invalid filter value and clears storage", () => {
    setLocalStorageItemForTest(
      DIARY_CALENDAR_FILTER_STORAGE_KEY,
      JSON.stringify({ version: 1, value: "nope" }),
    );
    expect(readPersistedDiaryCalendarFilter()).toBeNull();
    expect(
      getLocalStorageItemForTest(DIARY_CALENDAR_FILTER_STORAGE_KEY),
    ).toBeNull();
  });

  it("swallows localStorage errors on read", () => {
    const spy = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("denied");
      });
    expect(() => readPersistedDiaryCalendarFilter()).not.toThrow();
    expect(readPersistedDiaryCalendarFilter()).toBeNull();
    spy.mockRestore();
  });

  it("swallows localStorage errors on write", () => {
    const spy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("quota");
      });
    expect(() => writePersistedDiaryCalendarFilter("watering")).not.toThrow();
    spy.mockRestore();
  });
});
