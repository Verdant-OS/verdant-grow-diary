/**
 * Regression tests for the parser behind the published test-coverage audit.
 *
 * `scripts/measure-test-estate.mjs` is the evidence source for every headline
 * number in `docs/audits/test-coverage-audit-2026-08-29.md`, and it shipped
 * with no tests at all. Three independent reviewers (Codex, Copilot, Cursor
 * Bugbot) then found six defects in it on PR #1219 — and the audit itself
 * documents three earlier parser regressions found by hand. A parser that
 * decides published figures, exits 0 on every input, and is guarded by nothing
 * will drift silently.
 *
 * Every case below is a defect that actually occurred, pinned in the direction
 * it failed. Both directions matter: a FALSE-LIVE reading (a mention counted as
 * execution) and a FALSE-DEAD reading (a real invocation missed) are equally
 * wrong, and fixing one has twice caused the other.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it, expect } from "vitest";
import {
  buildExecutableCorpus,
  bypassesMockSpecifiers,
  countCallSites,
  factoryMockedSpecifiers,
  mockReplacedSpecifiers,
  readsFileContent,
  reachableClosure,
  readsSrcPath,
  rendersComponents,
  bucketOf,
  classifyTest,
  commandLinesIn,
  isCommandLine,
  isRuntimeHarness,
  namedPathsIn,
  resolveSpec,
  runtimeImportSpecifiers,
  stripJsComments,
  stripTriggerBlock,
  testFileReach,
  testFileRuntimeSpecifiers,
  // Pure rules; the script supplies all I/O.,
  resolveBareBasenames,
} from "../../scripts/lib/testEstateRules.mjs";

const wf = (s: string) => s.replace(/\n {6}/g, "\n");
const pathsOf = (workflow: string, scripts = {}, readRunner = () => null) =>
  namedPathsIn(buildExecutableCorpus({ workflowTexts: [workflow], scripts, readRunner }));

describe("workflow execution — a mention is not an invocation (FALSE-LIVE guards)", () => {
  it("does not read a trigger `paths:` filter as execution", () => {
    // Counting trigger filters reported 32 unrun Playwright specs when the
    // true figure was 25.
    const y = wf(`
      name: x
      on:
        pull_request:
          paths:
            - "e2e/dead.spec.ts"
      jobs:
        a:
          steps:
            - run: echo hi
      `);
    expect(pathsOf(y).has("e2e/dead.spec.ts")).toBe(false);
  });

  it("does not read a paths-filter `with:` allowlist as execution", () => {
    // dorny/paths-filter lists live in a job body, so stripping only the
    // top-level `on:` block does not exclude them.
    const y = wf(`
      jobs:
        changes:
          steps:
            - uses: dorny/paths-filter@v3
              with:
                filters: |
                  irrigation:
                    - "scripts/run-create-feeding-event-rls-harness.ts"
      `);
    expect(pathsOf(y).has("scripts/run-create-feeding-event-rls-harness.ts")).toBe(false);
  });

  it("does not read a shell allowlist array inside a run: block as execution", () => {
    // The real case from irrigation-pgtap-rls-gate.yml. This is inside `run:`,
    // so a naive "only look at run: blocks" filter still admits it.
    const y = wf(`
      jobs:
        a:
          steps:
            - run: |
                ALLOWLIST=(
                  "scripts/run-quicklog-typed-payloads-harness.ts"
                  "package.json"
                )
                for f in "\${ALLOWLIST[@]}"; do echo "$f"; done
      `);
    expect(pathsOf(y).has("scripts/run-quicklog-typed-payloads-harness.ts")).toBe(false);
  });

  it("treats a quoted path as a bare token, not as containing the word `run`", () => {
    // `\brun\b` matches inside `run-create-…`, which would re-admit the
    // allowlist lines this filter exists to exclude.
    expect(isCommandLine('  "scripts/run-create-feeding-event-rls-harness.ts"')).toBe(false);
    expect(isCommandLine("  bun run test:x")).toBe(true);
  });

  it("matches exact paths only — never a directory prefix or glob", () => {
    expect(namedPathsIn("we run e2e/one.spec.ts and also e2e/**").has("e2e/two.spec.ts")).toBe(
      false,
    );
  });
});

describe("workflow execution — a real invocation must not be missed (FALSE-DEAD guards)", () => {
  it("captures arguments of a YAML FOLDED scalar, which is one command", () => {
    // `run: >-` folds newlines to spaces. Treating its lines separately left
    // the spec path on a line with no runner token, so a spec CI runs on every
    // matching PR read as never-run.
    const y = wf(`
      jobs:
        a:
          steps:
            - run: >-
                bunx playwright test
                --project=chromium-mocked
                e2e/core-link-form-census.spec.ts
      `);
    expect(pathsOf(y).has("e2e/core-link-form-census.spec.ts")).toBe(true);
  });

  it("captures arguments across a backslash continuation in a literal scalar", () => {
    const y = wf(`
      jobs:
        a:
          steps:
            - run: |
                psql "$URL" -v ON_ERROR_STOP=1 \\
                  -f supabase/tests/create_feeding_event.sql 2>&1 \\
                  | tee out.log
      `);
    expect(pathsOf(y).has("supabase/tests/create_feeding_event.sql")).toBe(true);
  });

  it("resolves `bun run x`, including flags between the runner and `run`", () => {
    const scripts = { x: "playwright test e2e/via-script.spec.ts" };
    const plain = wf(`
      jobs:
        a:
          steps:
            - run: bun run x
      `);
    const flagged = wf(`
      jobs:
        a:
          steps:
            - run: bun --env-file=.env run x
      `);
    expect(pathsOf(plain, scripts).has("e2e/via-script.spec.ts")).toBe(true);
    expect(pathsOf(flagged, scripts).has("e2e/via-script.spec.ts")).toBe(true);
  });

  it("expands a matrix-interpolated script name to every script sharing the prefix", () => {
    const scripts = {
      "e2e:ga:chromium": "playwright test e2e/ga-chromium.spec.ts",
      "e2e:ga:webkit": "playwright test e2e/ga-webkit.spec.ts",
      unrelated: "playwright test e2e/nope.spec.ts",
    };
    const y = wf(`
      jobs:
        a:
          steps:
            - run: bun run e2e:ga:\${{ matrix.browser }}
      `);
    const p = pathsOf(y, scripts);
    expect(p.has("e2e/ga-chromium.spec.ts")).toBe(true);
    expect(p.has("e2e/ga-webkit.spec.ts")).toBe(true);
    expect(p.has("e2e/nope.spec.ts")).toBe(false);
  });

  it("follows one hop into a runner script, but never into a test file", () => {
    const y = wf(`
      jobs:
        a:
          steps:
            - run: node scripts/run-x.mjs
      `);
    const p = pathsOf(y, {}, ((rel: string) =>
      rel === "scripts/run-x.mjs" ? "spawn('playwright', ['e2e/hopped.spec.ts'])" : null) as never);
    expect(p.has("e2e/hopped.spec.ts")).toBe(true);
  });

  it("strips only the top-level trigger block, keeping job bodies intact", () => {
    const stripped = stripTriggerBlock(
      "on:\n  push:\n    paths: [x]\njobs:\n  a:\n    steps: []\n",
    );
    expect(stripped).not.toContain("paths");
    expect(stripped).toContain("jobs:");
  });

  it("captures a single-line run: with no block scalar", () => {
    const y = wf(`
      jobs:
        a:
          steps:
            - run: deno test --no-lock supabase/functions/x/handler.test.ts
      `);
    expect(pathsOf(y).has("supabase/functions/x/handler.test.ts")).toBe(true);
  });

  it("finds no command lines in a workflow that runs nothing", () => {
    expect(commandLinesIn("jobs:\n  a:\n    steps:\n      - uses: actions/checkout@v4\n")).toEqual(
      [],
    );
  });
});

describe("import classification — relative specifiers are product imports too", () => {
  const productSet = new Set(["src/lib/sensorReadingNormalizationRules.ts", "src/lib/a.ts"]);

  it("resolves a relative specifier to a product module", () => {
    expect(
      resolveSpec("../lib/sensorReadingNormalizationRules", "src/test/x.test.ts", productSet),
    ).toBe("src/lib/sensorReadingNormalizationRules.ts");
  });

  it("resolves an @/ specifier to the same module", () => {
    expect(resolveSpec("@/lib/a", "src/test/x.test.ts", productSet)).toBe("src/lib/a.ts");
  });

  it("classifies a file that reads sources AND imports product code as hybrid, not scan-only", () => {
    // The defect all three reviewers reported. `scan-only` is defined as
    // importing NO product module; a relative import still executes one.
    const source = `
      import { readFileSync } from "node:fs";
      import { normalize } from "../lib/sensorReadingNormalizationRules";
      it("x", () => { readFileSync("m.sql"); expect(normalize(1)).toBe(1); });
    `;
    expect(classifyTest({ source, file: "src/test/x.test.ts", executableSet: productSet })).toBe(
      "hybrid",
    );
  });

  it("still classifies a genuinely source-scanning test as scan-only", () => {
    const source = `
      import { readFileSync } from "node:fs";
      it("x", () => { expect(readFileSync("f")).toContain("needle"); });
    `;
    expect(classifyTest({ source, file: "src/test/x.test.ts", executableSet: productSet })).toBe(
      "scan-only",
    );
  });

  it("classifies a test that does no file I/O as behavioural", () => {
    const source = `import { normalize } from "../lib/a"; it("x", () => expect(normalize()).toBe(1));`;
    expect(classifyTest({ source, file: "src/test/x.test.ts", executableSet: productSet })).toBe(
      "behavioural",
    );
  });
});

describe("classification follows the test's own helpers (defect 25)", () => {
  // Mirrors the real shapes: `routeManifestSyncHarness` both reads route
  // sources AND imports `@/lib/appRouteManifest`, so a test using it does
  // product-touching work that its own text never shows.
  const HELPERS: Record<string, string> = {
    "src/test/helpers/h.ts": `
      import { readFileSync } from "node:fs";
      import { APP_ROUTES } from "@/lib/a";
      export const scan = () => readFileSync("src/routes/x.tsx", "utf8") + APP_ROUTES.length;
    `,
    "src/test/helpers/reader.ts": `
      import { readFileSync } from "node:fs";
      export const read = () => readFileSync("m.sql", "utf8");
    `,
    "src/test/helpers/chain.ts": `export { read } from "./reader";`,
  };
  const productSet = new Set(["src/lib/a.ts"]);
  const helperSet = new Set(Object.keys(HELPERS));
  const sourceOf = (f: string) => HELPERS[f] ?? "";
  const file = "src/test/x.test.ts";

  it("counts file I/O performed inside a helper", () => {
    const source = `
      import { read } from "./helpers/reader";
      it("x", () => expect(read()).toContain("needle"));
    `;
    // Reads nothing itself: without the helper edge this is "behavioural".
    expect(readsFileContent(source, file)).toBe(false);
    expect(
      testFileReach({ source, file, executableSet: productSet, helperSet, sourceOf }).scans,
    ).toBe(true);
  });

  it("counts a product import reached only through a helper, so scan-only becomes hybrid", () => {
    const source = `
      import { readFileSync } from "node:fs";
      import { scan } from "./helpers/h";
      it("x", () => expect(readFileSync("f")).toContain(scan()));
    `;
    const args = { source, file, executableSet: productSet, helperSet, sourceOf };
    expect(testFileReach(args).importsProduct).toBe(true);
    expect(classifyTest(args)).toBe("hybrid");
    // The defect, pinned: with no helperSet the identical file reads scan-only.
    expect(classifyTest({ source, file, executableSet: productSet })).toBe("scan-only");
  });

  it("walks helpers transitively, not one level deep", () => {
    const source = `
      import { read } from "./helpers/chain";
      it("x", () => expect(read()).toContain("needle"));
    `;
    // chain.ts re-exports reader.ts; the I/O is two edges out.
    expect(
      testFileReach({ source, file, executableSet: productSet, helperSet, sourceOf }).scans,
    ).toBe(true);
  });

  it("does not walk a helper the test has factory-mocked away", () => {
    const source = `
      vi.mock("./helpers/h", () => ({ scan: () => "stub" }));
      import { scan } from "./helpers/h";
      it("x", () => expect(scan()).toBe("stub"));
    `;
    const reach = testFileReach({ source, file, executableSet: productSet, helperSet, sourceOf });
    expect(reach.scans).toBe(false);
    expect(reach.importsProduct).toBe(false);
  });

  it("counts a case registered through a runtime-selected registrar", () => {
    // 21 real sites in action-queue-safety.test.ts use the parenthesised form
    // and 3 in ecowitt-windows-testbench-static-safety.test.ts use the alias.
    const paren = `(HAS_TABLE ? it : it.skip)("a", () => {}); (HAS_TABLE ? it : it.skip)("b", () => {});`;
    const alias = `const maybeIt = pwsh ? it : it.skip; maybeIt("a", () => {}); maybeIt("b", () => {});`;
    expect(countCallSites(paren, "f.ts").cases).toBe(2);
    expect(countCallSites(alias, "f.ts").cases).toBe(2);
  });

  it("does not count a runtime-selected registrar as a `.skip`", () => {
    // Which branch runs is decided at runtime, so the case is registered but
    // its skip state is not statically knowable. Counting it would inflate a
    // figure that means "statically declared skip".
    const source = `(HAS_TABLE ? it : it.skip)("a", () => {});`;
    expect(countCallSites(source, "f.ts").skips).toBe(0);
    // The plain form still counts, so this narrowing did not blind the counter.
    expect(countCallSites(`it.skip("a", () => {});`, "f.ts").skips).toBe(1);
  });

  it("does not treat a conditional over non-registrars as a case", () => {
    const source = `const pick = cond ? renderA : renderB; pick("x", () => {});`;
    expect(countCallSites(source, "f.ts").cases).toBe(0);
  });

  it("maps a reach summary onto the three buckets", () => {
    expect(bucketOf({ scans: false, renders: false, importsProduct: true })).toBe("behavioural");
    expect(bucketOf({ scans: true, renders: false, importsProduct: false })).toBe("scan-only");
    expect(bucketOf({ scans: true, renders: false, importsProduct: true })).toBe("hybrid");
    expect(bucketOf({ scans: true, renders: true, importsProduct: false })).toBe("hybrid");
  });
});

describe("the runtime-harness lane is a naming convention, matched at any depth (defect 31)", () => {
  it("matches the root `*-harness` convention", () => {
    expect(isRuntimeHarness("scripts/run-billing-rls-harness.ts")).toBe(true);
    expect(isRuntimeHarness("scripts/run-support-forms-rls-harness.ts")).toBe(true);
  });

  it("matches the nested `db-security` convention", () => {
    // Five real files live here; the old root-level-only rule missed all of them.
    expect(isRuntimeHarness("scripts/security/run-profiles-db-security.mjs")).toBe(true);
    expect(isRuntimeHarness("scripts/security/run-bridge-tokens-db-security.mjs")).toBe(true);
  });

  it("matches a root `db-security` runner that has no `harness` in its name", () => {
    // Three real files; the old `harness`-only rule missed these even at root.
    expect(isRuntimeHarness("scripts/run-pgmq-email-wrapper-grants-db-security.ts")).toBe(true);
  });

  it("does not sweep in other package-invoked scripts", () => {
    // 54 such runners exist and are overwhelmingly not harnesses. The lane is a
    // stated convention, so the predicate must stay narrow rather than guess.
    expect(isRuntimeHarness("scripts/run-vitest-batches.mjs")).toBe(false);
    expect(isRuntimeHarness("scripts/vitest-controlled/cli.mjs")).toBe(false);
    expect(isRuntimeHarness("scripts/security/static-client-secret-scan.mjs")).toBe(false);
  });

  it("requires an executable extension and the scripts/ root", () => {
    expect(isRuntimeHarness("scripts/run-billing-rls-harness.sh")).toBe(false);
    expect(isRuntimeHarness("src/lib/harnessRules.ts")).toBe(false);
    expect(isRuntimeHarness("docs/run-billing-rls-harness.ts")).toBe(false);
  });
});

describe("executable modules outside src/ still execute product code (defect 28)", () => {
  // `executableSet` is wider than the reachability denominator on purpose: a
  // module under supabase/functions/ is product code that is not in src/.
  const executableSet = new Set([
    "src/lib/a.ts",
    "scripts/lib/testEstateRules.mjs",
    "supabase/functions/_shared/lib/creditRules.ts",
  ]);
  const file = "src/test/x.test.ts";

  // A fence, not a regression: an explicit-extension path already matched the
  // bare candidate. It pins that the wider set is reachable by a real specifier.
  it("resolves a relative .mjs path under scripts/", () => {
    expect(resolveSpec("../../scripts/lib/testEstateRules.mjs", file, executableSet)).toBe(
      "scripts/lib/testEstateRules.mjs",
    );
  });

  it("classifies a scanner that imports a scripts/ module as hybrid, not scan-only", () => {
    const source = `
      import { readFileSync } from "node:fs";
      import { countCallSites } from "../../scripts/lib/testEstateRules.mjs";
      it("x", () => { expect(readFileSync("f")).toContain(countCallSites("")); });
    `;
    expect(classifyTest({ source, file, executableSet })).toBe("hybrid");
    // The defect, pinned: with a src/-only set the identical file reads scan-only.
    expect(classifyTest({ source, file, executableSet: new Set(["src/lib/a.ts"]) })).toBe(
      "scan-only",
    );
  });

  it("classifies a scanner that imports an edge-function module as hybrid", () => {
    const source = `
      import { readFileSync } from "node:fs";
      import { grant } from "../../supabase/functions/_shared/lib/creditRules";
      it("x", () => { expect(readFileSync("f")).toContain(grant()); });
    `;
    expect(classifyTest({ source, file, executableSet })).toBe("hybrid");
  });
});

describe("import graph — `import type` is erased and creates no runtime edge", () => {
  it("excludes a top-level `import type` statement", () => {
    expect(runtimeImportSpecifiers(`import type { A } from "./a";`)).toEqual([]);
  });

  it("excludes `export type ... from`", () => {
    expect(runtimeImportSpecifiers(`export type { A } from "./a";`)).toEqual([]);
  });

  it("excludes a clause whose every named specifier is type-only", () => {
    expect(runtimeImportSpecifiers(`import { type A, type B } from "./a";`)).toEqual([]);
  });

  it("KEEPS a mixed clause, which is not erased", () => {
    expect(runtimeImportSpecifiers(`import { type A, b } from "./a";`)).toEqual(["./a"]);
  });

  it("finds a multiline default-plus-named import (regex matching missed it entirely)", () => {
    const src = [
      "import CoachAiDoctorContextPanel, {",
      "  helperA,",
      "  helperB,",
      "} from '@/components/CoachAiDoctorContextPanel';",
    ].join("\n");
    expect(runtimeImportSpecifiers(src)).toEqual(["@/components/CoachAiDoctorContextPanel"]);
  });

  it("ignores a specifier that appears only in a comment", () => {
    expect(runtimeImportSpecifiers("// import { fake } from './commented';")).toEqual([]);
    expect(runtimeImportSpecifiers("/* import { f } from './block'; */")).toEqual([]);
  });

  it("ignores a specifier that appears only inside a template literal fixture", () => {
    expect(runtimeImportSpecifiers("const t = `import { f } from './tpl';`;")).toEqual([]);
  });

  it("keeps a bare side-effect import", () => {
    expect(runtimeImportSpecifiers(`import "./side-effect";`)).toEqual(["./side-effect"]);
  });

  it("keeps a namespace import", () => {
    expect(runtimeImportSpecifiers(`import * as ns from "./ns";`)).toEqual(["./ns"]);
  });

  it("keeps ordinary value imports, dynamic imports and require", () => {
    expect(runtimeImportSpecifiers(`import { a } from "./a";`)).toEqual(["./a"]);
    expect(runtimeImportSpecifiers(`const x = await import("./b");`)).toContain("./b");
    expect(runtimeImportSpecifiers(`const y = require("./c");`)).toContain("./c");
  });

  it("excludes `import()` in a TYPE position, which the transpiler erases", () => {
    expect(runtimeImportSpecifiers(`type J = import("./types").Json;`)).toEqual([]);
    expect(runtimeImportSpecifiers(`let x: typeof import("./mod");`)).toEqual([]);
  });

  it("unwraps `as`, `satisfies` and parentheses around a dynamic specifier", () => {
    expect(runtimeImportSpecifiers(`await import("./raw?raw" as string);`)).toEqual(["./raw?raw"]);
    expect(runtimeImportSpecifiers(`await import(("./parens"));`)).toEqual(["./parens"]);
  });
});

