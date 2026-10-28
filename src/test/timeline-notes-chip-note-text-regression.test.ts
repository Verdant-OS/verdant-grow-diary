/**
 * Supplemental regression coverage for PR #2478 (re-cut from #2480, commits
 * 2a94c2120 and 7966b0ca1): the Notes chip must treat Plant Quick Log's
 * manual-readings fallback as generated text through the writer's own export,
 * so the writer and the Timeline filter cannot drift apart. The literal-string
 * checks already live in timeline-entry-has-note-text-rules.test.ts.
 */
import { describe, expect, it } from "vitest";
import { QUICK_LOG_MANUAL_READINGS_NOTE } from "@/constants/quickLogGeneratedNoteCopy";
import { GENERATED_NOTE_TEXTS, timelineEntryHasNoteText } from "@/lib/timelineChipCountRules";

describe("Timeline Notes chip — generated text contract", () => {
  it("pins the Quick Log manual-readings writer fallback to GENERATED_NOTE_TEXTS", () => {
    expect(GENERATED_NOTE_TEXTS.has(QUICK_LOG_MANUAL_READINGS_NOTE)).toBe(true);
    expect(timelineEntryHasNoteText(QUICK_LOG_MANUAL_READINGS_NOTE)).toBe(false);
  });
});
