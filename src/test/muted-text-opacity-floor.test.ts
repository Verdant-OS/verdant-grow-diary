/**
 * Contrast guard for faint muted text (contrast spec in Verdant-OS/verdant-grow-diary#2827, D2 (a); audit 2026-11-03
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

const MUTED_OPACITY = /\btext-muted-foreground\/(\d+|\[[^\]]+\])/g;

/** True when a class string draws muted text below /80: any integer 0-79, or an arbitrary value
 * such as `/[.3]` or `/[30%]` below 0.8. */
function hasFaintMutedText(cls: string): boolean {
  for (const [, raw] of cls.matchAll(MUTED_OPACITY)) {
    let pct: number;
    if (raw.startsWith("[")) {
      const inner = raw.slice(1, -1).trim();
      pct = inner.endsWith("%") ? Number(inner.slice(0, -1)) : Number(inner) * 100;
    } else {
      pct = Number(raw);
    }
    if (!Number.isFinite(pct) || pct < 80) return true;
  }
  return false;
}

/** Only a statically true `aria-hidden` marks decoration: bare, `"true"`, or `{true}`. */
function isStaticallyHidden(attr: ts.JsxAttribute): boolean {
  const init = attr.initializer;
  if (!init) return true;
  if (ts.isStringLiteral(init)) return init.text === "true";
  if (ts.isJsxExpression(init) && init.expression) {
    const e = init.expression;
    if (e.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return e.text === "true";
  }
  return false;
}

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
        const hidden = attrs.some(
          (a) => a.name.getText(sf) === "aria-hidden" && isStaticallyHidden(a),
        );
        if (cls?.initializer && !hidden && stringsIn(cls.initializer).some(hasFaintMutedText)) {
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

function offendersIn(source: string): number {
  const sf = ts.createSourceFile("x.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let n = 0;
  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const attrs = node.attributes.properties.filter(ts.isJsxAttribute);
      const cls = attrs.find((a) => a.name.getText(sf) === "className");
      const hidden = attrs.some(
        (a) => a.name.getText(sf) === "aria-hidden" && isStaticallyHidden(a),
      );
      if (cls?.initializer && !hidden && stringsIn(cls.initializer).some(hasFaintMutedText)) n++;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return n;
}

describe("muted text opacity matcher", () => {
  it.each(["/0", "/5", "/25", "/65", "/70", "/75", "/79", "/[.3]", "/[0.79]", "/[30%]"])(
    "flags text-muted-foreground%s",
    (suffix) => {
      expect(hasFaintMutedText(`text-sm text-muted-foreground${suffix}`)).toBe(true);
    },
  );
  it.each(["", "/80", "/90", "/100", "/[.8]", "/[80%]"])(
    "allows text-muted-foreground%s",
    (suffix) => {
      expect(hasFaintMutedText(`text-sm text-muted-foreground${suffix}`)).toBe(false);
    },
  );
  it("exempts only a statically true aria-hidden", () => {
    const faint = 'className="text-muted-foreground/40"';
    expect(offendersIn(`<span aria-hidden ${faint} />`)).toBe(0);
    expect(offendersIn(`<span aria-hidden="true" ${faint} />`)).toBe(0);
    expect(offendersIn(`<span aria-hidden={true} ${faint} />`)).toBe(0);
    expect(offendersIn(`<span aria-hidden={false} ${faint} />`)).toBe(1);
    expect(offendersIn(`<span aria-hidden="false" ${faint} />`)).toBe(1);
    expect(offendersIn(`<span aria-hidden={decorative} ${faint} />`)).toBe(1);
    expect(offendersIn(`<span ${faint} />`)).toBe(1);
  });
});

describe("muted text opacity floor (D2 a)", () => {
  it("no element without aria-hidden draws text-muted-foreground at /70 or fainter", () => {
    expect(offenders()).toEqual([]);
  });
});
