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
});
