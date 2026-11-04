/**
 * Screen-reader guard for error messages on the AI Doctor sessions pages
 * (audit 2026-11-03 finding 12).
 *
 * An error is announced when it, or an element around it, carries role="alert"/"status" or
 * aria-live. The copy and export buttons here swap their own label to "Copy failed" /
 * "Export failed"; those buttons must be live regions, or a screen-reader user never hears the
 * failure. (On the detail page the buttons also have a fixed aria-label, so the swapped text is
 * not exposed as the button's name either.)
 *
 * Scope: src/pages/AiDoctorSessionsIndex.tsx and src/pages/AiDoctorSessionDetail.tsx.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

const FILES = ["src/pages/AiDoctorSessionsIndex.tsx", "src/pages/AiDoctorSessionDetail.tsx"];

const ERROR_TESTID = /errors?["'`}]*\s*\}?$/;

function attrs(el: ts.JsxOpeningLikeElement, sf: ts.SourceFile) {
  const list = el.attributes.properties.filter(ts.isJsxAttribute);
  const get = (k: string) => list.find((a) => a.name.getText(sf) === k);
  return {
    text: (k: string) => get(k)?.initializer?.getText(sf) ?? "",
    has: (k: string) => Boolean(get(k)),
  };
}

function announces(el: ts.JsxOpeningLikeElement, sf: ts.SourceFile): boolean {
  const a = attrs(el, sf);
  return /alert|status/.test(a.text("role")) || a.has("aria-live");
}

/** True when the element or any enclosing JSX element announces itself. */
function announcedWithAncestors(el: ts.JsxOpeningLikeElement, sf: ts.SourceFile): boolean {
  if (announces(el, sf)) return true;
  let node: ts.Node | undefined = el.parent;
  while (node) {
    if (ts.isJsxElement(node) && announces(node.openingElement, sf)) return true;
    node = node.parent;
  }
  return false;
}

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
        const testId = attrs(n, sf).text("data-testid");
        if (testId && ERROR_TESTID.test(testId) && n.tagName.getText(sf) !== "Button") {
          if (!announcedWithAncestors(n, sf)) {
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

describe("AI Doctor sessions error messages are announced", () => {
  it("every error element is, or sits inside, a role=alert/status or aria-live element", () => {
    expect(offenders()).toEqual([]);
  });

  it("still finds the error elements it guards (10 at time of writing)", () => {
    const text = FILES.map((f) => readFileSync(resolve(process.cwd(), f), "utf8")).join("\n");
    expect(
      text.match(/data-testid="ai-doctor-session[^"]*-error"/g)?.length ?? 0,
    ).toBeGreaterThanOrEqual(10);
  });
});