describe("import graph — vitest registry calls that really load the module", () => {
  it("counts `vi.importActual` and `vi.importMock`, which load the real module", () => {
    expect(runtimeImportSpecifiers(`await vi.importActual("./real");`)).toEqual(["./real"]);
    expect(runtimeImportSpecifiers(`await vi.importMock("./real");`)).toEqual(["./real"]);
  });

  it("counts a bare `vi.mock` / `vi.doMock`, which auto-mocks by loading the module", () => {
    expect(runtimeImportSpecifiers(`vi.mock("./auto");`)).toEqual(["./auto"]);
    expect(runtimeImportSpecifiers(`vi.doMock("./auto");`)).toEqual(["./auto"]);
  });

  it("does NOT count `vi.mock` with a factory — the real module never loads", () => {
    expect(runtimeImportSpecifiers(`vi.mock("./replaced", () => ({ a: 1 }));`)).toEqual([]);
    expect(runtimeImportSpecifiers(`vi.doMock("./replaced", () => ({}));`)).toEqual([]);
  });

  it("does NOT count `vi.unmock` / `vi.doUnmock`, which load nothing", () => {
    expect(runtimeImportSpecifiers(`vi.unmock("./x"); vi.doUnmock("./x");`)).toEqual([]);
  });

  it("keeps the real module of the spread-actual mock pattern", () => {
    const src = [
      'vi.mock("@/lib/alerts", async () => {',
      '  const actual = await vi.importActual<typeof import("@/lib/alerts")>("@/lib/alerts");',
      "  return { ...actual, listAlerts: vi.fn() };",
      "});",
    ].join("\n");
    // The factory form is not an edge; the importActual inside it is.
    expect(runtimeImportSpecifiers(src)).toEqual(["@/lib/alerts"]);
  });

  it("ignores a same-named method on some other object", () => {
    expect(runtimeImportSpecifiers(`registry.mock("./not-vitest");`)).toEqual([]);
  });
});

