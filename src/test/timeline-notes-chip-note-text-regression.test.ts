/**
 * Supplemental regression coverage for PR #2478 / Pollen #1: grower Notes vs
 * generated diary text. Keeps wiring contracts pinned without editing scorer-locked
 * specs in timeline-notes-chip-note-text.test.tsx.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { QUICK_LOG_MANUAL_READINGS_NOTE } from "@/constants/quickLogGeneratedNoteCopy";
import { ACTION_OUTCOME_DEFAULT_NOTES } from "@/lib/actionOutcomeRules";
import { QUICK_LOG_PHOTO_DIARY_DEFAULT_NOTE } from "@/lib/quickLogPhotoDiaryEntry";
import { QUICK_LOG_VIDEO_DIARY_DEFAULT_NOTE } from "@/lib/quickLogVideoDiaryEntry";
import { GENERATED_NOTE_TEXTS, timelineEntryHasNoteText } from "@/lib/timelineChipCountRules";

const ROOT = resolve(__dirname, "../..");
const TIMELINE_PAGE = readFileSync(resolve(ROOT, "src/pages/Timeline.tsx"), "utf8");
const PLANT_QUICK_LOG = readFileSync(resolve(ROOT, "src/components/PlantQuickLog.tsx"), "utf8");

describe("Timeline Notes chip — generated text contract", () => {
  it("treats every exported action-outcome default as generated, not grower Notes", () => {
    for (const note of Object.values(ACTION_OUTCOME_DEFAULT_NOTES)) {
      expect(GENERATED_NOTE_TEXTS.has(note)).toBe(true);
      expect(timelineEntryHasNoteText(note)).toBe(false);
    }
  });

  it("pins Quick Log writer fallbacks to GENERATED_NOTE_TEXTS", () => {
    expect(GENERATED_NOTE_TEXTS.has(QUICK_LOG_MANUAL_READINGS_NOTE)).toBe(true);
    expect(GENERATED_NOTE_TEXTS.has(QUICK_LOG_PHOTO_DIARY_DEFAULT_NOTE)).toBe(true);
    expect(GENERATED_NOTE_TEXTS.has(QUICK_LOG_VIDEO_DIARY_DEFAULT_NOTE)).toBe(true);
    expect(timelineEntryHasNoteText(QUICK_LOG_MANUAL_READINGS_NOTE)).toBe(false);
  });

  it("PlantQuickLog reads manual-readings fallback from the shared constant", () => {
    expect(PLANT_QUICK_LOG).toMatch(
      /from "@\/constants\/quickLogGeneratedNoteCopy"[\s\S]*QUICK_LOG_MANUAL_READINGS_NOTE/,
    );
    expect(PLANT_QUICK_LOG).not.toContain('"Manual readings captured from Quick Log."');
  });

  // @source-scan-justified: entryKinds is private to Timeline.tsx; the Notes chip
  // regression is the guard pairing isTimelineSensorDerivedDiaryId with
  // timelineEntryHasNoteText before pushing the "note" filter kind.
  it("Timeline classifies Notes via timelineEntryHasNoteText on the row note", () => {
    expect(TIMELINE_PAGE).toMatch(
      /!isTimelineSensorDerivedDiaryId\(e\.id\) && timelineEntryHasNoteText\(e\.note\)/,
    );
    expect(TIMELINE_PAGE).toMatch(/kinds\.push\("note"\)/);
  });

  // @source-scan-justified: FilterChip is private to Timeline.tsx; restrict this
  // check to its declaration so the sensor-source toggle cannot satisfy it.
  it("FilterChip exposes its active state via aria-pressed", () => {
    const filterChip = TIMELINE_PAGE.match(/^function FilterChip\([\s\S]*?^\}$/m)?.[0];
    expect(filterChip).toBeDefined();
    expect(filterChip).toMatch(/aria-pressed=\{active\}/);
  });
});
