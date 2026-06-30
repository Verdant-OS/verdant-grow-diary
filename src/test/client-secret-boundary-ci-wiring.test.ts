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

  // --- Proof artifact upload contract (Verdant Client Secret Boundary Proof + Docs v1) ---

  function proofWindow(yml: string): string {
    const idx = yml.indexOf("Client secret boundary proof artifact");
    expect(idx).toBeGreaterThan(-1);
    // Cover the compose step + the immediately-following upload step only.
    return yml.slice(idx, idx + 1200);
  }

  it("ci.yml uploads a trusted proof artifact AFTER the guard succeeds", () => {
    const win = proofWindow(CI_YML);
    expect(win).toMatch(/client-secret-boundary-proof\.txt/);
    expect(win).toMatch(/name:\s*client-secret-boundary-proof-ci/);
    expect(win).toMatch(/actions\/upload-artifact@v4/);
    // No `if: always()` near the proof upload — it must be gated on guard success.
    expect(win).not.toMatch(/if:\s*always\(\)/);
  });

  it("docs-safety.yml uploads a trusted proof artifact AFTER the guard succeeds", () => {
    const win = proofWindow(DOCS_YML);
    expect(win).toMatch(/client-secret-boundary-proof\.txt/);
    expect(win).toMatch(/name:\s*client-secret-boundary-proof-docs-safety/);
    expect(win).toMatch(/actions\/upload-artifact@v4/);
    expect(win).not.toMatch(/if:\s*always\(\)/);
  });

  it("proof artifact heredoc body never contains secrets, tokens, env dumps, or raw logs", () => {
    const banned = [
      /Bearer\s+\S+/i,
      /eyJ[A-Za-z0-9_\-]{6,}\./,
      /SUPABASE_SERVICE_ROLE_KEY\s*=\s*\S+/,
      /\benv\b\s*\|/, // `env |` style dumps
      /raw[_-]?payload/i,
      /::add-mask::/,
    ];
    for (const yml of [CI_YML, DOCS_YML]) {
      const win = proofWindow(yml);
      for (const re of banned) {
        expect(win).not.toMatch(re);
      }
      // Positive signal: the proof says "Secrets printed: no".
      expect(win).toMatch(/Secrets printed:\s*no/);
      expect(win).toMatch(/Raw logs uploaded:\s*no/);
    }
  });

  // --- Artifact verifier wiring (Verdant Client Secret Boundary Artifact Verification v1) ---

  it("package.json wires the artifact verifier script", () => {
    expect(PKG.scripts["check:client-secret-boundary-artifacts"]).toBe(
      "node scripts/check-client-secret-boundary-artifacts.mjs",
    );
    expect(PKG.scripts["test:check-client-secret-boundary-artifacts"]).toBe(
      "node scripts/test-check-client-secret-boundary-artifacts.mjs",
    );
  });

  it("both workflows declare the trusted proof artifact names", () => {
    expect(CI_YML).toMatch(/name:\s*client-secret-boundary-proof-ci\b/);
    expect(DOCS_YML).toMatch(/name:\s*client-secret-boundary-proof-docs-safety\b/);
  });
});