describe("reachability seeding — Vitest mock semantics, applied once", () => {
  // The script used to regex-subtract every `vi.mock` path AFTER the parser had
  // classified edges, which contradicted the parser in both directions and was
  // invisible because nothing tested the composition. It lives here now.
  const spreadActual = [
    'import { listAlerts } from "@/lib/alerts";',
    'vi.mock("@/lib/alerts", async () => {',
    '  const actual = await vi.importActual<typeof import("@/lib/alerts")>("@/lib/alerts");',
    "  return { ...actual, listAlerts: vi.fn() };",
    "});",
  ].join("\n");

  it("keeps a factory-mocked module the same file loads via importActual", () => {
    // The regex-subtract form dropped this — the repo's most common mock shape.
    // The list is not deduped (nor is `runtimeImportSpecifiers`); callers set it.
    expect([...new Set(testFileRuntimeSpecifiers(spreadActual))]).toEqual(["@/lib/alerts"]);
  });

  it("drops a module replaced wholesale, static import and all", () => {
    const src = [
      'import { thing } from "@/lib/replaced";',
      'vi.mock("@/lib/replaced", () => ({ thing: vi.fn() }));',
    ].join("\n");
    // `vi.mock` is hoisted, so the static import resolves to the factory.
    expect(testFileRuntimeSpecifiers(src)).toEqual([]);
  });

  it("keeps a bare `vi.mock`, which auto-mocks by loading the real module", () => {
    expect(testFileRuntimeSpecifiers(`vi.mock("@/lib/auto");`)).toEqual(["@/lib/auto"]);
  });

  // `doMock` is not hoisted, so it cannot replace what a static import already
  // loaded. It CAN replace a module dynamically imported after it; modelling
  // that needs statement ordering, which these rules do not do — see §9.0
  // defect 22, measured to move no module.
  it("keeps a static import that `vi.doMock` cannot retroactively replace", () => {
    const src = [
      'import { thing } from "@/lib/later";',
      'vi.doMock("@/lib/later", () => ({ thing: vi.fn() }));',
    ].join("\n");
    // `vi.doMock` is not hoisted; the static import already loaded the real one.
    expect(testFileRuntimeSpecifiers(src)).toEqual(["@/lib/later"]);
  });

  it("keeps a module the factory loads through its `importOriginal` callback", () => {
    // Vitest passes the factory a loader for the original module. 19 test files
    // at the pinned revision use this shape; recognising only `vi.importActual`
    // dropped a real edge in every one of them.
    const src = [
      'import { trackFunnelEvent } from "@/lib/funnelAnalytics";',
      'vi.mock("@/lib/funnelAnalytics", async (importOriginal) => {',
      '  const real = await importOriginal<typeof import("@/lib/funnelAnalytics")>();',
      "  return { ...real, trackFunnelEvent: spies.track };",
      "});",
    ].join("\n");
    expect([...new Set(testFileRuntimeSpecifiers(src))]).toEqual(["@/lib/funnelAnalytics"]);
  });

  it("matches the callback by BINDING, not by the name `importOriginal`", () => {
    const src = [
      'import { a } from "@/lib/renamed";',
      'vi.mock("@/lib/renamed", async (loadReal) => ({ ...(await loadReal()), a: vi.fn() }));',
    ].join("\n");
    expect([...new Set(testFileRuntimeSpecifiers(src))]).toEqual(["@/lib/renamed"]);
  });

  it("does NOT count a factory parameter that is declared and never called", () => {
    const src = [
      'import { x } from "@/lib/never";',
      'vi.mock("@/lib/never", async (importOriginal) => ({ x: vi.fn() }));',
    ].join("\n");
    expect(testFileRuntimeSpecifiers(src)).toEqual([]);
  });

  it("emits a bypassed module even with no value import of it", () => {
    // The bypass is an edge in its own right. A file that mocks with
    // `importOriginal` and imports the module only as a type — or not at all —
    // still loads the real module; filtering alone would emit nothing.
    const typeOnly = [
      'import type { Alert } from "@/lib/alerts";',
      'vi.mock("@/lib/alerts", async (importOriginal) => ({ ...(await importOriginal()) }));',
    ].join("\n");
    expect([...new Set(testFileRuntimeSpecifiers(typeOnly))]).toEqual(["@/lib/alerts"]);

    const mockOnly = 'vi.mock("@/lib/alerts", async (o) => ({ ...(await o()) }));';
    expect([...new Set(testFileRuntimeSpecifiers(mockOnly))]).toEqual(["@/lib/alerts"]);
  });

  it("DOCUMENTS the known limit: a dynamic import after `vi.doMock` still counts", () => {
    // Not an endorsement — a pin on a limitation the audit states at §9.0
    // defect 22. `doMock` DOES replace a module imported after it, so the real
    // answer here is []. Modelling that needs statement ordering, which these
    // rules do not do. Measured: 12 files use the pattern and an over-blocking
    // ceiling moves no module, so no published figure depends on this.
    // If ordering is ever modelled, this expectation should flip to [].
    const src = [
      'vi.doMock("@/lib/growRepo", () => ({ fetchGrow: vi.fn() }));',
      'const repo = await import("@/lib/growRepo");',
    ].join("\n");
    expect([...new Set(testFileRuntimeSpecifiers(src))]).toEqual(["@/lib/growRepo"]);
  });

  it("separates the two extraction steps", () => {
    expect(factoryMockedSpecifiers(spreadActual)).toEqual(["@/lib/alerts"]);
    expect(bypassesMockSpecifiers(spreadActual)).toEqual(["@/lib/alerts"]);
    expect(factoryMockedSpecifiers(`vi.mock("@/lib/auto");`)).toEqual([]);
    expect(factoryMockedSpecifiers(`vi.doMock("@/x", () => ({}));`)).toEqual([]);
  });
});

