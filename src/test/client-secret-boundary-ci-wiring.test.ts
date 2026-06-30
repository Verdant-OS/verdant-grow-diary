/**
 * Contract test for the Client Secret Boundary CI wiring.
 *
 * Asserts:
 *   - .github/workflows/ci.yml runs `bun run test:client-secret-boundary`.
 *   - The step is not marked continue-on-error.
 *   - The step runs BEFORE the heavy "Full test suite" step.
 *   - .github/workflows/docs-safety.yml also runs the guard.
 *   - package.json defines `test:client-secret-boundary` pointing at
 *     scripts/assert-client-secret-boundary.mjs.
 *   - The guard's EXACT_PATH_EXCEPTIONS set is empty (no broad allowlist).
 *   - The guard's BLOCKED_TERMS still contains both required terms.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "..", "..");
const CI_YML = readFileSync(resolve(ROOT, ".github/workflows/ci.yml"), "utf8");
const DOCS_YML = readFileSync(
  resolve(ROOT, ".github/workflows/docs-safety.yml"),
  "utf8",
);
const PKG = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8"));
const GUARD = readFileSync(
  resolve(ROOT, "scripts/assert-client-secret-boundary.mjs"),
  "utf8",
);

describe("Client Secret Boundary — CI wiring contract", () => {
  it("ci.yml runs the guard via npm script", () => {
    expect(CI_YML).toMatch(/bun run test:client-secret-boundary/);
  });

  it("ci.yml guard step is not continue-on-error", () => {
    // Pull out a window around the guard step and assert no continue-on-error.
    const idx = CI_YML.indexOf("test:client-secret-boundary");
    expect(idx).toBeGreaterThan(-1);
    const window = CI_YML.slice(Math.max(0, idx - 400), idx + 200);
    expect(window).not.toMatch(/continue-on-error\s*:\s*true/);
  });

  it("ci.yml guard step runs before the Full test suite step", () => {
    const guardIdx = CI_YML.indexOf("test:client-secret-boundary");
    const fullSuiteIdx = CI_YML.indexOf("Full test suite");
    expect(guardIdx).toBeGreaterThan(-1);
    expect(fullSuiteIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(fullSuiteIdx);
  });

  it("ci.yml guard runs before any deploy/publish step (if present)", () => {
    const guardIdx = CI_YML.indexOf("test:client-secret-boundary");
    for (const term of ["deploy", "publish", "release"]) {
      const re = new RegExp(`name:\\s*[^\\n]*${term}`, "i");
      const m = CI_YML.match(re);
      if (m && m.index !== undefined) {
        expect(guardIdx).toBeLessThan(m.index);
      }
    }
  });

  it("docs-safety.yml also runs the guard", () => {
    expect(DOCS_YML).toMatch(/bun run test:client-secret-boundary/);
    const idx = DOCS_YML.indexOf("test:client-secret-boundary");
    const window = DOCS_YML.slice(Math.max(0, idx - 400), idx + 200);
    expect(window).not.toMatch(/continue-on-error\s*:\s*true/);
  });

  it("package.json wires the script to the boundary scanner", () => {
    expect(PKG.scripts["test:client-secret-boundary"]).toBe(
      "node scripts/assert-client-secret-boundary.mjs",
    );
  });

  it("guard still blocks both required terms", () => {
    expect(GUARD).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(GUARD).toMatch(/"service_role"/);
  });

  it("guard maintains an empty EXACT_PATH_EXCEPTIONS set (no broad allowlist)", () => {
    // Parse the Set literal body and confirm no string entries.
    const m = GUARD.match(
      /EXACT_PATH_EXCEPTIONS\s*=\s*new Set\(\s*\[([\s\S]*?)\]\s*\)/,
    );
    expect(m).not.toBeNull();
    const body = (m?.[1] ?? "").replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(body).not.toMatch(/["'`]/);
  });

  it("guard scans the four canonical client roots", () => {
    for (const root of ["src/components", "src/pages", "src/hooks", "src/lib"]) {
      expect(GUARD).toContain(`"${root}"`);
    }
  });
});
