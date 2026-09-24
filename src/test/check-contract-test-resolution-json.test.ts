/**
 * The package.json half of scripts/check-contract-test-resolution.mjs, exercised
 * end to end: the checker is spawned against a disposable repo layout, so what is
 * pinned is the script's actual exit code, not a re-implementation of its regexes.
 *
 * Three fixtures, one per way a guard can assert on package.json:
 *
 *   bypass     reads the source, JSON.parses something UNRELATED, then asserts a
 *              quoted key with no colon on the raw text. A file-level "contains
 *              JSON.parse" check let this through — Codex reproduced it on #1221
 *              (round 3) and the checker exited 0. The signal has to be tied to
 *              the variable the package read is bound to.
 *   raw        reads the source and never parses anything.
 *   resolved   parses the package and asserts on the object. The only shape that
 *              satisfies AGENTS.md > "Contract tests must assert against resolved
 *              values, not source text".
 *   multiline  the `bypass` shape with the read call wrapped across lines, as
 *              prettier writes any call over 100 columns. The read binding was
 *              matched with `[^\n]*`, so a wrapped read bound nothing and the
 *              checker exited 0 — Codex, #1221 round 4. Matching is now bounded
 *              by the statement, not the line.
 *   multilineResolved  the `resolved` shape wrapped the same way: the widening
 *              must not turn a compliant guard into a false positive.
 *   inline     the `bypass` shape with NO binding: the read is consumed where it
 *              is made, `expect(readFileSync("package.json", "utf8"))`. The round-3
 *              signal looks only at identifiers a read is assigned to, so an
 *              unbound read bound nothing and the checker exited 0 — Codex, #1221
 *              round 9.
 *   inlineMethod  the same with the text method chained onto a read wrapped
 *              across lines, `readFileSync(\n resolve(…),\n "utf8",\n).includes(…)`.
 *   inlineResolvedFence  a compliant guard whose parse sits INSIDE a text method:
 *              `Object.keys(JSON.parse(readFileSync(…)).scripts).includes(…)`. A
 *              statement-bounded regex crosses the read's closing parenthesis and
 *              flags this; the read's own argument list must be matched instead.
 *
 * @source-scan-justified: this file EMBEDS the forbidden shapes as spawn fixtures for the
 * checker itself (see FIXTURES below). It reads no package.json of its own; the strings
 * are written to a disposable repo and the checker is run there. The checker scans
 * src/test textually and cannot tell fixture text from live code, so it is declared
 * here, visibly, rather than dodged by obfuscating the fixtures.
 */
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const CHECKER = resolve(__dirname, "../../scripts/check-contract-test-resolution.mjs");

const FIXTURES: Record<string, string> = {
  bypass: `
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
const PACKAGE = readFileSync("package.json", "utf8");
const UNRELATED = JSON.parse('{"a":1}');
it("x", () => {
  expect(UNRELATED.a).toBe(1);
  expect(PACKAGE).toContain('"test:x"');
});
`,
  raw: `
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
const PACKAGE = readFileSync("package.json", "utf8");
it("x", () => {
  expect(PACKAGE).toContain('"test:x"');
});
`,
  resolved: `
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
const SCRIPTS = JSON.parse(readFileSync("package.json", "utf8")).scripts;
it("x", () => {
  expect(SCRIPTS["test:x"]).toBe("bun run x");
});
`,
  dollar: `
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
const $PKG = readFileSync("package.json", "utf8");
it("x", () => {
  expect($PKG).toContain('"test:x"');
});
`,
  multiline: `
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
const PACKAGE = readFileSync(
  resolve(process.cwd(), "package.json"),
  "utf8",
);
const UNRELATED = JSON.parse('{"a":1}');
it("x", () => {
  expect(UNRELATED.a).toBe(1);
  expect(PACKAGE).toContain('"test:x"');
});
`,
  inline: `
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
const UNRELATED = JSON.parse('{"a":1}');
it("x", () => {
  expect(UNRELATED.a).toBe(1);
  expect(readFileSync("package.json", "utf8")).toContain('"test:x"');
});
`,
  inlineMethod: `
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
const UNRELATED = JSON.parse('{"a":1}');
it("x", () => {
  expect(UNRELATED.a).toBe(1);
  expect(
    readFileSync(
      resolve(process.cwd(), "package.json"),
      "utf8",
    ).includes('"test:x"'),
  ).toBe(true);
});
`,
  inlineResolvedFence: `
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
it("x", () => {
  expect(
    Object.keys(JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8")).scripts).includes("test:x"),
  ).toBe(true);
});
`,
  multilineResolved: `
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
const SCRIPTS = JSON.parse(
  readFileSync(
    resolve(process.cwd(), "package.json"),
    "utf8",
  ),
).scripts;
it("x", () => {
  expect(SCRIPTS["test:x"]).toBe("bun run x");
});
`,
};