describe("call-site counting — calls, not text", () => {
  it("does NOT read `/re/.test(x)` as a `test(` case site", () => {
    // 870 phantom case sites across 304 files came from exactly this: `\b`
    // matches between `.` and `t`, so every regex `.test(` counted as a case.
    const src = ["const ok = /pat/.test(txt);", "expect(ok).toBe(true);"].join("\n");
    expect(countCallSites(src).cases).toBe(0);
  });

  it("does NOT read `expect(` inside a string literal as an assertion", () => {
    expect(countCallSites(`const s = SPEC.indexOf("expect(seedOutput)");`).expects).toBe(0);
  });

  it("counts `it.skip`, `it.each` and `test.concurrent`, which text matching missed", () => {
    const src = [
      'it.skip("a", () => {});',
      'it.each([1, 2])("b %i", () => {});',
      'test.concurrent("c", () => {});',
    ].join("\n");
    // 731 real case sites in these shapes were invisible to `\bit\(|\btest\(`.
    expect(countCallSites(src).cases).toBe(3);
  });

  it("counts `it.each([…])(…)` once, not twice", () => {
    expect(countCallSites(`it.each([1])("a %i", () => {});`).cases).toBe(1);
  });

  it("counts a nested `it` inside another case's callback", () => {
    const src = 'describe("s", () => { it("a", () => { expect(1).toBe(1); }); });';
    const n = countCallSites(src);
    expect([n.cases, n.expects]).toEqual([1, 1]);
  });

  it("attributes skip/only to it, test and describe alike", () => {
    const n = countCallSites(
      ['it.skip("a", () => {});', 'describe.skip("b", () => {});'].join("\n"),
    );
    expect([n.skips, n.onlys]).toEqual([2, 0]);
  });

  it("counts toContain/toMatch as calls, not occurrences", () => {
    const src = ['expect(a).toContain("x");', 'const s = "toMatch(";'].join("\n");
    expect(countCallSites(src).substringAssertions).toBe(1);
  });
});

