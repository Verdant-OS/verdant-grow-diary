import { describe, expect, it } from "vitest";
import {
  QUICK_LOG_NOTE_REPEAT_WINDOW_MINUTES,
  QuickLogNoteRepeatSaveRules,
  isPlainNoteSavePayload,
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

describe("saved diary rows that are more than a plain note", () => {
  const savedNow = "2026-11-25T11:58:00.000Z";
  function repeatAgainst(row: Record<string, unknown>) {
    return repeat({
      recentEntries: QuickLogNoteRepeatSaveRules.candidatesFromDiaryRows([
        { plant_id: "p1", note: "Leaf tips curling", created_at: savedNow, ...row },
      ]),
    });
  }

  it("blocks a plain saved note, with or without the note marker or a tent snapshot", () => {
    expect(repeatAgainst({ details: {} })).toBe(true);
    expect(repeatAgainst({ details: { quick_log_activity: "note" } })).toBe(true);
    expect(repeatAgainst({ details: { linked_grow_event_id: "e1" } })).toBe(true);
    // The tent snapshot a note attaches on its own is not the grower's content.
    expect(repeatAgainst({ details: { sensor: { temp_c: 24 } } })).toBe(true);
  });

  it("never blocks against a photo, typed readings, an issue, or another activity", () => {
    expect(repeatAgainst({ photo_url: "u1/g1/1.jpg", details: {} })).toBe(false);
    expect(repeatAgainst({ details: { photo_url: "u1/g1/1.jpg" } })).toBe(false);
    expect(repeatAgainst({ details: { manual_sensor_snapshot: { temp_f: 78 } } })).toBe(false);
    expect(repeatAgainst({ details: { manual_provenance: { source: "manual" } } })).toBe(false);
    expect(repeatAgainst({ details: { environment_check: { temp_c: 24 } } })).toBe(false);
    expect(repeatAgainst({ details: { subtype: "issue" } })).toBe(false);
    expect(repeatAgainst({ details: { quick_log_activity: "watering" } })).toBe(false);
    expect(repeatAgainst({ details: { event_type: "environment" } })).toBe(false);
  });

  it("counts the window from when the row was saved, not its backdated entry time", () => {
    expect(repeatAgainst({ entry_at: "2026-11-23T08:00:00.000Z", details: {} })).toBe(true);
    expect(
      repeat({
        recentEntries: QuickLogNoteRepeatSaveRules.candidatesFromDiaryRows([
          {
            plant_id: "p1",
            note: "Leaf tips curling",
            created_at: "2026-11-25T11:40:00.000Z",
            entry_at: "2026-11-25T11:59:00.000Z",
            details: {},
          },
        ]),
      }),
    ).toBe(false);
  });

  it("treats a saved row from a clock up to 10 minutes ahead as recent", () => {
    expect(repeatAgainst({ created_at: "2026-11-25T12:09:00.000Z", details: {} })).toBe(true);
    expect(repeatAgainst({ created_at: "2026-11-25T12:11:00.000Z", details: {} })).toBe(false);
  });
});

describe("isPlainNoteSavePayload", () => {
  const plain = {
    p_action: "note",
    p_note: "Leaf tips curling",
    p_volume_ml: null,
    p_temperature_c: null,
    p_humidity_pct: null,
    p_vpd_kpa: null,
    p_details: { quick_log_activity: "note" },
  };

  it("accepts a note-only payload, with or without details or a tent snapshot", () => {
    expect(isPlainNoteSavePayload(plain)).toBe(true);
    expect(isPlainNoteSavePayload({ ...plain, p_details: null })).toBe(true);
    expect(isPlainNoteSavePayload({ ...plain, p_details: { sensor: { temp_c: 24 } } })).toBe(true);
  });

  it("rejects readings, water, photos, structured details and bad input", () => {
    expect(isPlainNoteSavePayload({ ...plain, p_temperature_c: 24 })).toBe(false);
    expect(isPlainNoteSavePayload({ ...plain, p_humidity_pct: 0 })).toBe(false);
    expect(isPlainNoteSavePayload({ ...plain, p_action: "water", p_volume_ml: 500 })).toBe(false);
    expect(isPlainNoteSavePayload({ ...plain, p_details: { photo_url: "u1/g1/1.jpg" } })).toBe(
      false,
    );
    expect(
      isPlainNoteSavePayload({ ...plain, p_details: { environment_check: { temp_c: 24 } } }),
    ).toBe(false);
    expect(isPlainNoteSavePayload({ ...plain, p_details: [] })).toBe(false);
    expect(isPlainNoteSavePayload(null)).toBe(false);
    expect(isPlainNoteSavePayload("note")).toBe(false);
  });
});
