/**
 * QA 2026-09-24 (BUG-007 follow-up): a grower entered handheld EC in mS/cm,
 * the note recorded "Feed/Input EC (mS/cm): 1200", and Timeline's manual
 * reading chip said "Input EC/PPM 1200" — the declared unit became an
 * ambiguous "EC/PPM". The chip now shows the unit the note declared, and a
 * legacy row that never recorded one says so instead of implying either.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ManualReadingsChips } from "@/components/QuickLogHistoryPanels";
import { normalizeDiaryEntries } from "@/lib/diaryEntryRules";
import { appendHardwareReadingsToNote } from "@/lib/quickLogHardwareReadingsRules";
import {
  buildRecentQuickLogActivity,
  parseManualHandheldReadings,
} from "@/lib/quickLogHistoryRules";
import { buildManualReadingChips } from "@/lib/quickLogManualReadingChipsViewModel";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

const HEADER = "Hardware readings (manual handheld):";

/** What the current Quick Log writer stores for the QA submission. */
const QA_NOTE = appendHardwareReadingsToNote("Fed", {
  inputPh: "15",
  inputEc: "1200",
  runoffPh: "-3",
  runoffEc: "1.8",
});

function legacyNote(...lines: string[]) {
  return ["Watered today.", "", HEADER, ...lines].join("\n");
}

function chips(note: string) {
  return buildManualReadingChips(parseManualHandheldReadings(note)).map((c) => [
    c.label,
    c.value,
    c.invalid,
  ]);
}

function historyRow(note: string) {
  const [row] = buildRecentQuickLogActivity(
    normalizeDiaryEntries({
      rawEntries: [
        {
          id: "d1",
          entry_type: "feeding",
          entry_at: "2026-09-24T08:26:00.000Z",
          note,
          details: { event_type: "feeding" },
        },
      ],
    }),
    10,
  );
  return row;
}

describe("manual EC reading chips name the recorded unit", () => {
  it("QA repro: the note's mS/cm stays mS/cm instead of becoming EC/PPM", () => {
    expect(QA_NOTE).toContain("- Feed/Input EC (mS/cm): 1200");
    expect(chips(QA_NOTE)).toEqual([
      ["Input pH", "15", true],
      ["Input EC (mS/cm)", "1200", true],
      ["Runoff pH", "-3", true],
      ["Runoff EC (mS/cm)", "1.8", false],
    ]);
  });

  it("a legacy row with no recorded unit says so instead of implying EC or PPM", () => {
    expect(chips(legacyNote("- Input EC/PPM: 1.4", "- Runoff EC/PPM: 1.6"))).toEqual([
      ["Input EC/PPM (unit not recorded)", "1.4", false],
      ["Runoff EC/PPM (unit not recorded)", "1.6", false],
    ]);
    expect(chips(legacyNote("- Feed/Input EC: 1.4"))).toEqual([
      ["Input EC/PPM (unit not recorded)", "1.4", false],
    ]);
  });

  it("the mS/cm range applies only when the note declared mS/cm", () => {
    // 1200 is impossible in mS/cm but an ordinary PPM reading; a row that
    // never recorded its unit cannot be range-checked, only format-checked.
    expect(chips(legacyNote("- Input EC/PPM: 1200"))).toEqual([
      ["Input EC/PPM (unit not recorded)", "1200", false],
    ]);
    expect(chips(legacyNote("- Input EC/PPM: -3", "- Runoff EC/PPM: 1,8"))).toEqual([
      ["Input EC/PPM (unit not recorded)", "-3", true],
      ["Runoff EC/PPM (unit not recorded)", "1,8", true],
    ]);
    expect(chips(legacyNote("- Feed / Input EC (ppm): 800"))).toEqual([
      ["Input EC (ppm)", "800", false],
    ]);
  });

  it("canonicalises hand-edited unit spellings and keeps unknown ones verbatim", () => {
    expect(
      chips(legacyNote("- Runoff EC (MS/CM): 1.6", "- Feed/Input EC (uS / cm): 1400")),
    ).toEqual([
      ["Input EC (µS/cm)", "1400", false],
      ["Runoff EC (mS/cm)", "1.6", false],
    ]);
    expect(chips(legacyNote("- Input EC (TDS-ish): 2"))).toEqual([
      ["Input EC (TDS-ish)", "2", false],
    ]);
  });

  it("the last line for a field decides both its value and its unit", () => {
    expect(chips(legacyNote("- Feed/Input EC (mS/cm): 1.2", "- Input EC/PPM: 900"))).toEqual([
      ["Input EC/PPM (unit not recorded)", "900", false],
    ]);
  });

  it("the parser keeps its values and records the declared unit beside them", () => {
    const parsed = parseManualHandheldReadings(QA_NOTE);
    expect(parsed?.inputEc).toBe("1200");
    expect(parsed?.inputEcUnit).toBe("mS/cm");
    expect(parsed?.runoffEcUnit).toBe("mS/cm");
    const legacy = parseManualHandheldReadings(legacyNote("- Input EC/PPM: 1.4"));
    expect(legacy?.inputEc).toBe("1.4");
    expect(legacy && "inputEcUnit" in legacy).toBe(false);
    expect(buildManualReadingChips(null)).toEqual([]);
  });
});

describe("Timeline manual-reading chips", () => {
  it("render the recorded unit and never the ambiguous EC/PPM label for mS/cm rows", () => {
    render(<ManualReadingsChips row={historyRow(QA_NOTE)} />);
    const panel = screen.getByTestId("quicklog-history-manual-readings");
    expect(panel.textContent).toContain("Input EC (mS/cm)");
    expect(panel.textContent).toContain("Runoff EC (mS/cm)");
    expect(panel.textContent).not.toContain("EC/PPM");
    const flagged = Array.from(panel.querySelectorAll('[data-invalid="true"]')).map(
      (el) => el.textContent,
    );
    expect(flagged).toContain("Input EC (mS/cm)1200· outside valid range, not used");
  });

  it("render nothing for a row without manual readings", () => {
    const { container } = render(<ManualReadingsChips row={historyRow("Just a note")} />);
    expect(container.textContent).toBe("");
  });
});