describe("file-content classification — a declaration is not a read", () => {
  it("does NOT count a type member named like a reader", () => {
    // `run-skill-driver-probe.test.ts` was bucketed scan-only on this alone.
    expect(readsFileContent("type FsLike = { readdirSync: (p: string) => string[] };")).toBe(false);
  });

  it("does NOT count an injected fake's property", () => {
    // `subscriber-growth-backend-remote-verification.test.ts`, likewise.
    expect(readsFileContent('const fs = { readFileSync: (f: string) => "x" };')).toBe(false);
  });

  it("does NOT count a metadata-only call, which reads no content", () => {
    // `existsSync`/`statSync` are filesystem I/O but read no bytes. This gate
    // feeds the scan-only bucket, which §3.1 defines as asserting against source
    // TEXT — an absence check has no text to assert on. §9.0 defect 23.
    expect(readsFileContent("expect(existsSync(p)).toBe(false);")).toBe(false);
    expect(readsFileContent("const s = statSync(p);")).toBe(false);
  });

  it("counts a real call, bare or as a property", () => {
    expect(readsFileContent('const t = readFileSync(p, "utf8");')).toBe(true);
    expect(readsFileContent('const t = fs.readFileSync(p, "utf8");')).toBe(true);
  });

  it("takes the src/ path from the reader call's OWN argument", () => {
    expect(readsSrcPath('const t = readFileSync("src/lib/a.ts", "utf8");')).toBe(true);
    expect(readsSrcPath('const t = readFileSync("docs/a.md", "utf8");')).toBe(false);
    expect(readsSrcPath("// reads src/lib/a.ts one day")).toBe(false);
  });

  it("does NOT count a `src/` string that is only asserted on", () => {
    // `architecture-docs.test.ts` reads docs/architecture.md, then asserts the
    // document mentions two `src/test/…` paths. The src/ is in the assertion.
    const src = [
      'const DOC_PATH = "docs/architecture.md";',
      'const content = readFileSync(DOC_PATH, "utf8");',
      'expect(content).toContain("src/test/ai-coach-security.test.ts");',
    ].join("\n");
    expect(readsSrcPath(src)).toBe(false);
  });

  it("follows a const binding and path.join segments into the read", () => {
    expect(readsSrcPath('const P = "src/lib/a.ts";\nreadFileSync(P, "utf8");')).toBe(true);
    expect(readsSrcPath('readFileSync(path.join(ROOT, "src", "lib", "a.ts"), "utf8");')).toBe(true);
  });
});

