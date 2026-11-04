/**
 * Screen-reader guard for error messages on the loop spine pages (audit 2026-11-03 finding 12).
 *
 * An error without role="alert"/"status" or aria-live is never read out, so a screen-reader
 * user does not learn that a load or an action failed. Every element in these files whose
 * data-testid ends in "error" or "errors" must announce itself (Button tags excepted).
 *
 * Scope: Tents, Plants, the plant detail photo strip, and the AI Doctor check-in panel and
 * add-to-Action-Queue button. Timeline.tsx is left to a later slice (three open PRs touch it).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

const FILES = [
  "src/pages/Tents.tsx",
  "src/pages/Plants.tsx",
  "src/components/PlantDetailPhotoStrip.tsx",
  "src/components/AiDoctorCheckInPreviewPanel.tsx",
  "src/components/AiDoctorSessionActionQueueButton.tsx",
];

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
        if (testId && ERROR_TESTID.test(testId) && n.tagName.getText(sf) !== "Button") {
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

describe("loop spine error messages are announced", () => {
  it("every error element on the spine pages has role=alert/status or aria-live", () => {
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
