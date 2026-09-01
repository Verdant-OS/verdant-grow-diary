/**
 * Pure measurement rules for the test-estate audit.
 *
 * Extracted from `scripts/measure-test-estate.mjs` so the parsing that produces
 * published audit numbers can be regression-tested. Three independent reviewers
 * (Codex, Copilot, Cursor Bugbot) found six defects in the inlined version on
 * PR #1219, and the script had no tests at all — its parser was the evidence
 * source for the audit while nothing guarded it. Every defect they found is now
 * pinned by a fixture in `src/test/measure-test-estate-rules.test.ts`.
 *
 * No fs, no network, no clock, no randomness — the caller injects every input.
 * The one dependency is the TypeScript compiler, used to parse imports exactly
 * rather than approximate them with a regex.
 */
import ts from "typescript";

/* ------------------------------------------------------------------ *
 * Import classification
 * ------------------------------------------------------------------ */

/**
 * Resolve an import specifier to a repo-relative product path, or null.
 *
 * Handles BOTH `@/`-aliased and relative specifiers. The alias-only version of
 * this check was the single most-reported defect on #1219: tests that reach
 * product code through `../lib/x` were bucketed as "scan-only", a bucket the
 * audit defines as importing no product module at all. They are hybrids.
 */
export function resolveSpec(spec, fromFile, productSet) {
  let base;
  if (spec.startsWith("@/")) base = `src/${spec.slice(2)}`;
  else if (spec.startsWith(".")) base = posixJoin(dirnameOf(fromFile), spec);
  else return null;
  for (const c of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
    if (productSet.has(c)) return c;
  }
  return null;
}

const dirnameOf = (p) => {
  const i = p.lastIndexOf("/");
  return i === -1 ? "." : p.slice(0, i);
};

