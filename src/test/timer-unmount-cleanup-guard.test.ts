/**
 * Static guard: timers that set React state must not outlive their component.
 *
 * A `setTimeout`/`setInterval` whose callback calls a state setter will, if it
 * survives unmount, run against a torn-down tree. React 18 no longer warns on
 * this; instead the scheduler reads `window` for event priority, so under
 * Vitest it surfaces as an unhandled `ReferenceError: window is not defined`
 * AFTER the suite reports green — failing the shard with no failing test.
 * That is what happened to `one-tent-live-proof-report.test.tsx`.
 *
 * The check is AST-based rather than regex-based so the "already safe"
 * predicate is honest. A timer is considered SAFE when either:
 *
 *   a) it is created lexically inside a `useEffect`/`useLayoutEffect` whose
 *      body contains a `clearTimeout`/`clearInterval` (the returned-cleanup
 *      pattern), or
 *   b) its handle is assigned to a ref (`someRef.current = setTimeout(...)`)
 *      AND some `useEffect` in the same file clears that exact ref.
 *
 * Timers whose callback sets no React state are ignored entirely — leaking a
 * `URL.revokeObjectURL` or `.focus()` call is harmless.
 *
 * KNOWN_UNTRACKED below is a ratchet, not an exemption: it pins the timers
 * that already existed when this guard landed so the guard could be adopted
 * without a large unrelated refactor. Adding a NEW untracked timer fails.
 * Fixing one and not removing it from the list also fails, so the list can
 * only shrink.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import ts from "typescript";

const ROOT = process.cwd();
const SCAN_DIRS = ["src/pages", "src/components"];

/**
 * Pre-existing untracked timers, as of the guard landing. Each entry is a
 * `path:line` that creates a state-setting timer with no unmount cleanup.
 * Shrink this list by adding cleanup; never grow it.
 */
const KNOWN_UNTRACKED = [
  "src/components/AiDoctorCheckInPreviewPanel.tsx",
  "src/components/EcowittIngestValidationPanel.tsx",
  "src/components/EnvironmentSummaryExportHistoryPanel.tsx",
  "src/pages/AiDoctorSessionDetail.tsx",
  "src/pages/EnvironmentSummaryReportPage.tsx",
  "src/pages/OperatorEcowittCanary.tsx",
];

