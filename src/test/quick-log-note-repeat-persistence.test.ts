import { describe, expect, it } from "vitest";

import {
  QUICK_LOG_NOTE_REPEAT_WINDOW_MINUTES,
  QuickLogNoteRepeatPersistence,
  QuickLogNoteRepeatSaveRules,
} from "@/lib/quickLogNoteSaveRules";

class MemoryStorage {
  private readonly items = new Map<string, string>();
  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
}

const NOW = new Date("2026-11-25T12:00:00.000Z");

function remember(
  storage: MemoryStorage,
  accountId: string,
  plantId: string,
  note: string,
  savedAt: string,
) {
  QuickLogNoteRepeatPersistence.remember(storage, {
    accountId,
    plantId,
    note,
    savedAt,
    now: new Date(savedAt),
  });
}

describe("QuickLogNoteRepeatPersistence", () => {
  it("blocks the same note on the same plant inside 10 minutes and allows it after", () => {
    const storage = new MemoryStorage();
    remember(storage, "account-a", "plant-1", "  Same   note ", NOW.toISOString());
    const recent = QuickLogNoteRepeatPersistence.read(storage, "account-a", NOW);
    expect(
      QuickLogNoteRepeatSaveRules.isRepeatOfRecentSavedNote({
        note: "Same note",
        plantId: "plant-1",
        eventType: "note",
        recentEntries: recent,
        now: NOW,
      }),
    ).toBe(true);
    const later = new Date(NOW.getTime() + (QUICK_LOG_NOTE_REPEAT_WINDOW_MINUTES * 60 + 1) * 1000);
    expect(QuickLogNoteRepeatPersistence.read(storage, "account-a", later)).toEqual([]);
    expect(
      QuickLogNoteRepeatSaveRules.isRepeatOfRecentSavedNote({
        note: "Same note",
        plantId: "plant-1",
        eventType: "note",
        recentEntries: QuickLogNoteRepeatPersistence.read(storage, "account-a", later),
        now: later,
      }),
    ).toBe(false);
  });

  it("does not block a different account or a note that was never recorded", () => {
    const storage = new MemoryStorage();
    remember(storage, "account-a", "plant-1", "Same note", NOW.toISOString());
    expect(QuickLogNoteRepeatPersistence.read(storage, "account-b", NOW)).toEqual([]);
    expect(
      QuickLogNoteRepeatSaveRules.isRepeatOfRecentSavedNote({
        note: "Same note",
        plantId: "plant-1",
        eventType: "note",
        recentEntries: QuickLogNoteRepeatPersistence.read(storage, "account-b", NOW),
        now: NOW,
      }),
    ).toBe(false);
  });

  it("prunes an expired row when a newer save is recorded", () => {
    const storage = new MemoryStorage();
    const expired = new Date(NOW.getTime() - 11 * 60_000).toISOString();
    remember(storage, "account-a", "plant-1", "Old note", expired);
    remember(storage, "account-a", "plant-1", "Fresh note", NOW.toISOString());
    const notes = QuickLogNoteRepeatPersistence.read(storage, "account-a", NOW).map(
      (entry) => entry.note,
    );
    expect(notes).toEqual(["Fresh note"]);
  });
});
