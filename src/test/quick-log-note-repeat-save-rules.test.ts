import { describe, expect, it } from "vitest";
import {
  QUICK_LOG_NOTE_REPEAT_WINDOW_MINUTES,
  QuickLogNoteRepeatSaveRules,
  type RecentSavedNoteEntry,
} from "@/lib/quickLogNoteSaveRules";

const now = new Date("2026-11-25T12:00:00.000Z");

function entry(overrides: Partial<RecentSavedNoteEntry> = {}): RecentSavedNoteEntry {
  return {
    plantId: "p1",
    note: "Leaf tips curling",
    eventType: "note",
    savedAt: "2026-11-25T11:55:00.000Z",
    ...overrides,
  };
}

function repeat(
  overrides: Partial<
    Parameters<typeof QuickLogNoteRepeatSaveRules.isRepeatOfRecentSavedNote>[0]
  > = {},
) {
  return QuickLogNoteRepeatSaveRules.isRepeatOfRecentSavedNote({
    note: "Leaf tips curling",
    plantId: "p1",
    eventType: "note",
    recentEntries: [entry()],
    now,
    ...overrides,
  });
}

describe("QuickLogNoteRepeatSaveRules.isRepeatOfRecentSavedNote", () => {
  it("blocks the same text on the same plant inside the window", () => {
    expect(QUICK_LOG_NOTE_REPEAT_WINDOW_MINUTES).toBe(10);
    expect(repeat()).toBe(true);
    expect(repeat({ note: "  Leaf   tips curling " })).toBe(true);
    expect(
      repeat({ eventType: "observation", recentEntries: [entry({ eventType: "observation" })] }),
    ).toBe(true);
  });

  it("allows the same text once the window has passed", () => {
    expect(repeat({ recentEntries: [entry({ savedAt: "2026-11-25T11:49:00.000Z" })] })).toBe(false);
    expect(
      repeat({ windowMinutes: 10, recentEntries: [entry({ savedAt: now.toISOString() })] }),
    ).toBe(true);
  });

  it("allows another plant, another text, and a case change", () => {
    expect(repeat({ plantId: "p2" })).toBe(false);
    expect(repeat({ note: "Watered lightly" })).toBe(false);
    expect(repeat({ note: "leaf tips curling" })).toBe(false);
  });

  it("does not treat structured entries as a repeated note", () => {
    for (const eventType of ["watering", "feeding", "environment", "photo"]) {
      expect(repeat({ eventType })).toBe(false);
      expect(repeat({ recentEntries: [entry({ eventType })] })).toBe(false);
    }
  });

  it("ignores whitespace-only, null, and absent inputs", () => {
    expect(repeat({ note: "   " })).toBe(false);
    expect(repeat({ note: null })).toBe(false);
    expect(repeat({ plantId: null })).toBe(false);
    expect(repeat({ plantId: "" })).toBe(false);
    expect(repeat({ recentEntries: null })).toBe(false);
    expect(repeat({ recentEntries: undefined })).toBe(false);
    expect(repeat({ recentEntries: [entry({ savedAt: null })] })).toBe(false);
    expect(repeat({ now: new Date("nope") })).toBe(false);
  });

  it("never blocks a retry of the same uncertain save", () => {
    expect(repeat({ sameSaveRetry: true })).toBe(false);
  });
});

describe("QuickLogNoteRepeatSaveRules.candidatesFromDiaryRows", () => {
  it("reads plant, note, event type and time, and skips retracted rows", () => {
    const rows = QuickLogNoteRepeatSaveRules.candidatesFromDiaryRows([
      {
        plant_id: "p1",
        note: "Leaf tips curling",
        entry_at: "2026-11-25T11:55:00.000Z",
        details: { event_type: "observation" },
      },
      { plant_id: "p9", note: "gone", entry_at: "2026-11-25T11:55:00.000Z", retracted_at: "x" },
      null,
    ]);
    expect(rows).toEqual([
      {
        plantId: "p1",
        note: "Leaf tips curling",
        eventType: "observation",
        savedAt: "2026-11-25T11:55:00.000Z",
      },
    ]);
    expect(QuickLogNoteRepeatSaveRules.candidatesFromDiaryRows(null)).toEqual([]);
    expect(
      QuickLogNoteRepeatSaveRules.candidatesFromDiaryRows([{ note: "plain", plant_id: "p1" }])[0]
        .eventType,
    ).toBe("note");
  });
});
