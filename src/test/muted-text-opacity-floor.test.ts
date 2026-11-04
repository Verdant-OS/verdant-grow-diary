/**
 * Contrast guard for faint muted text (docs/specs/contrast-tokens.md, D2 (a); audit 2026-11-03
 * finding 12).
 *
 * `text-muted-foreground` at /70 or fainter measures 2.1-4.0:1 in the dark theme, below WCAG AA.
 * Text or labelled icons that carry meaning use the base colour (or /80 or stronger). Only
 * decoration marked `aria-hidden` may go fainter.
 *
 * The check walks the TypeScript syntax tree of every component and page, so it reads each
 * element's real className (including `cn(...)` branches) and its real `aria-hidden` attribute.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import ts from "typescript";

const FAINT = /\btext-muted-foreground\/[1-7]0\b/;

/**
 * PlantManualSensorFreshnessCard's stale and missing labels are fixed in #2830
 * (claude/freshness-label-contrast). Remove this entry once that PR merges.
 */
const PENDING = new Set(["src/components/PlantManualSensorFreshnessCard.tsx"]);

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) files(p, out);
    else if (p.endsWith(".tsx") && !/\.test\.tsx$|__tests__/.test(p)) out.push(p);
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

function offenders(): string[] {
  const cwd = process.cwd();
  const found: string[] = [];
  for (const file of [
    ...files(resolve(cwd, "src/components")),
    ...files(resolve(cwd, "src/pages")),
  ]) {
    const rel = relative(cwd, file);
    if (PENDING.has(rel)) continue;
    const sf = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const visit = (n: ts.Node) => {
      if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) {
        const attrs = n.attributes.properties.filter(ts.isJsxAttribute);
        const cls = attrs.find((a) => a.name.getText(sf) === "className");
        const hidden = attrs.some((a) => a.name.getText(sf) === "aria-hidden");
        if (cls?.initializer && !hidden && stringsIn(cls.initializer).some((s) => FAINT.test(s))) {
          const { line } = sf.getLineAndCharacterOfPosition(n.getStart(sf));
          found.push(`${rel}:${line + 1}`);
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return found;
}

describe("muted text opacity floor (D2 a)", () => {
  it("no element without aria-hidden draws text-muted-foreground at /70 or fainter", () => {
    expect(offenders()).toEqual([]);
  });
});