const TIMER_FNS = new Set(["setTimeout", "setInterval"]);
// `setTimeout` itself matches /^set[A-Z]/, so timer fns must be excluded or a
// nested timer would be mistaken for a state setter.
const NON_SETTERS = new Set(["setTimeout", "setInterval", "setImmediate"]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

/**
 * Bare name of a called function, unwrapping the `window.` / `globalThis.`
 * forms. Both spellings are in use here — `CopyTraceLinkButton` pairs
 * `window.setTimeout` with `window.clearTimeout` — so a predicate that only
 * matched bare identifiers would report it as leaking when it is in fact the
 * cleanest implementation in the tree.
 */
function calleeName(expr: ts.Expression): string | null {
  if (ts.isIdentifier(expr)) return expr.text;
  if (ts.isPropertyAccessExpression(expr) && ts.isIdentifier(expr.name)) {
    const obj = expr.expression;
    if (ts.isIdentifier(obj) && (obj.text === "window" || obj.text === "globalThis")) {
      return expr.name.text;
    }
  }
  return null;
}

/** Does this callback body call something shaped like a React state setter? */
function callsStateSetter(node: ts.Node): boolean {
  let found = false;
  const visit = (n: ts.Node) => {
    if (found) return;
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) {
      const name = n.expression.text;
      if (/^set[A-Z]/.test(name) && !NON_SETTERS.has(name)) found = true;
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

/**
 * The cleanup function an effect returns, or null when it returns none.
 *
 * Only the returned callback runs at unmount. Code in the effect *body* runs on
 * mount, so scanning the whole effect would accept
 * `useEffect(() => { clearTimeout(ref.current); }, [])` as unmount cleanup and
 * let a genuinely leaking ref-held timer through the guard.
 *
 * Handles both shapes:
 *   useEffect(() => () => {...}, [])            — concise body IS the cleanup
 *   useEffect(() => { ...; return () => {...} }) — returned from a block body
 */
function effectCleanupBody(effectCall: ts.CallExpression): ts.Node | null {
  const cb = effectCall.arguments[0];
  if (!cb || (!ts.isArrowFunction(cb) && !ts.isFunctionExpression(cb))) {
    return null;
  }
  const body = cb.body;
  if (ts.isArrowFunction(body) || ts.isFunctionExpression(body)) return body;
  if (!ts.isBlock(body)) return null;

  let cleanup: ts.Node | null = null;
  const findReturn = (n: ts.Node) => {
    if (cleanup) return;
    // Never descend into a nested function — its `return` belongs to itself,
    // not to the effect.
    if (
      n !== body &&
      (ts.isArrowFunction(n) ||
        ts.isFunctionExpression(n) ||
        ts.isFunctionDeclaration(n))
    ) {
      return;
    }
    if (ts.isReturnStatement(n) && n.expression) {
      const e = n.expression;
      if (ts.isArrowFunction(e) || ts.isFunctionExpression(e)) cleanup = e;
      return;
    }
    ts.forEachChild(n, findReturn);
  };
  ts.forEachChild(body, findReturn);
  return cleanup;
}

/** Ref handles cleared in the CLEANUP of any effect in this file. */
function refsClearedInEffects(sf: ts.SourceFile): Set<string> {
  const cleared = new Set<string>();
  const visit = (n: ts.Node) => {
    if (
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      /^use(Effect|LayoutEffect)$/.test(n.expression.text)
    ) {
      const cleanup = effectCleanupBody(n);
      if (cleanup) {
        const inner = (m: ts.Node) => {
          if (ts.isCallExpression(m) && m.arguments[0]) {
            const name = calleeName(m.expression);
            if (name && /^clear(Timeout|Interval)$/.test(name)) {
              cleared.add(m.arguments[0].getText().replace(/\s+/g, ""));
            }
          }
          ts.forEachChild(m, inner);
        };
        ts.forEachChild(cleanup, inner);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return cleared;
}

/** Is this timer lexically inside an effect whose CLEANUP clears a timer? */
function insideEffectWithCleanup(node: ts.Node): boolean {
  for (let p: ts.Node | undefined = node.parent; p; p = p.parent) {
    if (
      ts.isCallExpression(p) &&
      ts.isIdentifier(p.expression) &&
      /^use(Effect|LayoutEffect)$/.test(p.expression.text)
    ) {
      const cleanup = effectCleanupBody(p);
      return !!cleanup && /clear(Timeout|Interval)/.test(cleanup.getText());
    }
  }
  return false;
}

type Finding = { file: string; line: number; kind: "ref" | "untracked" };

function collectFindings(): Finding[] {
  const findings: Finding[] = [];
  const files = SCAN_DIRS.flatMap((d) => walk(resolve(ROOT, d)));

  for (const file of files) {
    const text = readFileSync(file, "utf8");
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const cleared = refsClearedInEffects(sf);
    const rel = relative(ROOT, file).replace(/\\/g, "/");

    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node)) {
        const callee = calleeName(node.expression);
        const cb = node.arguments[0];
        if (callee && TIMER_FNS.has(callee) && cb && callsStateSetter(cb)) {
          const line = sf.getLineAndCharacterOfPosition(node.getStart()).line + 1;

          if (!insideEffectWithCleanup(node)) {
            const parent = node.parent;
            const assignedToRef =
              parent &&
              ts.isBinaryExpression(parent) &&
              parent.operatorToken.kind === ts.SyntaxKind.EqualsToken
                ? parent.left.getText().replace(/\s+/g, "")
                : null;

            if (assignedToRef) {
              if (!cleared.has(assignedToRef)) {
                findings.push({ file: rel, line, kind: "ref" });
              }
            } else {
              findings.push({ file: rel, line, kind: "untracked" });
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return findings;
}

describe("timers that set state are cleared on unmount", () => {
  const findings = collectFindings();

  it("every ref-held timer is cleared by an unmount effect", () => {
    const offenders = findings.filter((f) => f.kind === "ref").map((f) => `${f.file}:${f.line}`);
    expect(
      offenders,
      "A timer handle stored in a ref must be cleared in a useEffect cleanup. " +
        "Clearing it only at the start of the next call still leaks on unmount. " +
        "See src/components/CopyTraceLinkButton.tsx for the reference pattern.",
    ).toEqual([]);
  });

  it("no new untracked state-setting timers are introduced", () => {
    const offenderFiles = [
      ...new Set(findings.filter((f) => f.kind === "untracked").map((f) => f.file)),
    ].sort();
    const unexpected = offenderFiles.filter((f) => !KNOWN_UNTRACKED.includes(f));
    expect(
      unexpected,
      "New timer(s) that set React state with no unmount cleanup. Store the " +
        "handle in a ref and clear it in a useEffect cleanup, or create the " +
        "timer inside a useEffect that returns clearTimeout.",
    ).toEqual([]);
  });

  it("KNOWN_UNTRACKED has no stale entries", () => {
    const offenderFiles = new Set(
      findings.filter((f) => f.kind === "untracked").map((f) => f.file),
    );
    const stale = KNOWN_UNTRACKED.filter((f) => !offenderFiles.has(f));
    expect(
      stale,
      "These files no longer contain untracked timers — remove them from " +
        "KNOWN_UNTRACKED so the ratchet cannot slip backwards.",
    ).toEqual([]);
  });

  it("the scan actually reaches the source tree", () => {
    // Guards against a silently-empty scan making every assertion above pass.
    const files = SCAN_DIRS.flatMap((d) => walk(resolve(ROOT, d)));
    expect(files.length).toBeGreaterThan(100);
  });
});
