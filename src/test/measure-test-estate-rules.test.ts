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
import { describe, it, expect } from "vitest";
import {
  buildExecutableCorpus,
  classifyTest,
  commandLinesIn,
  isCommandLine,
  namedPathsIn,
  resolveSpec,
  runtimeImportSpecifiers,
  stripTriggerBlock,
  // Pure rules; the script supplies all I/O.
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
    expect(classifyTest({ source, file: "src/test/x.test.ts", productSet })).toBe("hybrid");
  });

  it("still classifies a genuinely source-scanning test as scan-only", () => {
    const source = `
      import { readFileSync } from "node:fs";
      it("x", () => { expect(readFileSync("f")).toContain("needle"); });
    `;
    expect(classifyTest({ source, file: "src/test/x.test.ts", productSet })).toBe("scan-only");
  });

  it("classifies a test that does no file I/O as behavioural", () => {
    const source = `import { normalize } from "../lib/a"; it("x", () => expect(normalize()).toBe(1));`;
    expect(classifyTest({ source, file: "src/test/x.test.ts", productSet })).toBe("behavioural");
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
