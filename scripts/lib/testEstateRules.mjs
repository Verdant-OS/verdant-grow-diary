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
export function resolveSpec(spec, fromFile, moduleSet) {
  let base;
  if (spec.startsWith("@/")) base = `src/${spec.slice(2)}`;
  else if (spec.startsWith(".")) base = posixJoin(dirnameOf(fromFile), spec);
  else return null;
  // No `.mjs` / `.js` candidate is needed for the executable modules outside
  // `src/`: every real import of one carries its extension, which the bare
  // `base` already matches. Measured — adding them moves no figure.
  for (const c of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
    if (moduleSet.has(c)) return c;
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
  const name = viCallName(call);
  if (name === null) return false;
  if (VITEST_LOADERS.has(name)) return true;
  // `vi.mock("x", factory)` never loads "x"; bare `vi.mock("x")` auto-mocks it.
  return VITEST_AUTOMOCKS.has(name) && call.arguments.length === 1;
}

/**
 * Product modules a TEST file replaces wholesale with a `vi.mock(spec, factory)`.
 *
 * `vi.mock` is hoisted above the file's imports and applies to the whole module,
 * so a static `import { x } from "./foo"` in a file that also factory-mocks
 * "./foo" resolves to the factory — the real module never loads, and counting it
 * as reached credits the module from the one construct that guarantees it did
 * not run.
 *
 * A bare `vi.mock(spec)` is NOT included: it auto-mocks by loading the real
 * module for its shape.
 *
 * `vi.doMock(spec, factory)` is not included either, and that exclusion is
 * NARROWER than it first appears — stated precisely because an earlier version
 * of this comment over-generalised it. `doMock` is not hoisted, so it genuinely
 * cannot replace a module a STATIC import already loaded. But it does replace
 * one dynamically imported after it:
 *
 *     vi.doMock("@/lib/growRepo", () => ({ … }));
 *     const repo = await import("@/lib/growRepo");   // resolves to the factory
 *
 * Modelling that needs statement ordering, which this does not do, so such a
 * specifier is still reported as an edge. Measured at the pinned revision: 12
 * test files use the pattern, and blocking every `doMock` unconditionally — an
 * over-blocking ceiling — moves NO module, because each is genuinely loaded by
 * some other test. The published figure is therefore unaffected; the limitation
 * is recorded rather than silently carried. See the audit's §9.0 defect 22.
 *
 * The caller subtracts this set from a test file's edges, but must keep any
 * specifier the same file also passes to `vi.importActual` / `vi.importMock` —
 * those bypass the registry and load the real module, which is exactly what the
 * repo's spread-actual pattern does.
 */
export function factoryMockedSpecifiers(source, fileName = "f.tsx") {
  const sf = ts.createSourceFile(fileName, String(source), ts.ScriptTarget.Latest, false);
  const specs = [];
  const visit = (node) => {
    if (ts.isCallExpression(node) && isViCall(node, "mock") && node.arguments.length > 1) {
      const arg = node.arguments[0];
      if (ts.isStringLiteral(arg)) specs.push(arg.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return specs;
}

/**
 * Specifiers a file loads for real regardless of any mock registered on them.
 *
 * Two shapes, and both are needed — recognising only the first silently dropped
 * a real edge in 19 test files at the pinned revision:
 *
 * - `vi.importActual(spec)` / `vi.importMock(spec)`, called anywhere.
 * - the factory callback form,
 *   `vi.mock(spec, async (importOriginal) => ({ ...(await importOriginal()) }))`.
 *   Vitest passes the factory a function that loads the original module. The
 *   parameter is conventionally named `importOriginal`, but the name is the
 *   test author's choice, so it is matched by BINDING: the factory's first
 *   parameter, invoked somewhere inside the factory body. A parameter that is
 *   declared and never called loads nothing and is not a bypass.
 */
export function bypassesMockSpecifiers(source, fileName = "f.tsx") {
  const sf = ts.createSourceFile(fileName, String(source), ts.ScriptTarget.Latest, false);
  const specs = [];
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      if (VITEST_LOADERS.has(viCallName(node) ?? "")) {
        const arg = node.arguments[0];
        if (arg && ts.isStringLiteral(arg)) specs.push(arg.text);
      } else if (isViCall(node, "mock") || isViCall(node, "doMock")) {
        const [spec, factory] = node.arguments;
        if (spec && ts.isStringLiteral(spec) && callsItsOwnFirstParameter(factory)) {
          specs.push(spec.text);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return specs;
}

/** Is `fn` a function whose first parameter is invoked inside its own body? */
function callsItsOwnFirstParameter(fn) {
  if (!fn || (!ts.isArrowFunction(fn) && !ts.isFunctionExpression(fn))) return false;
  const first = fn.parameters[0];
  if (!first || !ts.isIdentifier(first.name)) return false;
  const name = first.name.text;
  let called = false;
  const visit = (node) => {
    if (called) return;
    if (ts.isCallExpression(node)) {
      // `importOriginal()` and `importOriginal<T>()` alike.
      const callee = node.expression;
      if (ts.isIdentifier(callee) && callee.text === name) {
        called = true;
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(fn.body ?? fn);
  return called;
}

/**
 * The specifiers a TEST file loads for real, with Vitest's mock semantics applied.
 *
 * This is the rule the audit publishes for module reachability, in one place so
 * the script cannot drift from it — an earlier version of the script subtracted
 * every `vi.mock` path with a regex, which contradicted the parser above in two
 * directions at once and was invisible because nothing tested the composition.
 */
export function testFileRuntimeSpecifiers(source, fileName = "f.tsx") {
  const bypassed = bypassesMockSpecifiers(source, fileName);
  const replaced = new Set(mockReplacedSpecifiers(source, fileName));
  const imported = runtimeImportSpecifiers(source, fileName).filter((spec) => !replaced.has(spec));
  // A bypass is an edge in its OWN right, not merely a veto on subtraction. A
  // file that mocks a module with `importOriginal` and imports it only as a
  // type — or not at all — still loads the real module, and filtering alone
  // would emit nothing for it.
  return [...imported, ...bypassed.filter((spec) => !imported.includes(spec))];
}

/**
 * Modules this test file replaces wholesale — factory-mocked and not bypassed.
 *
 * These are not merely absent from the file's own edges: `vi.mock` is hoisted
 * and applies to the WHOLE module graph of that test, so a product module the
 * test reaches only THROUGH another product module is replaced too. A caller
 * walking the graph must therefore block these at every depth, not just at the
 * seeds — see the audit's §9.0 defect 21.
 *
 * Exported so the seeding stage and the traversal stage cannot disagree about
 * what "replaced" means, which is how that defect arose in the first place.
 */
export function mockReplacedSpecifiers(source, fileName = "f.tsx") {
  const bypassed = new Set(bypassesMockSpecifiers(source, fileName));
  return factoryMockedSpecifiers(source, fileName).filter((spec) => !bypassed.has(spec));
}

/**
 * Modules reachable from `seeds`, never entering anything in `blocked`.
 *
 * Pure: the caller injects `depsOf`, so this holds no I/O and no graph of its
 * own. It lives here rather than in the script because the blocking rule is the
 * published method — an earlier version blocked at the seeds and then walked
 * context-free, which silently re-added every module a test had replaced.
 *
 * `blocked` is checked on entry to each neighbour, so a blocked module is
 * neither reached nor traversed THROUGH. Seeds are taken as given: the caller
 * has already excluded replaced modules from them.
 */
export function reachableClosure({ seeds, blocked = new Set(), depsOf }) {
  const seen = new Set(seeds);
  const stack = [...seen];
  while (stack.length) {
    for (const next of depsOf(stack.pop()) ?? []) {
      if (!seen.has(next) && !blocked.has(next)) {
        seen.add(next);
        stack.push(next);
      }
    }
  }
  return seen;
}

/** The method name of a `vi.*` / `vitest.*` call, or null if it is not one. */
function viCallName(call) {
  const callee = call.expression;
  if (!ts.isPropertyAccessExpression(callee)) return null;
  const obj = callee.expression;
  if (!ts.isIdentifier(obj) || (obj.text !== "vi" && obj.text !== "vitest")) return null;
  return callee.name.text;
}

const isViCall = (call, name) => viCallName(call) === name;

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
export function classifyTest({ source, file, executableSet, helperSet, sourceOf }) {
  return bucketOf(testFileReach({ source, file, executableSet, helperSet, sourceOf }));
}

/** The bucket a reach summary falls in. Split out so the walk can be reused. */
export function bucketOf({ scans, renders, importsProduct }) {
  if (!scans) return "behavioural";
  return !importsProduct && !renders ? "scan-only" : "hybrid";
}

/**
 * What one test file reaches, following its own TEST-HELPER imports.
 *
 * Classifying on the test file's own text alone stops at the wrong boundary. A
 * test that scans source through `src/test/helpers/…` does the reading in the
 * helper, and a test that reaches a product module only through a helper still
 * executes product code. At the pinned revision
 * `action-detail-context-links.test.ts` imports `routeManifestSyncHarness`,
 * which reads route sources AND imports `@/lib/appRouteManifest`; the file was
 * filed `scan-only` because neither edge was followed. See the audit's §9.0
 * defect 25 for the 35 files this moved and the 13 credited with no file I/O.
 *
 * `executableSet` is deliberately WIDER than the reachability denominator: it
 * adds the executable modules under `scripts/` and `supabase/functions/`. The
 * scan-only bucket is defined by not executing product code, and a module under
 * `supabase/functions/` is product code that happens not to live in `src/`.
 * Building it from `src/` alone filed 57 tests that import and run those modules
 * as scan-only — see the audit's §9.0 defect 28. Reachability keeps the
 * `src/`-only denominator, because that is a different question.
 *
 * Helpers are walked transitively. An executable module is a STOPPING edge: the
 * question is only whether one is reached, never what it goes on to pull in.
 * Mock-replaced specifiers never appear here, so a helper the test `vi.mock`s
 * is correctly not walked.
 */
export function testFileReach({ source, file, executableSet, helperSet, sourceOf }) {
  const read = (f) => (f === file ? source : (sourceOf?.(f) ?? ""));
  const seen = new Set([file]);
  const stack = [file];
  let scans = false;
  let renders = false;
  let readsSrc = false;
  let importsProduct = false;
  while (stack.length) {
    const cur = stack.pop();
    const src = read(cur);
    if (!scans) scans = readsFileContent(src, cur);
    if (!renders) renders = rendersComponents(src, cur);
    if (!readsSrc) readsSrc = readsSrcPath(src, cur);
    for (const spec of testFileRuntimeSpecifiers(src, cur)) {
      if (resolveSpec(spec, cur, executableSet) !== null) {
        importsProduct = true;
        continue;
      }
      const helper = helperSet ? resolveSpec(spec, cur, helperSet) : null;
      if (helper && !seen.has(helper)) {
        seen.add(helper);
        stack.push(helper);
      }
    }
  }
  return { scans, renders, readsSrc, importsProduct };
}

/**
 * Readers that return file CONTENT (or a directory listing to then read).
 *
 * Deliberately excludes the metadata calls — `existsSync`, `statSync`,
 * `lstatSync`, `accessSync`. They are filesystem I/O, but they read no bytes,
 * and this set gates the scan-only bucket, which §3.1 of the audit defines as
 * tests asserting **against source text**. A test that calls
 * `expect(existsSync(p)).toBe(false)` asserts a file is ABSENT: it has no text
 * to assert on, so filing it under that bucket would break the definition the
 * headline rests on. The metric is named for content reads instead — see the
 * audit's §9.0 defect 23, which measures the four files this excludes.
 */
const CONTENT_READERS = new Set(["readFileSync", "readdirSync", "readFile", "globSync"]);

/**
 * Does this file CALL `render(…)`?
 *
 * `/\brender\s*\(/` matched the text anywhere, including inside a test title:
 * `alerts-foundation.test.ts` has `it("does not auto-save alerts on render (no
 * top-level saveAlert call)")` and never calls `render`, yet was classified
 * hybrid rather than scan-only on that string alone.
 */
export function rendersComponents(source, fileName = "f.tsx") {
  const sf = ts.createSourceFile(fileName, String(source), ts.ScriptTarget.Latest, false);
  let found = false;
  const visit = (node) => {
    if (found) return;
    if (ts.isCallExpression(node)) {
      const e = node.expression;
      const name = ts.isIdentifier(e)
        ? e.text
        : ts.isPropertyAccessExpression(e)
          ? e.name.text
          : null;
      if (name === "render") {
        found = true;
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

/**
 * Does this file actually CALL a reader that returns file CONTENT?
 *
 * The predicate used to match the names anywhere in the source, which fired on
 * a `type FsLike = { readdirSync: (p: string) => string[] }` and on injected
 * fakes such as `{ readFileSync: (file: string) => "…" }` — declarations, not
 * reads. Two files at the pinned revision (`run-skill-driver-probe.test.ts` and
 * `subscriber-growth-backend-remote-verification.test.ts`) contain no call to
 * any reader at all and were nonetheless counted in the scan-only bucket.
 *
 * Only a CallExpression counts, by bare name or as the property being invoked.
 * Metadata-only calls are not content reads — see `CONTENT_READERS`.
 */
export function readsFileContent(source, fileName = "f.tsx") {
  const sf = ts.createSourceFile(fileName, String(source), ts.ScriptTarget.Latest, false);
  let found = false;
  const visit = (node) => {
    if (found) return;
    if (ts.isCallExpression(node)) {
      const e = node.expression;
      const name = ts.isIdentifier(e)
        ? e.text
        : ts.isPropertyAccessExpression(e)
          ? e.name.text
          : null;
      if (name && CONTENT_READERS.has(name)) {
        found = true;
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

/**
 * Does this file read a path under `src/`?
 *
 * The path must come from the READER CALL'S OWN ARGUMENT. An earlier version
 * combined two independent file-level predicates — "reads some file" AND "the
 * word `src/` appears in some string" — which counted
 * `architecture-docs.test.ts`, a file that reads `docs/architecture.md` and then
 * asserts the document mentions two `src/test/…` paths. The `src/` was in the
 * assertion, not the read.
 *
 * Literals are gathered from the argument expression, following same-file
 * `const NAME = "literal"` bindings one level and descending into calls such as
 * `path.join(ROOT, "src", "lib")`, so both a joined `"src/lib/x.ts"` and a
 * segment-wise `"src"` count. A path this cannot resolve statically is NOT
 * counted — the figure is a floor, not an estimate.
 */
export function readsSrcPath(source, fileName = "f.tsx") {
  const sf = ts.createSourceFile(fileName, String(source), ts.ScriptTarget.Latest, false);

  // Same-file `const NAME = "literal"` bindings, for `readFileSync(DOC_PATH)`.
  const bindings = new Map();
  const collectBindings = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const init = node.initializer;
      if (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init)) {
        bindings.set(node.name.text, init.text);
      }
    }
    ts.forEachChild(node, collectBindings);
  };
  collectBindings(sf);

  const literalsIn = (node, depth = 0) => {
    if (!node || depth > 6) return [];
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [node.text];
    if (ts.isIdentifier(node)) {
      const bound = bindings.get(node.text);
      return bound === undefined ? [] : [bound];
    }
    if (ts.isTemplateExpression(node)) {
      const out = [node.head.text];
      for (const span of node.templateSpans) {
        out.push(...literalsIn(span.expression, depth + 1), span.literal.text);
      }
      return out;
    }
    if (ts.isCallExpression(node)) {
      // path.join(...) / path.resolve(...) and friends.
      return node.arguments.flatMap((a) => literalsIn(a, depth + 1));
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      return [...literalsIn(node.left, depth + 1), ...literalsIn(node.right, depth + 1)];
    }
    return [];
  };

  let found = false;
  const visit = (node) => {
    if (found) return;
    if (ts.isCallExpression(node)) {
      const e = node.expression;
      const name = ts.isIdentifier(e)
        ? e.text
        : ts.isPropertyAccessExpression(e)
          ? e.name.text
          : null;
      if (name && CONTENT_READERS.has(name)) {
        const parts = literalsIn(node.arguments[0]);
        const joined = parts.join("/");
        if (parts.some((t) => t.includes("src/")) || /(^|\/)src(\/|$)/.test(joined)) {
          found = true;
          return;
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

/**
 * The identifier a call/property chain roots at: `it.each([…])(…)` → `it`.
 *
 * Also resolves the two shapes that select a registrar at RUNTIME, which a
 * plain chain walk returns `null` for — silently dropping the case:
 *
 *   (HAS_TABLE ? it : it.skip)("…", fn)          // parenthesised conditional
 *   const maybeIt = pwsh ? it : it.skip;         // bound to an identifier
 *   maybeIt("…", fn)
 *
 * Both register a case either way; only WHICH registrar runs is conditional. A
 * conditional resolves only when both branches root at the same registrar, so a
 * genuine `cond ? it : somethingElse` stays unresolved rather than guessed.
 * See the audit's §9.0 defect 27 for the 24 sites this recovers.
 */
function chainRoot(node, aliases) {
  let cur = node;
  for (;;) {
    if (ts.isCallExpression(cur)) cur = cur.expression;
    else if (ts.isTaggedTemplateExpression(cur)) cur = cur.tag;
    else if (ts.isPropertyAccessExpression(cur)) cur = cur.expression;
    else if (ts.isParenthesizedExpression(cur)) cur = cur.expression;
    else if (ts.isConditionalExpression(cur)) {
      const whenTrue = chainRoot(cur.whenTrue, aliases);
      return whenTrue !== null && whenTrue === chainRoot(cur.whenFalse, aliases) ? whenTrue : null;
    } else if (ts.isIdentifier(cur)) {
      return aliases?.get(cur.text) ?? cur.text;
    } else return null;
  }
}

/**
 * Identifiers bound to a registrar, so `maybeIt(…)` is recognised as a case.
 *
 * Collected in a pass before counting, because the binding can sit anywhere
 * relative to its uses. Only `it` and `test` roots are recorded.
 */
function registrarAliases(sf) {
  const aliases = new Map();
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const root = chainRoot(node.initializer, aliases);
      if (root === "it" || root === "test") aliases.set(node.name.text, root);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return aliases;
}

/** The modifiers on a chain: `it.skip(…)` → ["skip"]. */
function chainModifiers(call) {
  const out = [];
  let cur = ts.isCallExpression(call) ? call.expression : call;
  for (;;) {
    if (ts.isCallExpression(cur)) cur = cur.expression;
    else if (ts.isTaggedTemplateExpression(cur)) cur = cur.tag;
    else if (ts.isPropertyAccessExpression(cur)) {
      out.unshift(cur.name.text);
      cur = cur.expression;
    } else return out;
  }
}

/**
 * Assertion and case-registration call sites, counted as CALLS.
 *
 * Counting these by text was wrong twice over at the pinned revision:
 *
 * - `\btest\(` matches the `.test(` of `/re/.test(s)`, because `.` is not a
 *   word character. That invented **870** case sites across 304 files.
 * - the same pattern cannot see `it.skip(…)`, `it.each([…])(…)` or
 *   `test.concurrent(…)`, which are real case sites — **731** of them.
 * - `expect(` matched inside strings, e.g. `SPEC.indexOf("expect(seedOutput)")`,
 *   inventing 18 assertions across four files.
 *
 * A case site is the OUTERMOST call whose chain roots at `it` or `test`, so
 * `it.each([…])("name", fn)` counts once, not twice. `describe` is a suite, not
 * a case, and is counted only for its `.skip` / `.only` modifiers.
 */
export function countCallSites(source, fileName = "f.tsx") {
  const sf = ts.createSourceFile(fileName, String(source), ts.ScriptTarget.Latest, false);
  const counts = { expects: 0, cases: 0, skips: 0, onlys: 0, substringAssertions: 0 };
  const aliases = registrarAliases(sf);
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const e = node.expression;
      if (ts.isIdentifier(e) && e.text === "expect") counts.expects += 1;
      if (ts.isPropertyAccessExpression(e) && SUBSTRING_MATCHERS.has(e.name.text)) {
        counts.substringAssertions += 1;
      }
      const root = chainRoot(e, aliases);
      if (root === "it" || root === "test") {
        counts.cases += 1;
        const mods = chainModifiers(node);
        if (mods.includes("skip") || mods.includes("todo")) counts.skips += 1;
        if (mods.includes("only")) counts.onlys += 1;
        // Descend into the arguments only — never back down the callee chain,
        // which would count `it.each([…])` a second time.
        for (const arg of node.arguments) visit(arg);
        return;
      }
      if (root === "describe") {
        const mods = chainModifiers(node);
        if (mods.includes("skip")) counts.skips += 1;
        if (mods.includes("only")) counts.onlys += 1;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return counts;
}

/** Matchers that assert on a substring or pattern of text rather than a value. */
const SUBSTRING_MATCHERS = new Set(["toContain", "toMatch"]);

/**
 * Is this path a runtime harness — an RLS, billing or DB-security runner?
 *
 * A NAMING CONVENTION, not a classification by role, and the audit's §4.3 says
 * so. Two conventions are in real use and both count, at any depth under
 * `scripts/`:
 *
 *   scripts/run-support-forms-rls-harness.ts        `harness` in the name
 *   scripts/security/run-profiles-db-security.mjs   `db-security`, nested
 *
 * The original rule was root-level-only AND `harness`-only, missing eight real
 * harnesses on either count — five under `scripts/security/`, three at root
 * named `*-db-security.ts`, all invoked by `security-db-local.yml`. See §9.0
 * defect 31. No syntactic signal separates a harness from the other 54
 * package-invoked `scripts/**` runners, so this is a floor for the convention
 * rather than a claim about roles.
 */
export function isRuntimeHarness(path) {
  return (
    path.startsWith("scripts/") && /(harness|db-security)/.test(path) && /\.(ts|mjs)$/.test(path)
  );
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

/** Tokens after which a `/` opens a regex literal rather than dividing. */
const REGEX_MAY_FOLLOW_PUNCTUATOR = new Set([..."(,=:[!&|?{};+-*%<>~^"]);
const REGEX_MAY_FOLLOW_KEYWORD = new Set([
  "return",
  "typeof",
  "instanceof",
  "in",
  "of",
  "new",
  "delete",
  "void",
  "throw",
  "case",
  "do",
  "else",
  "yield",
  "await",
]);

/**
 * JavaScript source with its comments removed; strings and regex literals kept.
 *
 * A runner body is execution evidence one hop from a workflow, and a command
 * commented out inside one — `// bunx playwright test e2e/x.spec.ts` — is the
 * same comment-out defeat commandLinesIn closes for workflow bodies, one hop
 * further in (Codex, #1221 round 4). Strings are kept because a path literal in
 * a runner IS a spec list being executed: an allowlist array, a spawn argument.
 * Every newline survives, so line-oriented readers keep their numbering.
 *
 * A `/` opens a regex literal only where a division cannot stand — after a
 * punctuator or a keyword, or at the start of input — so `/https?:\/\//` is
 * not read as a line comment and `a / b / c` is not read as a regex. An
 * unterminated comment runs to end of input; an unterminated string or regex
 * ends at its line. Template-literal `${}` nesting is not modelled: a backtick
 * inside an interpolation ends the literal early. Deterministic; null-safe.
 */
export function stripJsComments(source) {
  const src = source == null ? "" : String(source);
  const n = src.length;
  let out = "";
  let i = 0;
  let prevToken = ""; // last significant token: a word, a punctuator, or a literal marker
  let inWord = false;

  if (src.startsWith("#!")) {
    const eol = src.indexOf("\n");
    const end = eol === -1 ? n : eol;
    out += src.slice(0, end);
    i = end;
  }

  const regexMayFollow = () =>
    prevToken === "" ||
    REGEX_MAY_FOLLOW_PUNCTUATOR.has(prevToken) ||
    REGEX_MAY_FOLLOW_KEYWORD.has(prevToken);

  while (i < n) {
    const c = src[i];
    const next = src[i + 1];

    if (c === "/" && next === "/") {
      const eol = src.indexOf("\n", i);
      i = eol === -1 ? n : eol;
      continue;
    }
    if (c === "/" && next === "*") {
      const close = src.indexOf("*/", i + 2);
      const end = close === -1 ? n : close + 2;
      out += src.slice(i, end).replace(/[^\n]/g, "");
      i = end;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < n && src[j] !== c) {
        if (src[j] === "\\") j += 1;
        else if (c !== "`" && src[j] === "\n") break;
        j += 1;
      }
      const end = Math.min(j + 1, n);
      out += src.slice(i, end);
      prevToken = "string";
      inWord = false;
      i = end;
      continue;
    }
    if (c === "/" && regexMayFollow()) {
      let j = i + 1;
      let inClass = false;
      let close = -1;
      while (j < n && src[j] !== "\n") {
        const ch = src[j];
        if (ch === "\\") {
          j += 2;
          continue;
        }
        if (ch === "[") inClass = true;
        else if (ch === "]") inClass = false;
        else if (ch === "/" && !inClass) {
          close = j;
          break;
        }
        j += 1;
      }
      if (close !== -1) {
        let end = close + 1;
        while (end < n && /[A-Za-z]/.test(src[end])) end += 1;
        out += src.slice(i, end);
        prevToken = "regex";
        inWord = false;
        i = end;
        continue;
      }
    }

    out += c;
    if (/\s/.test(c)) {
      inWord = false;
    } else if (/[A-Za-z0-9_$]/.test(c)) {
      prevToken = inWord ? prevToken + c : c;
      inWord = true;
    } else {
      prevToken = c;
      inWord = false;
    }
    i += 1;
  }
  return out;
}

/**
 * Everything CI actually executes, as one text corpus.
 *
 * Three sources, in order: workflow COMMAND LINES only; the package scripts
 * those name, expanded; and one hop into repo runner scripts those name. A
 * runner script's body is taken with its comments stripped (stripJsComments):
 * a path literal there is a spec list being executed, not prose, while a
 * commented-out command is the same comment-out defeat commandLinesIn closes
 * for workflow bodies. One hop only: arbitrary depth turns any transitive
 * mention into "executed".
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
    if (typeof bodyText === "string") corpus += ` ${stripJsComments(bodyText)}`;
  }
  return corpus;
}

/**
 * Lane files a corpus executes, by full repo-relative path OR by unambiguous
 * bare basename.
 *
 * Basename resolution is needed because runners resolve against their own
 * root: `bunx playwright test agent-integrations-smoke.spec.ts` runs
 * `e2e/agent-integrations-smoke.spec.ts` via playwright.config's
 * `testDir: "./e2e"`. Requiring the prefix reported that spec as never-run
 * while CI executed it on every matching PR.
 *
 * It is only safe because the corpus is COMMAND LINES ONLY: a basename that
 * appears there is an argument to a runner, not prose in an allowlist or a
 * job summary. The execution-manifest guard once "found" that same spec through
 * a summary `echo` of its full path — the right answer for the wrong reason —
 * and lost it the moment prose stopped counting. This is the right reason.
 *
 * AMBIGUOUS basenames are excluded and must be named in full. Two edge
 * functions both ship a `contract.test.ts`, so a bare token could not say which
 * one ran; resolving it to either would be a fabricated reading.
 *
 * Returns a new Set: `namedPaths` plus every lane file whose basename is unique
 * across `laneFiles` and present in `namedPaths`. Pure; input Set is untouched.
 */
export function resolveBareBasenames({ laneFiles, namedPaths }) {
  const basenameCount = new Map();
  for (const f of laneFiles) {
    const b = f.slice(f.lastIndexOf("/") + 1);
    basenameCount.set(b, (basenameCount.get(b) ?? 0) + 1);
  }
  const out = new Set(namedPaths);
  for (const f of laneFiles) {
    if (out.has(f)) continue;
    const b = f.slice(f.lastIndexOf("/") + 1);
    if (basenameCount.get(b) === 1 && namedPaths.has(b)) out.add(f);
  }
  return out;
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
