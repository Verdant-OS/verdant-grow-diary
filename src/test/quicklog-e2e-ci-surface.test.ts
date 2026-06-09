/**
 * CI surface guardrails for the Quick Log Playwright smoke harness.
 *
 * Ensures:
 *   - no storageState (e2e/.auth/user.json) is committed
 *   - e2e/.auth/ and e2e/results/ are gitignored
 *   - workflow contains no hardcoded credentials or secret echoes
 *   - workflow uploads the exact, expected smoke artifacts under a stable name
 *   - workflow has explicit PR skip / workflow_dispatch fail-fast behavior
 *   - smoke spec writes the report to a stable, documented path
 *   - README documents required vars/secrets, artifact paths/retention, and
 *     troubleshooting guidance
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
    expect(wf).toMatch(/retention-days:\s*30/);
    // Must target the real Lovable sync branch, not main
    expect(wf).toMatch(/branches:\s*\[verdant-grow-diary\]/);
    expect(wf).not.toMatch(/branches:\s*\[main\]/);
  });

  it("CI workflow has no hardcoded credentials, tokens, secret echoes, or pull_request_target", () => {
    const wf = read(".github/workflows/quicklog-smoke.yml");
    expect(wf).not.toMatch(/service_role/i);
    expect(wf).not.toMatch(/password\s*:\s*["'][^"'$]+["']/i);
    expect(wf).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}\./);
    // Must use the safe pull_request event, never pull_request_target
    expect(wf).not.toMatch(/pull_request_target/);
    // No auth bypass language
    expect(wf).not.toMatch(/skipAuth|bypassAuth|AUTH_BYPASS/);
    // Email/password must come from GitHub secrets, not literals
    expect(wf).toMatch(/\$\{\{\s*secrets\.E2E_TEST_EMAIL\s*\}\}/);
    expect(wf).toMatch(/\$\{\{\s*secrets\.E2E_TEST_PASSWORD\s*\}\}/);
    // Must not echo secret values to logs
    expect(wf).not.toMatch(/echo\s+["']?\$\{?\s*E2E_TEST_PASSWORD/);
    expect(wf).not.toMatch(/echo\s+["']?\$\{?\s*E2E_TEST_EMAIL/);
    expect(wf).not.toMatch(
      /echo\s+["']?\$\{\{\s*secrets\.E2E_TEST_(EMAIL|PASSWORD)\s*\}\}/,
    );
  });

  it("CI workflow uploads exactly the expected artifact paths and excludes storageState", () => {
    const wf = read(".github/workflows/quicklog-smoke.yml");
    // Locate the upload step's path: block.
    const uploadMatch = wf.match(
      /name:\s*quicklog-smoke-artifacts[\s\S]*?path:\s*\|\n([\s\S]*?)(?:\n[^\s-]|\n\s*$|$)/,
    );
    expect(uploadMatch, "could not locate quicklog-smoke-artifacts path block").toBeTruthy();
    const pathBlock = uploadMatch![1];
    const paths = pathBlock
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    const expected = [
      "e2e/results/quicklog-smoke-report.json",
      "e2e/results/quicklog-smoke-report.txt",
      "playwright-report/",
      "test-results/",
    ];
    expect(paths).toEqual(expected);
    // Must never publish storageState as an artifact.
    expect(pathBlock).not.toMatch(/e2e\/\.auth/);
    expect(pathBlock).not.toMatch(/user\.json/);
  });

  it("CI workflow skips cleanly on PR without secrets and fails fast on dispatch", () => {
    const wf = read(".github/workflows/quicklog-smoke.yml");
    // pull_request trigger present, scoped to verdant-grow-diary
    expect(wf).toMatch(/pull_request:\s*\n\s*branches:\s*\[verdant-grow-diary\]/);
    // Must never use the unsafe pull_request_target event
    expect(wf).not.toMatch(/pull_request_target/);
    // Precheck step id used to gate later steps
    expect(wf).toMatch(/id:\s*e2e_config/);
    expect(wf).toMatch(/steps\.e2e_config\.outputs\.should_run\s*==\s*'true'/);
    // Explicit non-secret skip message for PRs
    expect(wf).toContain(
      "Skipping Quick Log smoke: E2E vars/secrets are unavailable for this PR context.",
    );
    // Explicit fail-fast message for workflow_dispatch
    expect(wf).toContain(
      "Missing required Quick Log smoke configuration. Configure Actions vars/secrets.",
    );
    // Precheck distinguishes the two event kinds
    expect(wf).toMatch(/github\.event_name/);
    expect(wf).toMatch(/workflow_dispatch[\s\S]{0,400}pull_request/);
  });

  it("CI workflow path filters are exact for push and pull_request", () => {
    const wf = read(".github/workflows/quicklog-smoke.yml");
    const expectedPaths = [
      'e2e/**',
      'playwright.config.ts',
      '.github/workflows/quicklog-smoke.yml',
    ];
    // Extract paths: blocks that use list items (not the pipe block used by upload-artifact)
    const pathBlocks = Array.from(wf.matchAll(/paths:\s*\n((?:\s+-\s+".+"\n)+)/g));
    expect(pathBlocks.length).toBeGreaterThanOrEqual(2); // push + pull_request
    for (const [, block] of pathBlocks) {
      for (const p of expectedPaths) {
        expect(block).toContain(`- "${p}"`);
      }
      // Must not contain unexpected extra paths
      const lines = block.split('\n').filter(l => l.trim().startsWith('-'));
      expect(lines.map(l => l.trim())).toEqual(
        expectedPaths.map(p => `- "${p}"`),
      );
    }
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

  it("README documents required config, artifact paths/retention, and troubleshooting", () => {
    const readme = read("e2e/README.md");
    for (const token of [
      "E2E_BASE_URL",
      "E2E_GROW_1_PLANT_URL",
      "E2E_GROW_2_PLANT_NAME",
      "E2E_TEST_EMAIL",
      "E2E_TEST_PASSWORD",
      "quicklog-smoke-artifacts",
      "e2e/results/quicklog-smoke-report.json",
      "e2e/results/quicklog-smoke-report.txt",
      "playwright-report/",
      "test-results/",
      "30 days",
    ]) {
      expect(readme, `README missing reference: ${token}`).toContain(token);
    }
    // Troubleshooting section with the documented failure cases.
    expect(readme).toMatch(/##\s+Troubleshooting Quick Log smoke failures/);
    for (const phrase of [
      "Missing GitHub variable or secret",
      "Redirected to `/auth`",
      "Cannot find Grow #1 plant page",
      "Cannot find Grow #2 / target plant",
      "Stale snapshot helper missing",
      "Watering validation focus failed",
      "Report says a later step failed after save",
      "How to read the report",
    ]) {
      expect(readme, `README missing troubleshooting phrase: ${phrase}`).toContain(phrase);
    }
  });

  it("README documents local Quick Log smoke reproduction commands", () => {
    const readme = read("e2e/README.md");
    expect(readme).toMatch(/##\s+Run the Quick Log smoke locally/);
    // Required scripts referenced verbatim
    for (const cmd of [
      "bun run e2e:install",
      "bun run e2e:setup",
      "bun run e2e:quicklog-smoke",
      "bun run e2e:quicklog-smoke:headed",
    ]) {
      expect(readme, `README missing local command: ${cmd}`).toContain(cmd);
    }
    // PowerShell env var examples
    expect(readme).toMatch(/\$env:E2E_BASE_URL\s*=\s*"/);
    expect(readme).toMatch(/\$env:E2E_GROW_1_PLANT_URL\s*=\s*"/);
    expect(readme).toMatch(/\$env:E2E_TEST_EMAIL\s*=\s*"/);
    expect(readme).toMatch(/\$env:E2E_TEST_PASSWORD\s*=\s*"/);
    // Bash env var examples
    expect(readme).toMatch(/export E2E_BASE_URL="/);
    expect(readme).toMatch(/export E2E_GROW_1_PLANT_URL="/);
    expect(readme).toMatch(/export E2E_TEST_EMAIL="/);
    expect(readme).toMatch(/export E2E_TEST_PASSWORD="/);
    // Safety reminders
    expect(readme).toContain("e2e/.auth/user.json");
    expect(readme.toLowerCase()).toContain("test account");
  });

  it("CI workflow writes a GitHub Actions step summary with artifact + report pointers", () => {
    const wf = read(".github/workflows/quicklog-smoke.yml");
    // Summary step exists and always runs
    const summaryStep = wf.match(
      /-\s*name:\s*Write Quick Log smoke run summary[\s\S]*?(?=\n {6}- name:|\n*$)/,
    );
    expect(summaryStep, "summary step missing").toBeTruthy();
    const block = summaryStep![0];
    expect(block).toMatch(/if:\s*always\(\)/);
    expect(block).toMatch(/\$GITHUB_STEP_SUMMARY/);
    expect(block).toContain("quicklog-smoke-artifacts");
    expect(block).toContain("e2e/results/quicklog-smoke-report.json");
    expect(block).toContain("e2e/results/quicklog-smoke-report.txt");
    expect(block).toContain("playwright-report/");
    expect(block).toContain("test-results/");
    expect(block).toMatch(/30 days/);
    expect(block).toMatch(/should_run/);
    // Must not echo or expand secret values into the summary
    expect(block).not.toMatch(/secrets\.E2E_TEST_PASSWORD/);
    expect(block).not.toMatch(/secrets\.E2E_TEST_EMAIL/);
    expect(block).not.toMatch(/\$E2E_TEST_PASSWORD\b/);
    expect(block).not.toMatch(/\$E2E_TEST_EMAIL\b/);
  });

  it("changelog entry for branch alignment lives in a single canonical file", () => {
    // No pre-existing release-notes file existed in the repo, so the entry
    // lives in root CHANGELOG.md. If/when a canonical release-notes file is
    // adopted, move the entry there and update this guardrail.
    const canonicalCandidates = [
      "docs/CHANGELOG.md",
      "RELEASE_NOTES.md",
      "docs/RELEASE_NOTES.md",
      "docs/release-notes.md",
    ];
    const existingCanonical = canonicalCandidates.filter((p) =>
      fs.existsSync(path.join(ROOT, p)),
    );
    const rootChangelogExists = fs.existsSync(path.join(ROOT, "CHANGELOG.md"));
    expect(
      existingCanonical.length > 0 || rootChangelogExists,
      "expected a changelog/release-notes file to host the branch-alignment entry",
    ).toBe(true);
    const target = existingCanonical[0]
      ? read(existingCanonical[0])
      : read("CHANGELOG.md");
    expect(target).toMatch(/verdant-grow-diary/);
    expect(target.toLowerCase()).toContain("quick log");
  });
});