describe("render classification — a title is not a render call", () => {
  it("does NOT count `render (` inside a test title", () => {
    // `alerts-foundation.test.ts` has exactly this and never calls render.
    const title =
      'it("does not auto-save alerts on render (no top-level saveAlert call)", () => {});';
    expect(rendersComponents(title)).toBe(false);
  });

  it("counts a real render call, bare or as a property", () => {
    expect(rendersComponents("render(<App />);")).toBe(true);
    expect(rendersComponents("testUtils.render(<App />);")).toBe(true);
  });
});

describe("reachability traversal — a mock blocks at every depth", () => {
  // A component graph: the test seeds the page, which imports the component,
  // which imports the hook. Mocking the hook must stop the walk at the component.
  const graph: Record<string, string[]> = {
    "src/pages/PlantDetail.tsx": ["src/components/ReadinessPanel.tsx"],
    "src/components/ReadinessPanel.tsx": ["src/hooks/useLogAiDoctorReadinessToDiary.ts"],
    "src/hooks/useLogAiDoctorReadinessToDiary.ts": ["src/lib/diaryApi.ts"],
    "src/lib/diaryApi.ts": [],
  };
  const depsOf = (f: string) => graph[f] ?? [];
  const seeds = ["src/pages/PlantDetail.tsx"];

  it("does NOT re-add a module the test replaced, reached only through a component", () => {
    // This is the whole defect: blocking at the seeds and then walking
    // context-free put the mocked hook straight back into the reached set.
    const reached = reachableClosure({
      seeds,
      blocked: new Set(["src/hooks/useLogAiDoctorReadinessToDiary.ts"]),
      depsOf,
    });
    expect([...reached].sort()).toEqual([
      "src/components/ReadinessPanel.tsx",
      "src/pages/PlantDetail.tsx",
    ]);
  });

  it("does not traverse THROUGH a blocked module to what lies beyond it", () => {
    const reached = reachableClosure({
      seeds,
      blocked: new Set(["src/hooks/useLogAiDoctorReadinessToDiary.ts"]),
      depsOf,
    });
    expect(reached.has("src/lib/diaryApi.ts")).toBe(false);
  });

  it("reaches everything when the test blocks nothing", () => {
    expect(reachableClosure({ seeds, depsOf }).size).toBe(4);
  });

  it("keeps a module blocked by ONE test but genuinely loaded by another", () => {
    // Per-test walks are unioned, so a module stays reached when any test
    // loads it for real. That is the question the published figure answers.
    const blocked = new Set(["src/hooks/useLogAiDoctorReadinessToDiary.ts"]);
    const union = new Set([
      ...reachableClosure({ seeds, blocked, depsOf }),
      ...reachableClosure({ seeds, depsOf }),
    ]);
    expect(union.has("src/hooks/useLogAiDoctorReadinessToDiary.ts")).toBe(true);
  });

  it("terminates on a cycle", () => {
    const cyclic = (f: string) => ({ a: ["b"], b: ["c"], c: ["a"] })[f as "a" | "b" | "c"] ?? [];
    expect(reachableClosure({ seeds: ["a"], depsOf: cyclic }).size).toBe(3);
  });

  it("gives the seeding and traversal stages ONE definition of replaced", () => {
    const src = [
      'vi.mock("@/lib/replaced", () => ({}));',
      'vi.mock("@/lib/spread", async (o) => ({ ...(await o()) }));',
      'vi.mock("@/lib/auto");',
    ].join("\n");
    // Only the wholesale replacement blocks; the importOriginal spread and the
    // bare auto-mock both load the real module.
    expect(mockReplacedSpecifiers(src)).toEqual(["@/lib/replaced"]);
  });
});

