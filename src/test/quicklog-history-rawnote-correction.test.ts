/**
 * Correction prefill must not lose manual handheld readings (issue #786
 * review, P1). `noteBody` strips the hardware block for display; the
 * correction dialog must edit `rawNote` (the full persisted note) so a note
 * correction cannot silently drop measurements from active history.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { buildRecentQuickLogActivity } from "@/lib/quickLogHistoryRules";
import { normalizeDiaryEntries } from "@/lib/diaryEntryRules";

const NOTE_WITH_READINGS = [
  "Fed after lights-on.",
  "",
  "Hardware readings (manual handheld):",
  "- Input pH: 6.1",
  "- Input EC/PPM: 1.6",
].join("\n");

describe("QuickLogHistoryRow.rawNote", () => {
  it("keeps the full persisted note while noteBody stays display-stripped", () => {
    const normalized = normalizeDiaryEntries({
      rawEntries: [
        {
          id: "d1",
          entry_type: "feeding",
          entry_at: "2026-08-10T10:00:00.000Z",
          note: NOTE_WITH_READINGS,
          details: { event_type: "feeding" },
        },
      ],
    });
    const rows = buildRecentQuickLogActivity(normalized, 10);
    expect(rows).toHaveLength(1);
    expect(rows[0].noteBody).toBe("Fed after lights-on.");
    expect(rows[0].rawNote).toContain("Input pH: 6.1");
    expect(rows[0].rawNote).toContain("Hardware readings (manual handheld):");
  });
});

describe("history panel correction prefill", () => {
  it("prefills the correction dialog from rawNote, not the stripped noteBody", () => {
    const src = readFileSync(
      join(__dirname, "..", "components", "QuickLogHistoryPanels.tsx"),
      "utf8",
    );
    expect(src).toMatch(/currentNote=\{row\.rawNote/);
    expect(src).not.toMatch(/currentNote=\{row\.noteBody/);
  });
});
