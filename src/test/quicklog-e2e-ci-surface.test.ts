/**
 * CI surface guardrails for the Quick Log Playwright smoke harness.
 *
 * Ensures:
 *   - no storageState (e2e/.auth/user.json) is committed
 *   - e2e/.auth/ and e2e/results/ are gitignored
 *   - workflow contains no hardcoded credentials
 *   - workflow uploads the smoke artifacts under a stable name
 *   - smoke spec writes the report to a stable, documented path
 *   - package.json exposes the e2e:* scripts
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");

describe("Quick Log Playwright CI surface", () => {
  it("does not commit storageState", () => {
    expect(fs.existsSync(path.join(ROOT, "e2e/.auth/user.json"))).toBe(false);
  });

  it("ignores .auth/ and results/ in e2e/.gitignore", () => {
    const ig = read("e2e/.gitignore");
    expect(ig).toMatch(/^\.auth\/$/m);
    expect(ig).toMatch(/^results\/$/m);
  });

  it("CI workflow exists and references the safe surface", () => {
    const wf = read(".github/workflows/quicklog-smoke.yml");
    expect(wf).toMatch(/workflow_dispatch/);
    expect(wf).toMatch(/playwright install --with-deps chromium|e2e:install:ci/);
    expect(wf).toMatch(/e2e:quicklog-smoke/);
    expect(wf).toMatch(/if:\s*always\(\)/);
    expect(wf).toMatch(/quicklog-smoke-artifacts/);
    expect(wf).toMatch(/e2e\/results\/quicklog-smoke-report\.json/);
  });

  it("CI workflow has no hardcoded credentials, tokens, or service_role", () => {
    const wf = read(".github/workflows/quicklog-smoke.yml");
    expect(wf).not.toMatch(/service_role/i);
    expect(wf).not.toMatch(/password\s*:\s*["'][^"'$]+["']/i);
    expect(wf).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}\./);
    // Email/password must come from GitHub secrets, not literals
    expect(wf).toMatch(/\$\{\{\s*secrets\.E2E_TEST_EMAIL\s*\}\}/);
    expect(wf).toMatch(/\$\{\{\s*secrets\.E2E_TEST_PASSWORD\s*\}\}/);
  });

  it("smoke spec writes report to a stable path", () => {
    const spec = read("e2e/quicklog-smoke.spec.ts");
    expect(spec).toMatch(/e2e\/results/);
    expect(spec).toMatch(/quicklog-smoke-report\.json/);
    expect(spec).toMatch(/Quick Log smoke report:/);
    expect(spec).toMatch(/FAILED step/);
  });

  it("package.json exposes the e2e:* scripts", () => {
    const pkg = JSON.parse(read("package.json")) as {
      scripts: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    for (const s of [
      "e2e:install",
      "e2e:install:ci",
      "e2e:setup",
      "e2e:quicklog-smoke",
      "e2e:quicklog-smoke:headed",
      "e2e:report",
    ]) {
      expect(pkg.scripts[s], `missing script ${s}`).toBeTruthy();
    }
    expect(pkg.devDependencies["@playwright/test"]).toBeTruthy();
  });
});