/** Run the checker against a repo containing exactly one test file. */
function runChecker(name: keyof typeof FIXTURES) {
  const root = mkdtempSync(join(tmpdir(), "contract-json-"));
  try {
    mkdirSync(join(root, "src", "test"), { recursive: true });
    writeFileSync(join(root, "src", "test", `${name}.test.ts`), FIXTURES[name]);
    const res = spawnSync(process.execPath, [CHECKER], { cwd: root, encoding: "utf8" });
    return { status: res.status, out: `${res.stdout}\n${res.stderr}` };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe("check-contract-test-resolution — package.json guards must assert on the parsed object", () => {
  it("rejects a raw assertion even when an unrelated JSON.parse is present (Codex, #1221 round 3)", () => {
    const { status, out } = runChecker("bypass");
    expect(status, out).toBe(1);
    expect(out).toContain("bypass.test.ts");
    expect(out).toContain("package.json");
  });

  it("rejects a file that reads the source and never parses it", () => {
    const { status, out } = runChecker("raw");
    expect(status, out).toBe(1);
    expect(out).toContain("raw.test.ts");
  });

  it("accepts a guard that parses the package and asserts on the object", () => {
    const { status, out } = runChecker("resolved");
    expect(status, out).toBe(0);
  });

  it("still catches a raw assertion when the bound identifier holds a regex metacharacter", () => {
    // FENCE, green before and after: the identifier is interpolated into a RegExp, and
    // `$` is the one metacharacter the identifier grammar admits. CodeQL (alert 256,
    // high) flagged the escape for handling `$` alone; it is now a complete escape.
    // This pins that the binding is still found and still flagged, whatever the escape.
    const { status, out } = runChecker("dollar");
    expect(status, out).toBe(1);
    expect(out).toContain("$PKG");
  });

  it("rejects the raw assertion when the package read is wrapped across lines (Codex, #1221 round 4)", () => {
    const { status, out } = runChecker("multiline");
    expect(status, out).toBe(1);
    expect(out).toContain("multiline.test.ts");
    expect(out).toContain("PACKAGE");
  });

  it("accepts a resolved guard whose read is wrapped across lines — the widening adds no false positive", () => {
    const { status, out } = runChecker("multilineResolved");
    expect(status, out).toBe(0);
  });

  it("rejects an unbound read consumed directly by expect() (Codex, #1221 round 9)", () => {
    const { status, out } = runChecker("inline");
    expect(status, out).toBe(1);
    expect(out).toContain("inline.test.ts");
  });

  it("rejects a text method chained onto a wrapped, unbound read (Codex, #1221 round 9)", () => {
    const { status, out } = runChecker("inlineMethod");
    expect(status, out).toBe(1);
    expect(out).toContain("inlineMethod.test.ts");
  });

  it("accepts a parsed read nested inside a text method — the read's own parentheses bound the match", () => {
    const { status, out } = runChecker("inlineResolvedFence");
    expect(status, out).toBe(0);
  });
});
