#!/usr/bin/env node
/**
 * Self-test for scripts/assert-test-localstorage-helper-usage.mjs
 *
 * Builds a temp fixture tree and verifies:
 *   - helper-only usage passes
 *   - direct window.localStorage.getItem( fails
 *   - direct bare localStorage.setItem( fails
 *   - the helper file exemption works
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { scanForDirectLocalStorageUsage } from "./assert-test-localstorage-helper-usage.mjs";

function makeTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ls-audit-"));
}

function write(root, rel, body) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, body);
}

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log("  ok -", msg);
  } else {
    failed++;
    console.error("  FAIL -", msg);
  }
}

// --- Case 1: safe helper usage passes ---
{
  const tmp = makeTmp();
  write(
    tmp,
    "src/test/safe.test.ts",
    `import { setLocalStorageItemForTest } from "./helpers/localStorageTestHelper";
setLocalStorageItemForTest("a", "b");
`,
  );
  const v = scanForDirectLocalStorageUsage(
    path.join(tmp, "src/test"),
    new Set(["src/test/helpers/localStorageTestHelper.ts"]),
  );
  assert(v.length === 0, "safe helper usage produces zero violations");
}

// --- Case 2: direct window.localStorage.getItem fails ---
{
  const tmp = makeTmp();
  write(
    tmp,
    "src/test/bad-window.test.ts",
    `const v = window.localStorage.getItem("k");\n`,
  );
  const v = scanForDirectLocalStorageUsage(
    path.join(tmp, "src/test"),
    new Set(),
  );
  assert(
    v.some((x) => x.pattern === "window.localStorage.getItem("),
    "direct window.localStorage.getItem( is flagged",
  );
}

// --- Case 3: bare localStorage.setItem fails ---
{
  const tmp = makeTmp();
  write(
    tmp,
    "src/test/bad-bare.test.ts",
    `function go() { localStorage.setItem("k", "v"); }\n`,
  );
  const v = scanForDirectLocalStorageUsage(
    path.join(tmp, "src/test"),
    new Set(),
  );
  assert(
    v.some((x) => x.pattern === "localStorage.setItem("),
    "bare localStorage.setItem( is flagged",
  );
}

// --- Case 4: helper file exemption works ---
{
  const tmp = makeTmp();
  const rel = "src/test/helpers/localStorageTestHelper.ts";
  write(
    tmp,
    rel,
    `export function x() { return window.localStorage.getItem("k"); }\n`,
  );
  const v = scanForDirectLocalStorageUsage(
    path.join(tmp, "src/test"),
    new Set([rel]),
  );
  assert(v.length === 0, "helper file is exempt from audit");
}

console.log(`\nlocalStorage audit self-test: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
