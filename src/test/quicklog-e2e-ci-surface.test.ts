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

  it("CI workflow has NO schedule/cron trigger (no automated writes to a real grow)", () => {
    const wf = read(".github/workflows/quicklog-smoke.yml");
    // The smoke creates real diary entries. Until a disposable test fixture
    // exists, scheduled runs are unsafe and must not be enabled.
    expect(wf).not.toMatch(/^\s*schedule\s*:/m);
    expect(wf).not.toMatch(/-\s*cron\s*:/);
  });

  it("README warns smoke writes real diary entries and requires a dedicated test account/plant", () => {
    const readme = read("e2e/README.md");
    // Section header for the warning
    expect(readme).toMatch(/Test-fixture requirement|real-write warning/i);
    // Explicit real-write language
    expect(readme.toLowerCase()).toContain("creates real");
    expect(readme).toMatch(/diary entries/i);
    // Must warn against pointing at a real/active production grow
    expect(readme).toMatch(/real active grow|production grow|active production grow/i);
    expect(readme).toContain("E2E_GROW_1_PLANT_URL");
    // Dedicated test account and test plant required
    expect(readme.toLowerCase()).toContain("dedicated test account");
    expect(readme.toLowerCase()).toContain("test plant");
    // Manual-only until a disposable test fixture exists
    expect(readme).toMatch(/manual(ly)?\s+only|run the workflow\s+manually\s+only/i);
    expect(readme.toLowerCase()).toContain("disposable test fixture");
    // No scheduled/nightly trigger is enabled
    expect(readme).toMatch(/no\s+(scheduled|nightly)/i);
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
    // Locate the upload step's path: block, stopping at the next step or EOF.
    const uploadMatch = wf.match(
      /name:\s*quicklog-smoke-artifacts[\s\S]*?path:\s*\|\n([\s\S]*?)(?=\n\s*-\s*name:|\n[^\s-]|\n\s*$|$)/,
    );
    expect(uploadMatch, "could not locate quicklog-smoke-artifacts path block").toBeTruthy();
    const pathBlock = uploadMatch![1];
    const paths = pathBlock
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("-") /* skip nothing */ || l.length > 0)
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
    // Must not expand secret VALUES into the summary (names-as-documentation are fine)
    expect(block).not.toMatch(/\$\{\{\s*secrets\.E2E_TEST_PASSWORD\s*\}\}/);
    expect(block).not.toMatch(/\$\{\{\s*secrets\.E2E_TEST_EMAIL\s*\}\}/);
    expect(block).not.toMatch(/\$E2E_TEST_PASSWORD\b/);
    expect(block).not.toMatch(/\$E2E_TEST_EMAIL\b/);
  });

  it("CI workflow summary clearly describes skipped runs with required config names", () => {
    const wf = read(".github/workflows/quicklog-smoke.yml");
    const summaryStep = wf.match(
      /-\s*name:\s*Write Quick Log smoke run summary[\s\S]*?(?=\n {6}- name:|\n*$)/,
    );
    expect(summaryStep, "summary step missing").toBeTruthy();
    const block = summaryStep![0];
    // Skip-path branch present
    expect(block).toMatch(/Smoke executed: no \(skipped\)/);
    expect(block).toMatch(/Missing required Quick Log smoke configuration prevented execution/);
    // Required config NAMES listed (never values)
    for (const name of [
      "vars.E2E_BASE_URL",
      "vars.E2E_GROW_1_PLANT_URL",
      "secrets.E2E_TEST_EMAIL",
      "secrets.E2E_TEST_PASSWORD",
    ]) {
      expect(block, `summary missing required config name: ${name}`).toContain(name);
    }
    // Event-specific skip wording
    expect(block).toMatch(/pull_request/);
    expect(block).toMatch(/clean skip/);
    expect(block).toMatch(/workflow_dispatch[\s\S]*fails fast/);
    // Sanitized per-run missing list is consumed (names only)
    expect(block).toContain("MISSING_CONFIG");
    // Never expand secret VALUES into the summary
    expect(block).not.toMatch(/\$\{\{\s*secrets\.E2E_TEST_(EMAIL|PASSWORD)\s*\}\}/);
    expect(block).not.toMatch(/\$E2E_TEST_PASSWORD\b/);
    expect(block).not.toMatch(/\$E2E_TEST_EMAIL\b/);
  });

  it("CI workflow precheck exposes sanitized missing_config names only", () => {
    const wf = read(".github/workflows/quicklog-smoke.yml");
    const precheck = wf.match(
      /-\s*name:\s*Verify required configuration[\s\S]*?(?=\n {6}- name:)/,
    );
    expect(precheck, "precheck step missing").toBeTruthy();
    const block = precheck![0];
    expect(block).toMatch(/missing_config=.*>>\s*"\$GITHUB_OUTPUT"/);
    // Only NAMES (vars.*/secrets.*) appear in the missing array, never values
    expect(block).toContain('"vars.E2E_BASE_URL"');
    expect(block).toContain('"vars.E2E_GROW_1_PLANT_URL"');
    expect(block).toContain('"secrets.E2E_TEST_EMAIL"');
    expect(block).toContain('"secrets.E2E_TEST_PASSWORD"');
    // Must not echo secret VALUES
    expect(block).not.toMatch(/echo[^\n]*\$E2E_TEST_(EMAIL|PASSWORD)\b/);
    expect(block).not.toMatch(/echo[^\n]*\$\{\{\s*secrets\./);
  });

  it("CI workflow has a Verify Quick Log smoke artifacts guard that fails on missing required outputs", () => {
    const wf = read(".github/workflows/quicklog-smoke.yml");
    const verifyStep = wf.match(
      /-\s*name:\s*Verify Quick Log smoke artifacts[\s\S]*?(?=\n {6}- name:)/,
    );
    expect(verifyStep, "Verify Quick Log smoke artifacts step missing").toBeTruthy();
    const block = verifyStep![0];
    // Runs only when smoke actually executed, but on always() so post-failure still verifies
    expect(block).toMatch(/if:\s*always\(\)\s*&&\s*steps\.e2e_config\.outputs\.should_run\s*==\s*'true'/);
    // Required artifact checks
    expect(block).toContain("e2e/results/quicklog-smoke-report.json");
    expect(block).toContain("playwright-report");
    // Must be able to fail the job
    expect(block).toMatch(/exit\s+"?\$?\{?status\}?"?|exit\s+1/);
    expect(block).toMatch(/status=1/);
    // Optional warnings, not failures
    expect(block).toMatch(/WARN:[\s\S]*quicklog-smoke-report\.txt/);
    expect(block).toMatch(/WARN:[\s\S]*test-results/);
  });

  it("CI workflow upload step still uses if: always() && should_run == 'true' and retains 30-day retention", () => {
    const wf = read(".github/workflows/quicklog-smoke.yml");
    const uploadStep = wf.match(
      /-\s*name:\s*Upload smoke artifacts[\s\S]*?(?=\n {6}- name:)/,
    );
    expect(uploadStep, "upload step missing").toBeTruthy();
    const block = uploadStep![0];
    expect(block).toMatch(/if:\s*always\(\)\s*&&\s*steps\.e2e_config\.outputs\.should_run\s*==\s*'true'/);
    expect(block).toMatch(/retention-days:\s*30/);
    expect(block).toContain("quicklog-smoke-artifacts");
  });

  it("README documents manual workflow_dispatch run from GitHub Actions", () => {
    const readme = read("e2e/README.md");
    expect(readme).toMatch(/##\s+Run from GitHub Actions manually/);
    // Exact required steps
    expect(readme).toContain("Verdant-OS/verdant-grow-diary");
    expect(readme).toMatch(/Actions/);
    expect(readme).toMatch(/Quick Log Playwright smoke/);
    expect(readme).toMatch(/Run workflow/);
    expect(readme).toContain("verdant-grow-diary");
    // Required config names listed near dispatch docs
    for (const token of [
      "E2E_BASE_URL",
      "E2E_GROW_1_PLANT_URL",
      "E2E_TEST_EMAIL",
      "E2E_TEST_PASSWORD",
    ]) {
      expect(readme, `README dispatch docs missing: ${token}`).toContain(token);
    }
    // Summary + artifact location documentation
    expect(readme.toLowerCase()).toContain("github_step_summary".replace("_", "_"));
    expect(readme).toContain("$GITHUB_STEP_SUMMARY");
    expect(readme).toContain("quicklog-smoke-artifacts");
    // First file to inspect explicitly called out
    expect(readme).toMatch(/First file to inspect[\s\S]{0,80}quicklog-smoke-report\.txt/);
    // Fail-fast message for dispatch is documented
    expect(readme).toContain(
      "Missing required Quick Log smoke configuration. Configure Actions vars/secrets.",
    );
  });

  it("root README has Quick Log smoke badge with Workflow + Latest run quick links and no fake artifact URL", () => {
    const readme = read("README.md");
    expect(readme).toMatch(
      /actions\/workflows\/quicklog-smoke\.yml\/badge\.svg\?branch=verdant-grow-diary/,
    );
    // Workflow link
    expect(readme).toMatch(
      /\[Workflow\]\(https:\/\/github\.com\/Verdant-OS\/verdant-grow-diary\/actions\/workflows\/quicklog-smoke\.yml\)/,
    );
    // Latest run link, branch-filtered
    expect(readme).toMatch(
      /\[Latest run\]\(https:\/\/github\.com\/Verdant-OS\/verdant-grow-diary\/actions\/workflows\/quicklog-smoke\.yml\?query=branch%3Averdant-grow-diary\)/,
    );
    // Mentions where artifacts live
    expect(readme).toContain("quicklog-smoke-artifacts");
    // Must NOT hardcode a fake direct artifact download URL
    expect(readme).not.toMatch(/\/actions\/runs\/\d+\/artifacts\/\d+/);
    expect(readme).not.toMatch(/artifact[s]?\/[A-Fa-f0-9-]{8,}/);
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

  it("CI workflow summary includes Workflow run + Artifacts links built from GitHub context", () => {
    const wf = read(".github/workflows/quicklog-smoke.yml");
    // RUN_URL/ARTIFACTS_URL must be derived from github context, not hardcoded
    expect(wf).toMatch(
      /RUN_URL:\s*\$\{\{\s*github\.server_url\s*\}\}\/\$\{\{\s*github\.repository\s*\}\}\/actions\/runs\/\$\{\{\s*github\.run_id\s*\}\}/,
    );
    expect(wf).toMatch(
      /ARTIFACTS_URL:\s*\$\{\{\s*github\.server_url\s*\}\}\/\$\{\{\s*github\.repository\s*\}\}\/actions\/runs\/\$\{\{\s*github\.run_id\s*\}\}#artifacts/,
    );
    const summaryStep = wf.match(
      /-\s*name:\s*Write Quick Log smoke run summary[\s\S]*?(?=\n {6}- name:|\n*$)/,
    );
    expect(summaryStep, "summary step missing").toBeTruthy();
    const block = summaryStep![0];
    expect(block).toMatch(/\[Workflow run\]\(\$\{RUN_URL\}\)/);
    expect(block).toMatch(/\[Artifacts\]\(\$\{ARTIFACTS_URL\}\)/);
    // No hardcoded run ids or invented direct download URLs
    expect(block).not.toMatch(/runs\/\d{3,}/);
    expect(block).not.toMatch(/\/artifacts\/\d+/);
  });

  it("CI workflow summary includes smoke command, browser, Playwright version, and counts (with fallback)", () => {
    const wf = read(".github/workflows/quicklog-smoke.yml");
    const summaryStep = wf.match(
      /-\s*name:\s*Write Quick Log smoke run summary[\s\S]*?(?=\n {6}- name:|\n*$)/,
    );
    const block = summaryStep![0];
    expect(block).toContain("bun run e2e:quicklog-smoke");
    expect(block).toMatch(/Browser:\s*\\`chromium\\`/);
    expect(block).toContain("PLAYWRIGHT_VERSION");
    // Counts table fields
    expect(block).toContain("SMOKE_TOTAL");
    expect(block).toContain("SMOKE_PASSED");
    expect(block).toContain("SMOKE_FAILED");
    expect(block).toContain("SMOKE_SKIPPED");
    // Fallback wording when report JSON is missing
    expect(block).toContain("Smoke counts unavailable: report JSON was not produced.");
  });

  it("CI workflow has a metadata-capture step that parses report JSON without masking failures", () => {
    const wf = read(".github/workflows/quicklog-smoke.yml");
    const metaStep = wf.match(
      /-\s*name:\s*Capture Quick Log smoke metadata[\s\S]*?(?=\n {6}- name:)/,
    );
    expect(metaStep, "metadata-capture step missing").toBeTruthy();
    const block = metaStep![0];
    expect(block).toMatch(/id:\s*smoke_meta/);
    expect(block).toMatch(/if:\s*always\(\)\s*&&\s*steps\.e2e_config\.outputs\.should_run\s*==\s*'true'/);
    expect(block).toContain("bunx playwright --version");
    expect(block).toContain("e2e/results/quicklog-smoke-report.json");
    expect(block).toMatch(/smoke_counts_available=(true|false)/);
    // Must not mask Playwright failure: this step always exits 0
    expect(block).toMatch(/exit\s+0/);
    expect(block).toMatch(/set \+e/);
  });

  it("CI workflow has Bun and Playwright browser caches with safe scope", () => {
    const wf = read(".github/workflows/quicklog-smoke.yml");
    // Playwright browser cache
    const pwCache = wf.match(
      /-\s*name:\s*Cache Playwright browsers[\s\S]*?(?=\n {6}- name:)/,
    );
    expect(pwCache, "Playwright browser cache step missing").toBeTruthy();
    const pwBlock = pwCache![0];
    expect(pwBlock).toMatch(/uses:\s*actions\/cache@v4/);
    expect(pwBlock).toContain("~/.cache/ms-playwright");
    expect(pwBlock).toMatch(/\$\{\{\s*runner\.os\s*\}\}-playwright-/);
    expect(pwBlock).toMatch(/hashFiles\(\s*'bun\.lock',\s*'bun\.lockb',\s*'package\.json'\s*\)/);

    // Bun cache
    const bunCache = wf.match(
      /-\s*name:\s*Cache Bun packages[\s\S]*?(?=\n {6}- name:)/,
    );
    expect(bunCache, "Bun cache step missing").toBeTruthy();
    const bunBlock = bunCache![0];
    expect(bunBlock).toMatch(/uses:\s*actions\/cache@v4/);
    expect(bunBlock).toContain("~/.bun/install/cache");

    // Neither cache may include sensitive or output paths
    for (const block of [pwBlock, bunBlock]) {
      expect(block).not.toMatch(/e2e\/\.auth/);
      expect(block).not.toMatch(/e2e\/results/);
      expect(block).not.toMatch(/test-results/);
      expect(block).not.toMatch(/playwright-report/);
      expect(block).not.toMatch(/storageState|user\.json/);
      expect(block).not.toMatch(/secrets\.E2E_/);
    }
  });

  it("CI workflow still has no schedule/cron and no pull_request_target", () => {
    const wf = read(".github/workflows/quicklog-smoke.yml");
    expect(wf).not.toMatch(/^\s*schedule\s*:/m);
    expect(wf).not.toMatch(/-\s*cron\s*:/);
    expect(wf).not.toMatch(/pull_request_target/);
  });

  it("README documents summary links, smoke counts, browser/Playwright info, and cache safety", () => {
    const readme = read("e2e/README.md");
    expect(readme).toMatch(/##\s+Run summary, smoke metadata, and caches/);
    expect(readme).toContain("[Workflow run]");
    expect(readme).toContain("[Artifacts]");
    expect(readme).toContain("#artifacts");
    expect(readme).toContain("bun run e2e:quicklog-smoke");
    expect(readme).toContain("`chromium`");
    expect(readme).toMatch(/Playwright version/i);
    expect(readme).toContain("bunx playwright --version");
    expect(readme).toContain("Smoke counts unavailable: report JSON was not produced.");
    expect(readme).toContain("~/.cache/ms-playwright");
    expect(readme).toContain("~/.bun/install/cache");
    // Cache exclusions documented
    expect(readme).toContain("e2e/.auth");
    expect(readme).toContain("e2e/results");
    expect(readme).toContain("test-results");
    expect(readme).toContain("playwright-report");
    // No scheduled smoke reaffirmation
    expect(readme).toMatch(/no scheduled or nightly/i);
  });
});
