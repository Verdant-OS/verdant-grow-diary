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
import { readFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

// Standardised scanner guardrail timeout + slow-test telemetry.
// Replaces the previous per-file vi.setConfig bump. No scanner pattern,
// allowlist, or assertion is changed.
import {
  getCachedScannerFiles,
  installScannerGuardrail,
} from "./support/scannerGuardrailHarness";
installScannerGuardrail({ file: __filename });

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
  // Intentional: the stop-ship checklist *defines* the safety scan and
  // uses SwitchBot as an example of a retired brand to watch for.
  "docs/v0-sentinel-stop-ship-checklist.md",
]);

const PATTERN = /switch[\s_-]?bot/i;

describe("EcoWitt-only sensor direction", () => {
  it("contains zero SwitchBot references outside the explicit allow-list", () => {
    const files = getCachedScannerFiles({
      root: ROOT,
      dirs: SCAN_DIRS,
      exts: SCAN_EXTS,
    });
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