describe("product-module set — declaration files carry no runtime edge", () => {
  // The script's own filter, restated here so a change to it fails a test
  // rather than silently moving the reachability denominator.
  const IS_TEST = /\.(test|spec)\.(ts|tsx)$/;
  const isProductModule = (f: string) =>
    !IS_TEST.test(f) && !f.startsWith("src/test/") && !f.endsWith(".d.ts");

  it("excludes `.d.ts`, which the transpiler erases", () => {
    expect(isProductModule("src/types/global-jsx.d.ts")).toBe(false);
    expect(isProductModule("src/types/mjs-modules.d.ts")).toBe(false);
  });

  it("keeps ordinary source and still excludes tests", () => {
    expect(isProductModule("src/lib/alerts.ts")).toBe(true);
    expect(isProductModule("src/components/Thing.tsx")).toBe(true);
    expect(isProductModule("src/test/alerts-foundation.test.ts")).toBe(false);
    expect(isProductModule("src/lib/alerts.test.ts")).toBe(false);
  });

  it("does not mistake a name merely containing `.d.ts` for a declaration", () => {
    expect(isProductModule("src/lib/a.d.tsx")).toBe(true);
  });
});

describe("reproducer CLI — `--rev` never reaches a shell", () => {
  const SCRIPT = path.resolve(__dirname, "../../scripts/measure-test-estate.mjs");

  const run = (rev: string) =>
    spawnSync(process.execPath, [SCRIPT, "--rev", rev], {
      cwd: path.resolve(__dirname, "../.."),
      encoding: "utf8",
      timeout: 30_000,
    });

  it("does not execute a command substitution passed as a revision", () => {
    // CodeQL alert 255: the argument used to be interpolated into an
    // `execSync` string, where double quotes do NOT neutralise `$(…)`.
    const probe = path.join(mkdtempSync(path.join(tmpdir(), "estate-rev-")), "pwned");
    const result = run(`$(touch ${probe})HEAD`);

    expect(existsSync(probe)).toBe(false);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("cannot resolve");
  });

  // A fence, not a regression: git already rejects this shape, so the test is
  // green with or without the leading-dash guard. It pins the guard so a later
  // change to how the argument is passed cannot quietly let a flag through.
  it("rejects a revision that would be read as a git flag", () => {
    const result = run("--upload-pack=touch");
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("cannot resolve");
  });
});

