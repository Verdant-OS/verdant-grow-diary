/**
 * #2245 Codex P2: when the PDF prints a recognized alias (pi_bridge, user,
 * import) under its canonical label, the row note and the footer must not
 * claim the stored label was preserved.
 */
import { describe, expect, it } from "vitest";
import {
  buildGrowDiaryReportModel,
  GROW_DIARY_PDF_SOURCE_NORMALIZED_NOTE,
} from "@/lib/growDiaryPdfExport";

const NOW = new Date("2026-07-07T12:00:00Z");

function sources(rows: Array<{ source: string; count: number }>) {
  return buildGrowDiaryReportModel({
    grow: { name: "G" },
    counts: { diary: 1 },
    recent: [],
    sensorSources: rows,
    now: NOW,
  });
}

describe("grow diary PDF source notes after canonicalization", () => {
  it.each([
    ["pi_bridge", "live"],
    ["user", "manual"],
    ["import", "csv"],
  ])("an alias %s printed as %s says it was normalized, not preserved", (raw, canonical) => {
    const [row] = sources([{ source: raw, count: 1 }]).sensorSources;
    expect(row.label).toBe(canonical);
    expect(row.note).toBe(GROW_DIARY_PDF_SOURCE_NORMALIZED_NOTE);
    expect(row.note).not.toMatch(/preserved/i);
    // Provenance can be generic ("External ingest"), so the note must not
    // claim the original source is displayed.
    expect(row.note).not.toMatch(/original source/i);
  });

  it("a stored canonical label still says it was preserved", () => {
    const [row] = sources([{ source: "manual", count: 1 }]).sensorSources;
    expect(row.label).toBe("manual");
    expect(row.note).toBe("Source label preserved from ingest.");
  });

  it("the footer no longer claims every source label is preserved", () => {
    const model = sources([{ source: "pi_bridge", count: 1 }]);
    expect(model.safetyFooter).not.toMatch(/labels are preserved/i);
    expect(model.safetyFooter).toMatch(/canonical labels/);
    expect(model.safetyFooter).not.toMatch(/original source/i);
    expect(model.safetyFooter).toMatch(/not treated as healthy/);
  });
});