/** Minimal POSIX join+normalize; avoids depending on node:path in pure code. */
function posixJoin(dir, rel) {
  const parts = `${dir}/${rel}`.split("/");
  const out = [];
  for (const part of parts) {
    if (part === "" || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return out.join("/");
}

/**
 * Import specifiers a module depends on AT RUNTIME, parsed with the TypeScript
 * compiler rather than matched with a regex.
 *
 * The regex version was wrong in BOTH directions, which is fatal for a figure
 * published as exact. On a single fixture it missed a real multiline
 * `import Default, { a, b } from "…"` entirely while reporting a specifier from
 * a `//`-commented line as a runtime edge. Measured across the pinned tree, the
 * regex missed a local specifier in 41 files and invented one in 37 others.
 *
 * The parser gets comments, template literals, multiline clauses and type-only
 * syntax right by construction, because it is the same grammar the compiler
 * uses. What it must be told, because they are library calls rather than syntax:
 *
 * - `typeof import("x")` and `import("x").Member` in a type position are
 *   `ImportTypeNode`s, erased with the rest of the types. Not edges.
 * - `vi.importActual("x")` / `vi.importMock("x")` load the real module, and a
 *   `vi.mock("x")` / `vi.doMock("x")` with no factory auto-mocks by loading it
 *   to derive its shape. Those are edges.
 * - `vi.mock("x", () => …)` supplies the module wholesale and never loads the
 *   real one, so it is NOT an edge — counting it would credit a module with
 *   reachability from the one construct that guarantees it never ran.
 *
 * `import type` / `export type`, and named clauses whose every binding is
 * `type`, are erased by the transpiler and create no runtime edge either.
 */
export function runtimeImportSpecifiers(source, fileName = "f.tsx") {
  const sf = ts.createSourceFile(fileName, String(source), ts.ScriptTarget.Latest, false);
  const specs = [];
  // `"x" as string`, `("x")` and `"x" satisfies T` all still name module "x".
  const unwrap = (node) => {
    let n = node;
    while (
      n &&
      (ts.isAsExpression(n) || ts.isParenthesizedExpression(n) || ts.isSatisfiesExpression(n))
    ) {
      n = n.expression;
    }
    return n;
  };
  const literal = (node) => {
    const n = unwrap(node);
    return n && ts.isStringLiteral(n) ? n.text : null;
  };

  const visit = (node) => {
    if (ts.isImportDeclaration(node)) {
      const spec = literal(node.moduleSpecifier);
      if (spec && !isErasedImportClause(node.importClause)) specs.push(spec);
    } else if (ts.isExportDeclaration(node)) {
      const spec = literal(node.moduleSpecifier);
      if (spec && !node.isTypeOnly && !allBindingsTypeOnly(node.exportClause)) specs.push(spec);
    } else if (ts.isImportEqualsDeclaration(node)) {
      if (ts.isExternalModuleReference(node.moduleReference)) {
        const spec = literal(node.moduleReference.expression);
        if (spec) specs.push(spec);
      }
    } else if (ts.isCallExpression(node)) {
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === "require";
      const isDynamic = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      if (isRequire || isDynamic || loadsRealModule(node)) {
        const spec = literal(node.arguments[0]);
        if (spec) specs.push(spec);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return specs;
}

/** Vitest registry calls that load the real module rather than replace it. */
const VITEST_LOADERS = new Set(["importActual", "importMock"]);
/** Vitest registry calls that load the real module only when given no factory. */
const VITEST_AUTOMOCKS = new Set(["mock", "doMock"]);

function loadsRealModule(call) {
  const callee = call.expression;
  if (!ts.isPropertyAccessExpression(callee)) return false;
  const obj = callee.expression;
  if (!ts.isIdentifier(obj) || (obj.text !== "vi" && obj.text !== "vitest")) return false;
  const name = callee.name.text;
  if (VITEST_LOADERS.has(name)) return true;
  // `vi.mock("x", factory)` never loads "x"; bare `vi.mock("x")` auto-mocks it.
  return VITEST_AUTOMOCKS.has(name) && call.arguments.length === 1;
}

/** `import type …`, or a named clause whose every binding is `type`-prefixed. */
function isErasedImportClause(clause) {
  if (!clause) return false; // bare `import "./side-effect"` is a runtime edge
  if (clause.isTypeOnly) return true;
  if (clause.name) return false; // a default binding keeps it runtime
  return allBindingsTypeOnly(clause.namedBindings);
}

function allBindingsTypeOnly(bindings) {
  if (!bindings || !ts.isNamedImports(bindings)) {
    if (bindings && ts.isNamedExports(bindings)) {
      return bindings.elements.length > 0 && bindings.elements.every((e) => e.isTypeOnly);
    }
    return false; // namespace import/export, or nothing to inspect
  }
  return bindings.elements.length > 0 && bindings.elements.every((e) => e.isTypeOnly);
}

/**
 * Classify one test file.
 *
 * `scan-only` means: reads source/fixture files AND imports no product module
 * AND renders nothing. Anything that also executes product code is a hybrid.
 */
export function classifyTest({ source, file, productSet }) {
  const scans = /readFileSync|readFile\(|globSync|readdirSync/.test(source);
  const renders = /\brender\s*\(/.test(source);
  const importsProduct = runtimeImportSpecifiers(source).some(
    (s) => resolveSpec(s, file, productSet) !== null,
  );
  if (!scans) return "behavioural";
  return !importsProduct && !renders ? "scan-only" : "hybrid";
}

/* ------------------------------------------------------------------ *
 * Workflow execution resolution
 * ------------------------------------------------------------------ */

const RUNNERS = new Set(["bun", "bunx", "npm", "yarn", "pnpm"]);
const SCRIPT_NAME = /^[A-Za-z0-9:_-]+$/;

/**
 * Command tokens that mean "this line executes something". A path only counts
 * as executed when it shares a command line with one of these AS A BARE WORD.
 *
 * Bare-word matching is load-bearing. `irrigation-pgtap-rls-gate.yml` holds a
 * shell `ALLOWLIST=( "scripts/run-create-feeding-event-rls-harness.ts" ... )`
 * inside a `run:` block. A substring or `\brun\b` test matches `run-create…`
 * and re-admits exactly the false-live readings this is meant to exclude.
 */
const COMMAND_TOKENS = new Set([
  "bun",
  "bunx",
  "npm",
  "npx",
  "yarn",
  "pnpm",
  "node",
  "deno",
  "tsx",
  "ts-node",
  "playwright",
  "vitest",
  "jest",
  "psql",
  "supabase",
  "bash",
  "sh",
]);

/** Strip a leading `VAR=value` prefix run so `FOO=1 deno test …` still reads as a command. */
const stripEnvPrefix = (tokens) => {
  let i = 0;
  while (i < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i])) i += 1;
  return tokens.slice(i);
};

export function isCommandLine(line) {
  const tokens = stripEnvPrefix(String(line).trim().split(/\s+/).filter(Boolean));
  return tokens.some((t) => COMMAND_TOKENS.has(t.replace(/^["'`(]+/, "")));
}

/**
 * Remove the top-level `on:` trigger block.
 *
 * A trigger's `paths:` filter decides WHETHER a workflow runs, never WHAT it
 * executes. Counting it reported 32 unrun Playwright specs when the truth
 * was 25.
 */
export function stripTriggerBlock(text) {
  const out = [];
  let inTrigger = false;
  for (const line of String(text).split("\n")) {
    if (/^on:/.test(line)) {
      inTrigger = true;
      continue;
    }
    if (inTrigger && /^[^\s#]/.test(line)) inTrigger = false;
    if (!inTrigger) out.push(line);
  }
  return out.join("\n");
}

/**
 * The command lines of a workflow: the body of every `run:` step, filtered to
 * lines that actually invoke something.
 *
 * Everything else in a workflow — `with:` inputs, `paths-filter` allowlists,
 * shell arrays of paths, comments, job summaries — MENTIONS files without
 * running them. Treating a mention as execution is a false-live reading, and
 * it is how two harnesses that no workflow invokes were published as executed.
 */
export function commandLinesIn(workflowText) {
  const lines = String(workflowText).split("\n");
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    const m = lines[i].match(/^(\s*)-?\s*run:\s*([|>][-+]?)?\s*(.*)$/);
    if (!m) continue;
    const indent = m[1].length;
    const style = m[2] ?? "";
    if (m[3] && m[3].trim()) out.push(m[3]);
    if (!style) continue; // single-line run:, no block to consume

    const block = [];
    for (let j = i + 1; j < lines.length; j += 1) {
      const line = lines[j];
      if (line.trim() === "") {
        block.push("");
        continue;
      }
      const lead = line.length - line.trimStart().length;
      if (lead <= indent) break;
      block.push(line);
    }

    if (style.startsWith(">")) {
      // YAML FOLDED scalar: newlines become spaces, so the whole block is ONE
      // shell command. Treating its lines separately strands arguments on
      // lines with no runner token — which is how
      //   run: >-
      //     bunx playwright test
      //     --project=chromium-mocked
      //     e2e/core-link-form-census.spec.ts
      // read as never-run despite CI executing it every time. A blank line in
      // a folded scalar is a paragraph break, so it separates commands.
      for (const para of splitOnBlank(block)) {
        out.push(para.map((l) => l.trim()).join(" "));
      }
    } else {
      // YAML LITERAL scalar: newlines are preserved, each line is its own
      // shell line. Backslash continuations still join.
      out.push(...foldContinuations(block));
    }
  }
  return out.filter((l) => isCommandLine(l));
}

function splitOnBlank(block) {
  const paras = [];
  let cur = [];
  for (const line of block) {
    if (line.trim() === "") {
      if (cur.length) paras.push(cur);
      cur = [];
    } else cur.push(line);
  }
  if (cur.length) paras.push(cur);
  return paras;
}

/**
 * Join shell line-continuations before deciding what is a command.
 *
 * A wrapped command puts its runner on the first line and its arguments on the
 * next, so a per-line test drops the arguments. The irrigation gate runs
 *
 *     psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
 *       -f supabase/tests/create_feeding_event.sql 2>&1 \
 *       | tee pgtap-feeding.log
 *
 * and without folding, the only line naming the .sql file carries no runner
 * token — so two pgTAP suites that CI genuinely executes read as never-run.
 * That is a false-DEAD, the mirror of the false-LIVE this filter exists to fix,
 * and it is why both directions are pinned by tests.
 */
export function foldContinuations(rawLines) {
  const out = [];
  let buf = null;
  for (const line of rawLines) {
    const trimmed = line.trimEnd();
    const continues = trimmed.endsWith("\\");
    const piece = continues ? trimmed.slice(0, -1) : trimmed;
    if (buf === null) buf = piece;
    else buf += ` ${piece.trim()}`;
    if (!continues) {
      out.push(buf);
      buf = null;
    }
  }
  if (buf !== null) out.push(buf);
  return out;
}

/**
 * Package-script names a command text invokes: `bun run x`, and also
 * `bun --env-file=.env run x`, where flags sit between the runner and `run`.
 *
 * Tokenised, not one regex: the regex form needed a nested quantifier over the
 * flag run, which CodeQL flagged as exponential backtracking (alert 254, high)
 * — not theoretically, but measured at 262ms on a 101-character input.
 */
export function scriptNamesIn(text, scriptNames = []) {
  const names = [];
  const tokens = String(text).split(/\s+/);
  for (let i = 0; i < tokens.length; i += 1) {
    if (!RUNNERS.has(tokens[i])) continue;
    let j = i + 1;
    while (j < tokens.length && tokens[j].startsWith("-")) j += 1;
    if (tokens[j] !== "run") continue;
    const name = tokens[j + 1];
    if (!name) continue;
    if (SCRIPT_NAME.test(name)) {
      names.push(name);
      continue;
    }
    // `bun run e2e:ga:${{ matrix.browser }}` — resolving the matrix means
    // parsing the workflow; reaching every script that extends the literal
    // prefix is the conservative read, and conservative here means "counts as
    // executed", the safe direction for a guard that must never call a file
    // dead while something runs it.
    const prefix = name.split("${")[0];
    if (prefix.length > 0 && SCRIPT_NAME.test(prefix)) {
      for (const candidate of scriptNames) {
        if (candidate.startsWith(prefix)) names.push(candidate);
      }
    }
  }
  return names;
}

/** Recursively inline the bodies of package scripts a script chains to. */
export function expandScript(name, scripts, depth = 0, seen = new Set()) {
  if (depth > 8 || !scripts[name] || seen.has(name)) return "";
  seen.add(name);
  const scriptNames = Object.keys(scripts);
  let out = scripts[name];
  for (const called of scriptNamesIn(scripts[name], scriptNames)) {
    out += ` ${expandScript(called, scripts, depth + 1, seen)}`;
  }
  return out;
}

const RUNNER_PATH = /(?:^|[\s"'`])((?:scripts|e2e|tools)\/[A-Za-z0-9_./-]+\.(?:mjs|cjs|js|ts))/g;
const IS_TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;

/**
 * Everything CI actually executes, as one text corpus.
 *
 * Three sources, in order: workflow COMMAND LINES only; the package scripts
 * those name, expanded; and one hop into repo runner scripts those name. A
 * runner script's own body is taken whole — a path literal there is a spec
 * list being executed, not prose. One hop only: arbitrary depth turns any
 * transitive mention into "executed".
 */
export function buildExecutableCorpus({ workflowTexts, scripts = {}, readRunner = () => null }) {
  const scriptNames = Object.keys(scripts);
  let corpus = workflowTexts.map((t) => commandLinesIn(stripTriggerBlock(t)).join("\n")).join("\n");
  for (const called of scriptNamesIn(corpus, scriptNames)) {
    corpus += ` ${expandScript(called, scripts)}`;
  }
  const followed = new Set();
  for (const match of corpus.matchAll(new RegExp(RUNNER_PATH.source, "g"))) {
    const rel = match[1];
    if (followed.has(rel) || IS_TEST_FILE.test(rel)) continue;
    followed.add(rel);
    const bodyText = readRunner(rel);
    if (typeof bodyText === "string") corpus += ` ${bodyText}`;
  }
  return corpus;
}

/**
 * Exact repo-relative path tokens the corpus names.
 *
 * Exact path equality only. A prototype that accepted directory prefixes and
 * glob tokens reported all 100 lane files as reached, because a bare `**`
 * appears somewhere in the corpus.
 */
export function namedPathsIn(corpus) {
  return new Set(
    [...String(corpus).matchAll(/[A-Za-z0-9_][A-Za-z0-9_./-]*\.(?:ts|tsx|mjs|cjs|js|sql)/g)].map(
      (m) => m[0],
    ),
  );
}