describe("resolveBareBasenames — a runner argument names a lane file by basename", () => {
  // `bunx playwright test agent-integrations-smoke.spec.ts` runs
  // e2e/agent-integrations-smoke.spec.ts via testDir. Exact-path matching alone
  // called that spec never-run while CI executed it on every matching PR.
  it("resolves an unambiguous bare basename to its one lane file", () => {
    const out = resolveBareBasenames({
      laneFiles: ["e2e/a.spec.ts", "e2e/b.spec.ts"],
      namedPaths: new Set(["a.spec.ts"]),
    });
    expect(out.has("e2e/a.spec.ts")).toBe(true);
    expect(out.has("e2e/b.spec.ts")).toBe(false);
  });

  it("refuses an ambiguous basename — two lane files, one token, no fabricated reading", () => {
    const out = resolveBareBasenames({
      laneFiles: ["supabase/functions/x/contract.test.ts", "supabase/functions/y/contract.test.ts"],
      namedPaths: new Set(["contract.test.ts"]),
    });
    expect(out.has("supabase/functions/x/contract.test.ts")).toBe(false);
    expect(out.has("supabase/functions/y/contract.test.ts")).toBe(false);
  });

  it("keeps every full path already named, and never mutates its input", () => {
    const named = new Set(["e2e/full.spec.ts", "stray.spec.ts"]);
    const out = resolveBareBasenames({ laneFiles: ["e2e/full.spec.ts"], namedPaths: named });
    expect(out.has("e2e/full.spec.ts")).toBe(true);
    expect(out.has("stray.spec.ts")).toBe(true); // passthrough — not a lane file, not dropped
    expect(named.size).toBe(2);
    expect(named.has("e2e/full.spec.ts")).toBe(true);
  });

  it("is a bare-token match only — a basename inside a longer path is not one", () => {
    // `e2e/nested/a.spec.ts` named in full must not make bare `a.spec.ts` resolve to a
    // DIFFERENT lane file that happens to share the basename.
    const out = resolveBareBasenames({
      laneFiles: ["e2e/a.spec.ts", "e2e/nested/a.spec.ts"],
      namedPaths: new Set(["e2e/nested/a.spec.ts"]),
    });
    expect(out.has("e2e/nested/a.spec.ts")).toBe(true);
    expect(out.has("e2e/a.spec.ts")).toBe(false);
  });
});

describe("runner bodies — a comment is not an invocation (Codex, #1221 round 4)", () => {
  // The one-hop runner body was appended to the corpus WHOLE, so a runner carrying
  // `// bunx playwright test e2e/dead.spec.ts` marked the spec executed: the same
  // comment-out defeat F1 closed for workflow bodies, one hop further in.
  it("strips line and block comments but keeps strings, template literals and regex literals", () => {
    const src = [
      'const url = "https://example.test/e2e/kept-in-string.spec.ts"; // playwright test e2e/line-comment.spec.ts',
      "/* bunx vitest run src/test/block-comment.test.ts",
      "   spans lines */",
      "const tpl = `bunx playwright test e2e/kept-in-template.spec.ts`;",
      "const re = /https?:\\/\\//; run('e2e/kept-after-regex.spec.ts');",
      "const s = 'it\\'s // not a comment e2e/kept-in-single.spec.ts';",
    ].join("\n");
    const out = stripJsComments(src);
    expect(out).toContain("e2e/kept-in-string.spec.ts");
    expect(out).toContain("e2e/kept-in-template.spec.ts");
    expect(out).toContain("e2e/kept-after-regex.spec.ts");
    expect(out).toContain("e2e/kept-in-single.spec.ts");
    expect(out).not.toContain("e2e/line-comment.spec.ts");
    expect(out).not.toContain("src/test/block-comment.test.ts");
    // Line structure survives, so line-oriented consumers keep their numbering.
    expect(out.split("\n")).toHaveLength(src.split("\n").length);
  });

  it("a command commented out inside a runner does not mark its spec executed", () => {
    const runner = [
      "// bunx playwright test e2e/dead-line.spec.ts",
      "/* bunx playwright test e2e/dead-block.spec.ts */",
      "spawn('bunx', ['playwright', 'test', 'e2e/live.spec.ts']);",
    ].join("\n");
    const paths = namedPathsIn(
      buildExecutableCorpus({
        workflowTexts: ["jobs:\n  a:\n    steps:\n      - run: node scripts/run-x.mjs\n"],
        readRunner: (rel: string) => (rel === "scripts/run-x.mjs" ? runner : null),
      }),
    );
    expect(paths.has("e2e/live.spec.ts")).toBe(true);
    expect(paths.has("e2e/dead-line.spec.ts")).toBe(false);
    expect(paths.has("e2e/dead-block.spec.ts")).toBe(false);
  });

  it("is idempotent, deterministic, and null-safe", () => {
    const src = "a(); // c\n/* d */ b();";
    expect(stripJsComments(stripJsComments(src))).toBe(stripJsComments(src));
    expect(stripJsComments(src)).toBe(stripJsComments(src));
    expect(stripJsComments("")).toBe("");
    expect(stripJsComments(null)).toBe("");
    expect(stripJsComments("/* unterminated")).toBe("");
  });
});
