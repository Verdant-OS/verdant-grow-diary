/**
 * EcoWitt-only sensor direction — static safety test.
 *
 * Runs the same scan as `scripts/assert-ecowitt-only-sensor-direction.mjs`
 * inside Vitest so it is enforced by the regular test suite in addition to
 * the dedicated CI workflow.
 *
 * Pure / read-only. No I/O against Supabase. No automation.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

const ROOT = resolve(__dirname, "../..");

const SCAN_DIRS = [
  "src",
  "docs",
  "scripts",
  "fixtures",
  "supabase",
  "templates",
  ".github",
];

const SCAN_EXTS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".cjs",
  ".json",
  ".md",
  ".mdx",
  ".yml",
  ".yaml",
  ".sql",
  ".csv",
  ".html",
  ".sh",
]);

const ALLOWED = new Set([
  "scripts/assert-ecowitt-only-sensor-direction.mjs",
  "docs/ecowitt-only-removal-report.md",
  "docs/ecowitt-only-sensor-direction.md",
  "src/test/ecowitt-only-sensor-direction.test.ts",
  ".github/workflows/ecowitt-only-safety-scan.yml",
]);

const PATTERN = /switch[\s_-]?bot/i;

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const p = join(dir, name);
    let s;
    try {
      s = statSync(p);
    } catch {
      continue;
    }
    if (s.isDirectory()) {
      if (name === "node_modules" || name === ".git" || name === "dist") continue;
      walk(p, out);
    } else {
      const dot = name.lastIndexOf(".");
      const ext = dot >= 0 ? name.slice(dot) : "";
      if (SCAN_EXTS.has(ext)) out.push(p);
    }
  }
  return out;
}

describe("EcoWitt-only sensor direction", () => {
  it("contains zero SwitchBot references outside the explicit allow-list", () => {
    const files = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d)));
    const offenders: string[] = [];
    for (const f of files) {
      const rel = relative(ROOT, f).split(sep).join("/");
      if (ALLOWED.has(rel)) continue;
      const src = readFileSync(f, "utf8");
      if (PATTERN.test(src)) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });

  it("ships the static safety scanner and CI workflow", () => {
    expect(() =>
      readFileSync(
        resolve(ROOT, "scripts/assert-ecowitt-only-sensor-direction.mjs"),
        "utf8",
      ),
    ).not.toThrow();
    expect(() =>
      readFileSync(
        resolve(ROOT, ".github/workflows/ecowitt-only-safety-scan.yml"),
        "utf8",
      ),
    ).not.toThrow();
  });
});
