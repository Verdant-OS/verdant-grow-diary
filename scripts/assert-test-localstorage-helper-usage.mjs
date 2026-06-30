#!/usr/bin/env node
/**
 * assert-test-localstorage-helper-usage.mjs
 *
 * Static safety gate: fails if any test file in src/test/** uses
 * `window.localStorage.<op>(` or bare `localStorage.<op>(` directly
 * for clear/setItem/getItem/removeItem. All such calls must go through
 * src/test/helpers/localStorageTestHelper.ts so that jsdom
 * environments without built-in localStorage (e.g. Windows + Node 26)
 * still work via the in-memory shim installed by src/test/setup.ts.
 *
 * Exemptions:
 *   - src/test/helpers/localStorageTestHelper.ts (the helper itself)
 *
 * Node built-ins only. No third-party deps.
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = process.argv.includes("--root")
  ? process.argv[process.argv.indexOf("--root") + 1]
  : "src/test";

const EXEMPT = new Set([
  "src/test/helpers/localStorageTestHelper.ts",
]);

const PATTERNS = [
  { label: "window.localStorage.clear(", re: /window\.localStorage\.clear\(/ },
  { label: "window.localStorage.setItem(", re: /window\.localStorage\.setItem\(/ },
  { label: "window.localStorage.getItem(", re: /window\.localStorage\.getItem\(/ },
  { label: "window.localStorage.removeItem(", re: /window\.localStorage\.removeItem\(/ },
  { label: "localStorage.clear(", re: /(?<![\w.])localStorage\.clear\(/ },
  { label: "localStorage.setItem(", re: /(?<![\w.])localStorage\.setItem\(/ },
  { label: "localStorage.getItem(", re: /(?<![\w.])localStorage\.getItem\(/ },
  { label: "localStorage.removeItem(", re: /(?<![\w.])localStorage\.removeItem\(/ },
];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

export function scanForDirectLocalStorageUsage(root = ROOT, exempt = EXEMPT) {
  const violations = [];
  for (const file of walk(root)) {
    const normalized = file.replace(/\\/g, "/");
    let isExempt = false;
    for (const e of exempt) {
      if (normalized === e || normalized.endsWith("/" + e) || normalized.endsWith(e)) {
        isExempt = true;
        break;
      }
    }
    if (isExempt) continue;
    const src = fs.readFileSync(file, "utf8");
    const lines = src.split("\n");
    for (let i = 0; i < lines.length; i++) {
      for (const p of PATTERNS) {
        if (p.re.test(lines[i])) {
          violations.push({
            file: normalized,
            line: i + 1,
            pattern: p.label,
            text: lines[i].trim(),
          });
        }
      }
    }
  }
  return violations;
}

function main() {
  const violations = scanForDirectLocalStorageUsage();
  if (violations.length === 0) {
    console.log(
      "[assert-test-localstorage-helper-usage] OK — no direct localStorage usage in src/test/**.",
    );
    process.exit(0);
  }
  console.error(
    `[assert-test-localstorage-helper-usage] FAIL — ${violations.length} direct localStorage call(s) found in src/test/**:`,
  );
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  [${v.pattern}]  ${v.text}`);
  }
  console.error(
    "\nReplace with helpers from src/test/helpers/localStorageTestHelper.ts:",
  );
  console.error(
    "  clearLocalStorageForTest / setLocalStorageItemForTest / getLocalStorageItemForTest / removeLocalStorageItemForTest",
  );
  process.exit(1);
}

const invokedDirectly =
  import.meta.url === `file://${process.argv[1]}` ||
  import.meta.url.endsWith(path.basename(process.argv[1] ?? ""));
if (invokedDirectly) main();
