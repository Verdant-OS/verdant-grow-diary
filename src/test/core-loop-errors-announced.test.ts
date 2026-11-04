/**
 * Screen-reader guard for error messages in the core-loop forms (audit 2026-11-03 finding 12).
 *
 * An error that appears without role="alert" (or role="status" / aria-live) is never read out,
 * so a screen-reader user does not learn that a save or a value was refused. Every element in
 * these files whose data-testid ends in "error" or "errors" must announce itself.
 *
 * Scope: the One-Tent Loop entry forms (Quick Log, Create Tent, Create Plant, Grows, the Sensors
 * manual reading card). The check walks each file's TypeScript syntax tree.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import ts from "typescript";

const COMPONENTS = resolve(process.cwd(), "src/components");
const FILES = [
  ...readdirSync(COMPONENTS)
    .filter((n) => /^QuickLog.*\.tsx$/.test(n))
    .map((n) => join(COMPONENTS, n)),
  join(COMPONENTS, "CreateTentDialog.tsx"),
  join(COMPONENTS, "CreatePlantDialog.tsx"),
  join(COMPONENTS, "ManualSensorReadingCard.tsx"),
  resolve(process.cwd(), "src/pages/Grows.tsx"),
];

/** Matches a data-testid literal or template that ends in "error" or "errors". */
const ERROR_TESTID = /errors?["'`}]*\s*\}?$/;

function attrText(attr: ts.JsxAttribute | undefined, sf: ts.SourceFile): string {
  return attr?.initializer ? attr.initializer.getText(sf) : "";
}

function offenders(): string[] {
  const found: string[] = [];
  for (const file of FILES) {
    const sf = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const visit = (n: ts.Node) => {
      if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) {
        const tag = n.tagName.getText(sf);
        const attrs = n.attributes.properties.filter(ts.isJsxAttribute);
        const get = (k: string) => attrs.find((a) => a.name.getText(sf) === k);
        const testId = attrText(get("data-testid"), sf);
        if (testId && ERROR_TESTID.test(testId) && !/^Button$/.test(tag)) {
          const role = attrText(get("role"), sf);
          const announced = /alert|status/.test(role) || Boolean(get("aria-live"));
          if (!announced) {
            const { line } = sf.getLineAndCharacterOfPosition(n.getStart(sf));
            found.push(`${file.slice(process.cwd().length + 1)}:${line + 1} ${testId}`);
          }
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return found;
}

describe("core-loop error messages are announced", () => {
  it("every error element in the loop forms has role=alert/status or aria-live", () => {
    expect(offenders()).toEqual([]);
  });

  it("recognises error test ids, literal and templated", () => {
    expect(ERROR_TESTID.test('"tent-create-size-error"')).toBe(true);
    expect(ERROR_TESTID.test('"manual-reading-errors"')).toBe(true);
    expect(ERROR_TESTID.test("{`${testIdPrefix}-error`}")).toBe(true);
    expect(ERROR_TESTID.test('"qlv2-water-omit-failed-photo"')).toBe(false);
    expect(ERROR_TESTID.test('"quick-log-error-count"')).toBe(false);
  });
});
