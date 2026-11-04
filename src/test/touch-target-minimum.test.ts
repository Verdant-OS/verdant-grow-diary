/**
 * Touch-target guard (WCAG 2.2 AA 2.5.8, minimum 24x24 CSS px; audit 2026-11-03 finding 12).
 *
 * Grow-room phones are used with wet or gloved hands. An icon-only `<button>` must be at least
 * 24 px tall: either an explicit height of h-6 / size-6 or more, or an icon plus vertical padding
 * that adds up to 24 px.
 *
 * The check walks the TypeScript syntax tree of every component and page (shadcn primitives in
 * components/ui are excluded; their sizes are 36-44 px). It estimates each icon-only button's
 * height from its className, so it reads cn(...) branches too.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import ts from "typescript";

const MIN_PX = 24;
const UNIT_PX = 4; // Tailwind spacing scale: 1 unit = 0.25rem = 4px.

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (!/__tests__|[\\/]ui$/.test(p)) files(p, out);
    } else if (p.endsWith(".tsx") && !/\.test\.tsx$/.test(p)) out.push(p);
  }
  return out;
}

function stringsIn(node: ts.Node): string[] {
  const out: string[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) out.push(n.text);
    else if (ts.isTemplateExpression(n)) {
      out.push(n.head.text, ...n.templateSpans.map((s) => s.literal.text));
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return out;
}

function classOf(el: ts.JsxOpeningLikeElement, sf: ts.SourceFile): string {
  const attr = el.attributes.properties
    .filter(ts.isJsxAttribute)
    .find((a) => a.name.getText(sf) === "className");
  return attr?.initializer ? stringsIn(attr.initializer).join(" ") : "";
}

function units(cls: string, re: RegExp): number | null {
  const m = cls.match(re);
  return m ? Number(m[1]) * UNIT_PX : null;
}

/** Estimated rendered height of an icon-only button, in px. */
function estimateHeight(buttonCls: string, iconCls: string): number {
  const explicit =
    units(buttonCls, /(?:^|\s)min-h-(\d+(?:\.\d+)?)(?=\s|$)/) ??
    units(buttonCls, /(?:^|\s)(?:h|size)-(\d+(?:\.\d+)?)(?=\s|$)/);
  if (explicit !== null) return explicit;
  const icon = units(iconCls, /(?:^|\s)(?:h|size)-(\d+(?:\.\d+)?)(?=\s|$)/) ?? 16;
  const pad =
    units(buttonCls, /(?:^|\s)py-(\d+(?:\.\d+)?)(?=\s|$)/) ??
    units(buttonCls, /(?:^|\s)p-(\d+(?:\.\d+)?)(?=\s|$)/) ??
    0;
  return icon + 2 * pad;
}

function offenders(): string[] {
  const cwd = process.cwd();
  const found: string[] = [];
  for (const file of [
    ...files(resolve(cwd, "src/components")),
    ...files(resolve(cwd, "src/pages")),
  ]) {
    const sf = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const visit = (n: ts.Node) => {
      if (ts.isJsxElement(n) && n.openingElement.tagName.getText(sf) === "button") {
        const kids = n.children.filter((c) => !(ts.isJsxText(c) && !c.text.trim()));
        const only = kids[0];
        if (
          kids.length === 1 &&
          ts.isJsxSelfClosingElement(only) &&
          /^[A-Z]/.test(only.tagName.getText(sf))
        ) {
          const h = estimateHeight(classOf(n.openingElement, sf), classOf(only, sf));
          if (h < MIN_PX) {
            const { line } = sf.getLineAndCharacterOfPosition(n.getStart(sf));
            found.push(`${relative(cwd, file)}:${line + 1} (~${h}px)`);
          }
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return found;
}

describe("touch target minimum (WCAG 2.5.8)", () => {
  it("every icon-only button is at least 24px tall", () => {
    expect(offenders()).toEqual([]);
  });

  it("estimates heights the way Tailwind renders them", () => {
    expect(estimateHeight("h-6 w-6", "h-3 w-3")).toBe(24);
    expect(estimateHeight("h-5 w-5", "h-3 w-3")).toBe(20);
    expect(estimateHeight("p-1", "h-4 w-4")).toBe(24);
    expect(estimateHeight("p-0.5", "h-4 w-4")).toBe(20);
    expect(estimateHeight("", "")).toBe(16);
    expect(estimateHeight("min-h-11", "h-3 w-3")).toBe(44);
  });
});
