/**
 * Screen-reader guard for error messages on the grow-room and report surfaces
 * (audit 2026-11-03 finding 12).
 *
 * An error without role="alert"/"status" or aria-live is never read out, so a screen-reader
 * user does not learn that a load or an action failed. Every element in these files whose
 * data-testid ends in "error" or "errors" must announce itself (Button tags excepted).
 *
 * Scope: soil moisture calibration, the dryback and watering history strips, tent irrigation
 * history, Plant Merge, and the diary-range and environment report date ranges. Whole-page error
 * states that replace a report (DiaryRangeReportPage, PostGrowLearningReport) are left out: a live
 * region around a whole page would read the page out.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

const FILES = [
  "src/components/SoilMoistureCalibrationCaptureCard.tsx",
  "src/components/DrybackMonitoringStrip.tsx",
  "src/components/WateringCadenceHistoryStrip.tsx",
  "src/components/irrigation/TentIrrigationHistoryPanel.tsx",
  "src/components/PlantMergeDialog.tsx",
  "src/pages/EnvironmentSummaryReportPage.tsx",
  "src/pages/DiaryRangeReportPage.tsx",
];

/** Whole-page error states, deliberately unannounced (see header). */
const PAGE_LEVEL = new Set(['"diary-range-report-error"']);

const ERROR_TESTID = /errors?["'`}]*\s*\}?$/;

function offenders(): string[] {
  const found: string[] = [];
  for (const rel of FILES) {
    const sf = ts.createSourceFile(
      rel,
      readFileSync(resolve(process.cwd(), rel), "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const visit = (n: ts.Node) => {
      if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) {
        const attrs = n.attributes.properties.filter(ts.isJsxAttribute);
        const get = (k: string) => attrs.find((a) => a.name.getText(sf) === k);
        const text = (k: string) => get(k)?.initializer?.getText(sf) ?? "";
        const testId = text("data-testid");
        if (
          testId &&
          ERROR_TESTID.test(testId) &&
          !PAGE_LEVEL.has(testId) &&
          n.tagName.getText(sf) !== "Button"
        ) {
          const announced = /alert|status/.test(text("role")) || Boolean(get("aria-live"));
          if (!announced) {
            const { line } = sf.getLineAndCharacterOfPosition(n.getStart(sf));
            found.push(`${rel}:${line + 1} ${testId}`);
          }
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return found;
}

describe("grow-room and report error messages are announced", () => {
  it("every error element on these surfaces has role=alert/status or aria-live", () => {
    expect(offenders()).toEqual([]);
  });

  it("covers at least one error element in every scoped file", () => {
    for (const rel of FILES) {
      expect(readFileSync(resolve(process.cwd(), rel), "utf8")).toMatch(
        /data-testid="[^"]*-errors?"/,
      );
    }
  });
});
